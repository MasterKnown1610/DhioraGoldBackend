const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const { paginate } = require('../utils/pagination');
const { buildSearchFilter, buildQueryFilters } = require('../utils/search');
const { uploadToCloudinary } = require('../middleware/upload');

const USER_SEARCH_FIELDS = ['userName', 'address', 'pincode', 'district', 'serviceProvided'];
const USER_FILTER_KEYS = ['state', 'district', 'pincode'];

const toPublicUser = (user, showPhone = false) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  if (!showPhone) delete obj.phoneNumber;
  return obj;
};

/**
 * @route   POST /api/users
 * @body    userName, serviceProvided, address?, state?, district?, pincode?, phoneNumber?
 * @file    image (profileImage)
 */
exports.registerUser = asyncHandler(async (req, res) => {
  const { userName, serviceProvided, address, state, district, pincode, phoneNumber } = req.body;

  let profileImage = null;
  if (req.file && req.file.buffer) {
    profileImage = await uploadToCloudinary(
      req.file.buffer,
      'goldbackend/users',
      req.file.mimetype
    );
  }

  const user = await User.create({
    userName,
    serviceProvided,
    address: address || undefined,
    state: state || undefined,
    district: district || undefined,
    pincode: pincode || undefined,
    phoneNumber: phoneNumber || undefined,
    profileImage,
  });

  res.status(201).json({
    success: true,
    data: toPublicUser(user, true),
  });
});

/**
 * @route   GET /api/users
 * @query   search, state, district, pincode, page, limit
 * Returns only service providers with valid subscription (subscriptionEndDate >= now).
 */
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { search, page, limit, state, district, pincode } = req.query;
  const searchFilter = buildSearchFilter(search, USER_SEARCH_FIELDS);
  const queryFilters = buildQueryFilters({ state, district, pincode }, USER_FILTER_KEYS);
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
  const query = User.find(filter).sort({ createdAt: -1 });

  const { data, pagination } = await paginate(query, { page, limit });
  const dataPublic = data.map((u) => toPublicUser(u, !!req.user));

  res.status(200).json({
    success: true,
    data: dataPublic,
    pagination,
  });
});

/**
 * @route   GET /api/users/all
 * Admin: returns ALL service providers (including expired subscription) for management.
 */
exports.getAllUsersAdmin = asyncHandler(async (req, res) => {
  const { search, page, limit, state, district, pincode } = req.query;
  const searchFilter = buildSearchFilter(search, USER_SEARCH_FIELDS);
  const queryFilters = buildQueryFilters({ state, district, pincode }, USER_FILTER_KEYS);
  const filter = { $and: [searchFilter, queryFilters].filter((o) => Object.keys(o).length > 0) };
  const query = User.find(Object.keys(filter).length ? filter : {}).sort({ createdAt: -1 });

  const { data, pagination } = await paginate(query, { page, limit });
  const dataPublic = data.map((u) => toPublicUser(u, true));

  res.status(200).json({
    success: true,
    data: dataPublic,
    pagination,
  });
});

/**
 * @route   GET /api/users/:id
 */
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.status(200).json({
    success: true,
    data: toPublicUser(user, !!req.user),
  });
});

/**
 * @route   PATCH /api/users/:id/subscription
 * Admin: extend or set subscription end date. Body: { extendDays: number } or { subscriptionEndDate: ISO string }
 */
exports.updateSubscription = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
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
    const base = user.subscriptionEndDate && user.subscriptionEndDate > now ? user.subscriptionEndDate : now;
    endDate = new Date(base);
    endDate.setDate(endDate.getDate() + Number(extendDays));
  } else {
    return res.status(400).json({ success: false, message: 'Provide extendDays or subscriptionEndDate' });
  }
  user.subscriptionStartDate = user.subscriptionStartDate || now;
  user.subscriptionEndDate = endDate;
  await user.save();
  res.status(200).json({
    success: true,
    data: toPublicUser(user, true),
  });
});
