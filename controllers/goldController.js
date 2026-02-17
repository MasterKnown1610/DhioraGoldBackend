const GlobalUser = require('../models/GlobalUser');
const Shop = require('../models/Shop');
const Transaction = require('../models/Transaction');
const asyncHandler = require('../middleware/asyncHandler');

const COSTS = {
  unlock_phone: 2,
  boost_shop: 10,
  remove_ads: 5,
};
const BOOST_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AD_FREE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DAILY_AD_CAP = 20;
const REWARD_AMOUNT = 1;

function standardResponse(res, status, success, message, data = {}) {
  return res.status(status).json({ success, message, data });
}

/**
 * Deduct gold and record spend transaction. Call only when balance is sufficient and not premium.
 */
async function deductGold(userId, amount, source) {
  const user = await GlobalUser.findById(userId);
  if (!user || user.goldPoints < amount) return null;
  user.goldPoints -= amount;
  await user.save();
  await Transaction.create({
    user: userId,
    type: 'spend',
    amount,
    source,
  });
  return user;
}

/**
 * POST /api/gold/unlock-phone
 * Deduct 2 gold points; record transaction. Premium: no deduction.
 */
const unlockPhone = asyncHandler(async (req, res) => {
  const user = req.user;
  const cost = COSTS.unlock_phone;

  if (user.isPremium) {
    return standardResponse(res, 200, true, 'Premium: unlock granted without deduction', {
      goldPoints: user.goldPoints,
      unlocked: true,
    });
  }

  if (user.goldPoints < cost) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {
      goldPoints: user.goldPoints,
      required: cost,
    });
  }

  const updated = await deductGold(user._id, cost, 'unlock_phone');
  if (!updated) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {});
  }

  return standardResponse(res, 200, true, 'Phone unlocked', {
    goldPoints: updated.goldPoints,
    transaction: { type: 'spend', amount: cost, source: 'unlock_phone' },
  });
});

/**
 * POST /api/gold/boost-shop
 * Deduct 10 gold points; set boostExpires on user's shop. Premium: no deduction.
 */
const boostShop = asyncHandler(async (req, res) => {
  const user = req.user;
  const cost = COSTS.boost_shop;

  if (user.isPremium) {
    const shop = await Shop.findOne({ globalUserRef: user._id });
    let boostExpires = null;
    if (shop) {
      boostExpires = new Date(Date.now() + BOOST_DURATION_MS);
      shop.boostExpires = boostExpires;
      await shop.save();
    }
    return standardResponse(res, 200, true, 'Premium: shop boost applied without deduction', {
      goldPoints: user.goldPoints,
      boostExpires,
    });
  }

  if (user.goldPoints < cost) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {
      goldPoints: user.goldPoints,
      required: cost,
    });
  }

  const shop = await Shop.findOne({ globalUserRef: user._id });
  if (!shop) {
    return standardResponse(res, 404, false, 'Shop profile not found', {});
  }

  const updated = await deductGold(user._id, cost, 'boost_shop');
  if (!updated) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {});
  }

  const expires = new Date(Date.now() + BOOST_DURATION_MS);
  shop.boostExpires = expires;
  await shop.save();

  return standardResponse(res, 200, true, 'Shop boost applied', {
    goldPoints: updated.goldPoints,
    boostExpires: expires,
    transaction: { type: 'spend', amount: cost, source: 'boost_shop' },
  });
});

/**
 * POST /api/gold/remove-ads
 * Deduct 5 gold points; set adFreeUntil on user. Premium: no deduction.
 */
const removeAds = asyncHandler(async (req, res) => {
  const user = req.user;
  const cost = COSTS.remove_ads;

  if (user.isPremium) {
    return standardResponse(res, 200, true, 'Premium: ads already removed', {
      goldPoints: user.goldPoints,
      adFreeUntil: user.adFreeUntil,
    });
  }

  if (user.goldPoints < cost) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {
      goldPoints: user.goldPoints,
      required: cost,
    });
  }

  const updated = await deductGold(user._id, cost, 'remove_ads');
  if (!updated) {
    return standardResponse(res, 400, false, 'Insufficient gold points', {});
  }

  const adFreeUntil = new Date(Date.now() + AD_FREE_DURATION_MS);
  updated.adFreeUntil = adFreeUntil;
  await updated.save();

  return standardResponse(res, 200, true, 'Ads removed for 30 days', {
    goldPoints: updated.goldPoints,
    adFreeUntil,
    transaction: { type: 'spend', amount: cost, source: 'remove_ads' },
  });
});

/**
 * Reset adsWatchedToday if the date has changed (new day).
 * @param {import('mongoose').Document} user
 */
function resetDailyAdCountIfNewDay(user) {
  const last = user.lastAdWatchDate;
  if (!last) return;
  const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (lastDate.getTime() !== todayStart.getTime()) {
    user.adsWatchedToday = 0;
  }
}

/**
 * Compute adsWatchedToday and remainingAdsToday for a user (respects new-day reset).
 * @param {import('mongoose').Document} user
 * @returns {{ adsWatchedToday: number, remainingAdsToday: number }}
 */
function getAdsTodayStats(user) {
  let adsWatchedToday = user.adsWatchedToday;
  const lastAd = user.lastAdWatchDate;
  if (lastAd) {
    const lastDate = new Date(lastAd.getFullYear(), lastAd.getMonth(), lastAd.getDate());
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (lastDate.getTime() !== todayStart.getTime()) {
      adsWatchedToday = 0;
    }
  }
  const remainingAdsToday = Math.max(0, DAILY_AD_CAP - adsWatchedToday);
  return { adsWatchedToday, remainingAdsToday };
}

/**
 * GET /api/gold/wallet
 * Returns current gold, ads today, remaining ads, and paginated transaction history.
 */
const getWallet = asyncHandler(async (req, res) => {
  const user = req.user;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const { adsWatchedToday, remainingAdsToday } = getAdsTodayStats(user);

  const [transactions, total] = await Promise.all([
    Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments({ user: user._id }),
  ]);

  return standardResponse(res, 200, true, 'Wallet retrieved', {
    goldPoints: user.goldPoints,
    adsWatchedToday,
    remainingAdsToday,
    isPremium: user.isPremium,
    adFreeUntil: user.adFreeUntil,
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * POST /api/gold/ad-watched
 * Called by the app when the user has completed a rewarded ad (e.g. onEarnedReward).
 * Credits 1 gold, increments adsWatchedToday, and returns the updated wallet so the
 * frontend can show the new balance without a separate getWallet call.
 * SSV may still credit in production; this endpoint allows immediate credit when
 * the client reports ad completion (e.g. when SSV is not yet or not used).
 */
const creditAdWatched = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.isPremium) {
    const { adsWatchedToday, remainingAdsToday } = getAdsTodayStats(user);
    return standardResponse(res, 200, true, 'Premium user; no reward needed', {
      goldPoints: user.goldPoints,
      adsWatchedToday,
      remainingAdsToday,
      isPremium: true,
      adFreeUntil: user.adFreeUntil,
      transactions: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    });
  }

  resetDailyAdCountIfNewDay(user);
  if (user.adsWatchedToday >= DAILY_AD_CAP) {
    const { remainingAdsToday } = getAdsTodayStats(user);
    return res.status(429).json({
      success: false,
      message: 'Daily ad limit reached (max 20 per day)',
      data: {
        goldPoints: user.goldPoints,
        adsWatchedToday: user.adsWatchedToday,
        remainingAdsToday,
      },
    });
  }

  const amount = REWARD_AMOUNT;
  user.goldPoints += amount;
  user.adsWatchedToday += 1;
  user.lastAdWatchDate = new Date();
  await user.save();

  await Transaction.create({
    user: user._id,
    type: 'earn',
    amount,
    source: 'reward_ad',
  });

  const page = 1;
  const limit = 20;
  const skip = 0;
  const [transactions, total] = await Promise.all([
    Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments({ user: user._id }),
  ]);

  const { adsWatchedToday, remainingAdsToday } = getAdsTodayStats(user);

  return standardResponse(res, 200, true, 'Reward granted', {
    goldPoints: user.goldPoints,
    adsWatchedToday,
    remainingAdsToday,
    isPremium: user.isPremium,
    adFreeUntil: user.adFreeUntil,
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

module.exports = {
  unlockPhone,
  boostShop,
  removeAds,
  getWallet,
  creditAdWatched,
};
