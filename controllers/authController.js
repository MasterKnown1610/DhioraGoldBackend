const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const GlobalUser = require('../models/GlobalUser');
const User = require('../models/User');
const Shop = require('../models/Shop');
const asyncHandler = require('../middleware/asyncHandler');
const { uploadToCloudinary } = require('../middleware/upload');

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const generateReferralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

async function ensureReferralCode(globalUser) {
  if (globalUser.referralCode) return globalUser.referralCode;
  let code = generateReferralCode();
  let exists = await GlobalUser.findOne({ referralCode: code });
  while (exists) {
    code = generateReferralCode();
    exists = await GlobalUser.findOne({ referralCode: code });
  }
  globalUser.referralCode = code;
  await globalUser.save();
  return code;
}
exports.ensureReferralCode = ensureReferralCode;

/**
 * @route   POST /api/auth/register
 * @body    name, email?, phoneNumber?, password, referralCode? (at least one of email or phoneNumber)
 */
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phoneNumber, password, referralCode: refCode } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Either email or phoneNumber is required',
    });
  }

  const existing = await GlobalUser.findOne({
    $or: [
      ...(email ? [{ email }] : []),
      ...(phoneNumber ? [{ phoneNumber }] : []),
    ].filter(Boolean),
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'User with this email or phone already exists',
    });
  }

  let referredBy = null;
  if (refCode && typeof refCode === 'string' && refCode.trim()) {
    const referrer = await GlobalUser.findOne({ referralCode: refCode.trim().toUpperCase() });
    if (referrer) referredBy = referrer._id;
  }

  const user = await GlobalUser.create({
    name,
    email: email || undefined,
    phoneNumber: phoneNumber || undefined,
    password,
    referredBy: referredBy || undefined,
  });

  // Referral points are awarded when the referred user pays (see webhookController: 1 pt for SERVICE, 5 pts for SHOP).

  const token = createToken(user._id);
  const referralCode = await ensureReferralCode(user);
  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        referralCode,
        referralBalance: user.referralBalance,
      },
      token,
    },
  });
});

/**
 * @route   POST /api/auth/login
 * @body    email? OR phoneNumber?, password
 * Returns user + userProfile (if linked) + shopProfile (if linked)
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, phoneNumber, password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }
  if (!email && !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Either email or phoneNumber is required',
    });
  }

  const query = email
    ? { email: email.trim().toLowerCase() }
    : { phoneNumber: phoneNumber.trim() };

  const user = await GlobalUser.findOne(query).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const payload = await buildAuthPayload(user);
  res.status(200).json({ success: true, data: payload });
});

/**
 * @route   GET /api/auth/me
 * Requires auth. Returns current user with linked userProfile and shopProfile.
 */
exports.getMe = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const payload = await buildAuthPayload(globalUser);
  delete payload.token;
  res.status(200).json({ success: true, data: payload });
});

async function buildAuthPayload(globalUser) {
  const referralCode = await ensureReferralCode(globalUser);
  const user = {
    id: globalUser._id,
    name: globalUser.name,
    email: globalUser.email,
    phoneNumber: globalUser.phoneNumber,
    referralCode,
    referralBalance: globalUser.referralBalance ?? 0,
    referralRefundRequestedAt: globalUser.referralRefundRequestedAt || null,
  };
  let userProfile = null;
  let shopProfile = null;
  if (globalUser.userProfileRef) {
    const up = await User.findById(globalUser.userProfileRef);
    if (up) userProfile = up.toObject();
  }
  if (globalUser.shopProfileRef) {
    const sp = await Shop.findById(globalUser.shopProfileRef);
    if (sp) shopProfile = sp.toObject();
  }
  return {
    user,
    userProfile,
    shopProfile,
    token: createToken(globalUser._id),
  };
}

/**
 * @route   POST /api/auth/register-service-provider
 * Requires auth. Email/phone are fixed from logged-in GlobalUser.
 * @body    userName, serviceProvided, address?, state?, district?, pincode?
 * @file    image (optional profile image)
 */
exports.registerServiceProvider = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  let phone = req.body.phoneNumber?.trim() || globalUser.phoneNumber?.trim() || null;
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required. Use your login number or enter one in the form.',
    });
  }

  if (globalUser.userProfileRef) {
    return res.status(400).json({
      success: false,
      message: 'You already have a service provider profile. Use edit to update.',
    });
  }

  const { userName, serviceProvided, address, state, district, city, pincode } = req.body;
  if (!userName?.trim() || !serviceProvided?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'userName and serviceProvided are required',
    });
  }
  if (!pincode?.trim() || !state?.trim() || !district?.trim() || !city?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'pincode, state, district and city are required',
    });
  }

  const existingByPhone = phone ? await User.findOne({ phoneNumber: phone }) : null;
  if (existingByPhone) {
    return res.status(400).json({
      success: false,
      message: 'A service provider profile already exists for this phone number',
    });
  }

  let profileImage = null;
  if (req.file && req.file.buffer) {
    profileImage = await uploadToCloudinary(req.file.buffer, 'goldbackend/users', req.file.mimetype);
  }

  const now = new Date();
  let subscriptionStart = null;
  let subscriptionEnd = null;
  if (globalUser.pendingUserSubscriptionEndDate && globalUser.pendingUserSubscriptionEndDate > now) {
    subscriptionEnd = globalUser.pendingUserSubscriptionEndDate;
    subscriptionStart = new Date(subscriptionEnd);
    subscriptionStart.setDate(subscriptionStart.getDate() - 30);
  }

  const userProfile = await User.create({
    userName: userName.trim(),
    serviceProvided: serviceProvided.trim(),
    phoneNumber: phone || undefined,
    address: address?.trim() || undefined,
    state: state.trim(),
    district: district.trim(),
    city: city.trim(),
    pincode: pincode.trim(),
    profileImage,
    globalUserRef: globalUser._id,
    subscriptionStartDate: subscriptionStart,
    subscriptionEndDate: subscriptionEnd,
  });

  globalUser.userProfileRef = userProfile._id;
  globalUser.pendingUserSubscriptionEndDate = undefined;
  await globalUser.save();

  const payload = await buildAuthPayload(globalUser);
  res.status(201).json({ success: true, data: payload });
});

/**
 * @route   PATCH /api/auth/service-provider
 * Requires auth. Updates own service provider profile.
 * @body    userName?, serviceProvided?, address?, state?, district?, pincode?
 * @file    image (optional - replaces profile image)
 */
exports.updateServiceProvider = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser || !globalUser.userProfileRef) {
    return res.status(404).json({
      success: false,
      message: 'You do not have a service provider profile. Register first.',
    });
  }

  const userProfile = await User.findById(globalUser.userProfileRef);
  if (!userProfile) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }

  const { userName, serviceProvided, address, state, district, city, pincode, phoneNumber } = req.body;
  if (userName?.trim()) userProfile.userName = userName.trim();
  if (serviceProvided?.trim()) userProfile.serviceProvided = serviceProvided.trim();
  if (address !== undefined) userProfile.address = address?.trim() || undefined;
  if (state !== undefined) userProfile.state = state?.trim() || undefined;
  if (district !== undefined) userProfile.district = district?.trim() || undefined;
  if (city !== undefined) userProfile.city = city?.trim() || undefined;
  if (pincode !== undefined) userProfile.pincode = pincode?.trim() || undefined;
  if (phoneNumber !== undefined) {
    userProfile.phoneNumber = phoneNumber?.trim() || globalUser.phoneNumber?.trim() || undefined;
  }

  if (req.file && req.file.buffer) {
    userProfile.profileImage = await uploadToCloudinary(req.file.buffer, 'goldbackend/users', req.file.mimetype);
  }

  await userProfile.save();
  const payload = await buildAuthPayload(globalUser);
  res.status(200).json({ success: true, data: payload });
});

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
 * @route   POST /api/auth/register-shop
 * Requires auth. Email/phone are fixed from logged-in GlobalUser.
 * @body    shopName, address, pincode, state, district, whatsappNumber?, openingHours?
 * @files   images (max 5)
 */
exports.registerShop = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  const phone = globalUser.phoneNumber?.trim() || null;
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Your account must have a phone number to register a shop. Please log in with a phone number.',
    });
  }

  if (globalUser.shopProfileRef) {
    return res.status(400).json({
      success: false,
      message: 'You already have a shop profile. Use edit to update.',
    });
  }

  const { shopName, address, pincode, whatsappNumber, state, district, city, openingHours } = req.body;
  if (!shopName?.trim() || !address?.trim() || !pincode?.trim() || !state?.trim() || !district?.trim() || !city?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'shopName, address, pincode, state, district and city are required',
    });
  }

  const existingShop = await Shop.findOne({ phoneNumber: phone });
  if (existingShop) {
    return res.status(400).json({
      success: false,
      message: 'A shop already exists for this phone number',
    });
  }

  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    const uploads = req.files
      .slice(0, 5)
      .map((f) => uploadToCloudinary(f.buffer, 'goldbackend/shops', f.mimetype));
    imageUrls = await Promise.all(uploads);
  }

  const now = new Date();
  let subscriptionStart = null;
  let subscriptionEnd = null;
  if (globalUser.pendingShopSubscriptionEndDate && globalUser.pendingShopSubscriptionEndDate > now) {
    subscriptionEnd = globalUser.pendingShopSubscriptionEndDate;
    subscriptionStart = new Date(subscriptionEnd);
    subscriptionStart.setDate(subscriptionStart.getDate() - 30);
  }

  const shopProfile = await Shop.create({
    shopName: shopName.trim(),
    address: address.trim(),
    pincode: pincode.trim(),
    phoneNumber: phone,
    whatsappNumber: whatsappNumber?.trim() || undefined,
    state: state.trim(),
    district: district.trim(),
    city: city.trim(),
    images: imageUrls,
    openingHours: parseOpeningHours(openingHours),
    globalUserRef: globalUser._id,
    subscriptionStartDate: subscriptionStart,
    subscriptionEndDate: subscriptionEnd,
  });

  globalUser.shopProfileRef = shopProfile._id;
  globalUser.pendingShopSubscriptionEndDate = undefined;
  await globalUser.save();

  const payload = await buildAuthPayload(globalUser);
  res.status(201).json({ success: true, data: payload });
});

/**
 * @route   PATCH /api/auth/shop
 * Requires auth. Updates own shop profile.
 * @body    shopName?, address?, pincode?, state?, district?, whatsappNumber?, openingHours?
 * @files   images (optional - replaces all images; omit to keep existing)
 */
exports.updateShop = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser || !globalUser.shopProfileRef) {
    return res.status(404).json({
      success: false,
      message: 'You do not have a shop profile. Register first.',
    });
  }

  const shopProfile = await Shop.findById(globalUser.shopProfileRef);
  if (!shopProfile) {
    return res.status(404).json({ success: false, message: 'Shop not found' });
  }

  const { shopName, address, pincode, whatsappNumber, state, district, city, openingHours } = req.body;
  if (shopName?.trim()) shopProfile.shopName = shopName.trim();
  if (address?.trim()) shopProfile.address = address.trim();
  if (pincode?.trim()) shopProfile.pincode = pincode.trim();
  if (state?.trim()) shopProfile.state = state.trim();
  if (district?.trim()) shopProfile.district = district.trim();
  if (city !== undefined) shopProfile.city = city?.trim() || undefined;
  if (whatsappNumber !== undefined) shopProfile.whatsappNumber = whatsappNumber?.trim() || undefined;
  if (openingHours !== undefined) shopProfile.openingHours = parseOpeningHours(openingHours);
  shopProfile.phoneNumber = globalUser.phoneNumber?.trim() || shopProfile.phoneNumber;

  if (req.files && req.files.length > 0) {
    const uploads = req.files
      .slice(0, 5)
      .map((f) => uploadToCloudinary(f.buffer, 'goldbackend/shops', f.mimetype));
    shopProfile.images = await Promise.all(uploads);
  }

  await shopProfile.save();
  const payload = await buildAuthPayload(globalUser);
  res.status(200).json({ success: true, data: payload });
});

/**
 * @route   POST /api/auth/forgot-password
 * @body    email? OR phoneNumber?
 * Returns resetToken in response (for dev/testing). In production send via email/SMS.
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email, phoneNumber } = req.body;
  if (!email && !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Either email or phoneNumber is required',
    });
  }

  const user = await GlobalUser.findOne({
    $or: [
      ...(email ? [{ email: email.trim().toLowerCase() }] : []),
      ...(phoneNumber ? [{ phoneNumber }] : []),
    ].filter(Boolean),
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) {
    return res.status(404).json({ success: false, message: 'No user found with this email or phone' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Reset token generated. Use it to set a new password.',
    data: {
      resetToken,
      expiresIn: '1 hour',
    },
  });
});

/**
 * @route   POST /api/auth/reset-password
 * @body    resetToken, newPassword
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'resetToken and newPassword are required',
    });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters',
    });
  }

  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const user = await GlobalUser.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  }).select('+password +resetPasswordToken +resetPasswordExpires');

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password updated successfully. You can now login with your new password.',
  });
});

/**
 * @route   POST /api/auth/change-password
 * @body    currentPassword, newPassword
 * Requires valid JWT.
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'currentPassword and newPassword are required',
    });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters',
    });
  }

  const user = await GlobalUser.findById(req.user.id).select('+password');
  if (!user) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});
