const GlobalUser = require('../models/GlobalUser');
const Transaction = require('../models/Transaction');
const asyncHandler = require('../middleware/asyncHandler');
const { validateAdMobSsvParams } = require('../utils/admobSsv');

const DAILY_AD_CAP = 20;
const REWARD_AMOUNT = 1;

/**
 * Reset adsWatchedToday if the date has changed (new day).
 * @param {import('mongoose').Document} user
 */
function resetDailyAdCountIfNewDay(user) {
  const now = new Date();
  const last = user.lastAdWatchDate;
  if (!last) return;
  const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (lastDate.getTime() !== today.getTime()) {
    user.adsWatchedToday = 0;
  }
}

/**
 * GET /api/admob/reward
 * AdMob SSV callback: user_id, reward_amount, signature, key_id (query params).
 * Only backend SSV grants gold; frontend must not grant rewards.
 */
const reward = asyncHandler(async (req, res) => {
  const { user_id, reward_amount, signature, key_id } = req.query;
  const ssv = validateAdMobSsvParams({ user_id, reward_amount, signature, key_id });
  if (!ssv.valid) {
    return res.status(400).json({
      success: false,
      message: ssv.message || 'Invalid SSV params',
      data: {},
    });
  }

  const user = await GlobalUser.findById(user_id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      data: {},
    });
  }

  if (user.isPremium) {
    return res.status(200).json({
      success: true,
      message: 'Premium user; no reward needed',
      data: { goldPoints: user.goldPoints, rewarded: false },
    });
  }

  resetDailyAdCountIfNewDay(user);
  if (user.adsWatchedToday >= DAILY_AD_CAP) {
    return res.status(429).json({
      success: false,
      message: 'Daily ad limit reached (max 20 per day)',
      data: { adsWatchedToday: user.adsWatchedToday, remaining: 0 },
    });
  }

  const amount = Math.min(Number(reward_amount), REWARD_AMOUNT);
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

  return res.status(200).json({
    success: true,
    message: 'Reward granted',
    data: {
      goldPoints: user.goldPoints,
      adsWatchedToday: user.adsWatchedToday,
      remainingAdsToday: DAILY_AD_CAP - user.adsWatchedToday,
    },
  });
});

module.exports = { reward };
