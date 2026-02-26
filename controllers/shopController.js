const Shop = require('../models/Shop');
const asyncHandler = require('../middleware/asyncHandler');
const { paginate } = require('../utils/pagination');
const { buildSearchFilter, buildQueryFilters } = require('../utils/search');
const { uploadMultiple, uploadToCloudinary } = require('../middleware/upload');

const SHOP_SEARCH_FIELDS = ['shopName', 'address', 'pincode', 'district', 'state'];
const SHOP_FILTER_KEYS = ['state', 'district', 'pincode'];

const toPublicShop = (shop, showPhone = false) => {
  const obj = shop.toObject ? shop.toObject() : { ...shop };
  if (!showPhone) {
    delete obj.phoneNumber;
    delete obj.whatsappNumber;
  }
  return obj;
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const parseOpeningHours = (raw) => {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed !== 'object') return undefined;
    const hours = {};
    for (const day of DAYS) {
      if (parsed[day] && (parsed[day].open || parsed[day].close)) {
        hours[day] = {
          open: String(parsed[day].open || '').trim() || undefined,
          close: String(parsed[day].close || '').trim() || undefined,
        };
      }
    }
    return Object.keys(hours).length ? hours : undefined;
  } catch {
    return undefined;
  }
};

/**
 * @route   POST /api/shops
 * @body    shopName, address, pincode, phoneNumber, whatsappNumber?, state, district, openingHours? (JSON)
 * @files   images (max 5)
 */
exports.registerShop = asyncHandler(async (req, res) => {
  const { shopName, address, pincode, phoneNumber, whatsappNumber, state, district, openingHours } = req.body;

  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    const uploads = req.files
      .slice(0, 5)
      .map((file) => uploadToCloudinary(file.buffer, 'goldbackend/shops', file.mimetype));
    imageUrls = await Promise.all(uploads);
  }

  const shop = await Shop.create({
    shopName,
    address,
    pincode,
    phoneNumber,
    whatsappNumber: whatsappNumber || undefined,
    state,
    district,
    images: imageUrls,
    openingHours: parseOpeningHours(openingHours),
  });

  res.status(201).json({
    success: true,
    data: toPublicShop(shop, true),
  });
});

/**
 * @route   GET /api/shops
 * @query   search, state, district, pincode, page, limit
 * Returns only shops with valid subscription (subscriptionEndDate >= now).
 * subscriptionEndDate is set only after payment is confirmed via Razorpay webhook (subscription.activated / subscription.charged).
 */
exports.getAllShops = asyncHandler(async (req, res) => {
  const { search, page, limit, ...rest } = req.query;
  const searchFilter = buildSearchFilter(search, SHOP_SEARCH_FIELDS);
  const queryFilters = buildQueryFilters(rest, SHOP_FILTER_KEYS);
  const now = new Date();
  const subscriptionFilter = { subscriptionEndDate: { $gte: now } };
  const statusFilter = { $or: [ { status: 'active' }, { status: { $exists: false } } ] };
  const filter = {
    $and: [
      subscriptionFilter,
      statusFilter,
      searchFilter,
      queryFilters,
    ].filter((o) => Object.keys(o).length > 0),
  };
  const query = Shop.find(filter).sort({ createdAt: -1 });

  const { data, pagination } = await paginate(query, { page, limit });
  const showPhone = !!req.user;
  const dataPublic = data.map((s) => toPublicShop(s, showPhone));

  res.status(200).json({
    success: true,
    data: dataPublic,
    pagination,
  });
});

/**
 * @route   GET /api/shops/all
 * Admin: returns ALL shops (including expired subscription) for management.
 */
exports.getAllShopsAdmin = asyncHandler(async (req, res) => {
  const { search, page, limit, ...rest } = req.query;
  const searchFilter = buildSearchFilter(search, SHOP_SEARCH_FIELDS);
  const queryFilters = buildQueryFilters(rest, SHOP_FILTER_KEYS);
  const filter = { $and: [searchFilter, queryFilters].filter((o) => Object.keys(o).length > 0) };
  const query = Shop.find(Object.keys(filter).length ? filter : {}).sort({ createdAt: -1 });

  const { data, pagination } = await paginate(query, { page, limit });
  const dataPublic = data.map((s) => toPublicShop(s, true));

  res.status(200).json({
    success: true,
    data: dataPublic,
    pagination,
  });
});

/**
 * @route   GET /api/shops/:id
 */
exports.getShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findById(req.params.id);
  if (!shop) {
    return res.status(404).json({ success: false, message: 'Shop not found' });
  }
  const showPhone = !!req.user;
  res.status(200).json({
    success: true,
    data: toPublicShop(shop, showPhone),
  });
});

/**
 * @route   PATCH /api/shops/:id/subscription
 * Admin: extend or set subscription end date. Body: { extendDays: number } or { subscriptionEndDate: ISO string }
 */
exports.updateSubscription = asyncHandler(async (req, res) => {
  const shop = await Shop.findById(req.params.id);
  if (!shop) {
    return res.status(404).json({ success: false, message: 'Shop not found' });
  }
  const { extendDays, subscriptionEndDate } = req.body;
  const now = new Date();
  let endDate;
  if (subscriptionEndDate) {
    endDate = new Date(subscriptionEndDate);
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid subscriptionEndDate' });
    }
  } else if (extendDays != null && Number.isFinite(Number(extendDays))) {
    const base = shop.subscriptionEndDate && shop.subscriptionEndDate > now ? shop.subscriptionEndDate : now;
    endDate = new Date(base);
    endDate.setDate(endDate.getDate() + Number(extendDays));
  } else {
    return res.status(400).json({ success: false, message: 'Provide extendDays or subscriptionEndDate' });
  }
  shop.subscriptionStartDate = shop.subscriptionStartDate || now;
  shop.subscriptionEndDate = endDate;
  await shop.save();
  res.status(200).json({
    success: true,
    data: toPublicShop(shop, true),
  });
});
