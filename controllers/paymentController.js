const crypto = require('crypto');
const Razorpay = require('razorpay');
const asyncHandler = require('../middleware/asyncHandler');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Shop = require('../models/Shop');
const GlobalUser = require('../models/GlobalUser');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const USER_SUBSCRIPTION_AMOUNT_PAISE = 1000; // ₹10
const SHOP_SUBSCRIPTION_AMOUNT_PAISE = 2500; // ₹25
const CATALOG_BASIC_AMOUNT_PAISE = 10000; // ₹100 / month
const CATALOG_PRO_AMOUNT_PAISE = 29900; // ₹299 / month
const SUBSCRIPTION_DAYS = 30;

const getRazorpayInstance = () => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

const generateOrderId = () => `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

/**
 * @route   POST /api/payments/create-order
 * @body    type: 'user_subscription' | 'shop_subscription'
 * Requires auth. Returns { orderId, razorpayOrderId, amount, key_id } for client checkout.
 */
exports.createOrder = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  const { type, catalogPlan } = req.body;
  if (!type || !['user_subscription', 'shop_subscription', 'catalog_subscription'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'type must be user_subscription, shop_subscription, or catalog_subscription',
    });
  }

  let amount = null;
  let normalizedCatalogPlan = null;

  if (type === 'catalog_subscription') {
    normalizedCatalogPlan = String(catalogPlan || '').trim().toUpperCase();
    if (!['BASIC', 'PRO'].includes(normalizedCatalogPlan)) {
      return res.status(400).json({
        success: false,
        message: 'catalogPlan must be BASIC or PRO for catalog_subscription',
      });
    }
    amount = normalizedCatalogPlan === 'PRO' ? CATALOG_PRO_AMOUNT_PAISE : CATALOG_BASIC_AMOUNT_PAISE;
  } else {
    const amountMap = {
      user_subscription: USER_SUBSCRIPTION_AMOUNT_PAISE,
      shop_subscription: SHOP_SUBSCRIPTION_AMOUNT_PAISE,
    };
    amount = amountMap[type];
  }

  const orderId = generateOrderId();

  const razorpay = getRazorpayInstance();
  const razorpayOrder = await razorpay.orders.create({
    amount,
    currency: 'INR',
    receipt: orderId,
    notes: { type, orderId, catalogPlan: normalizedCatalogPlan || undefined },
  });

  await Payment.create({
    orderId,
    razorpayOrderId: razorpayOrder.id,
    amount,
    type,
    catalogPlan: normalizedCatalogPlan,
    globalUserRef: globalUser._id,
    userProfileRef: type === 'user_subscription' ? globalUser.userProfileRef : undefined,
    shopProfileRef: type === 'shop_subscription' ? globalUser.shopProfileRef : undefined,
    status: 'pending',
  });

  res.status(200).json({
    success: true,
    data: {
      orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      key_id: RAZORPAY_KEY_ID,
      currency: 'INR',
    },
  });
});

/**
 * @route   POST /api/payments/verify
 * @body    razorpay_order_id, razorpay_payment_id, razorpay_signature, type, orderId
 * Verifies signature, updates Payment status, and sets subscription dates on User/Shop.
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    type,
    orderId,
  } = req.body;

  const hasSignature = razorpay_signature != null && String(razorpay_signature).trim().length > 0;
  if (!razorpay_order_id || !razorpay_payment_id || !type || !orderId || !hasSignature) {
    return res.status(400).json({
      success: false,
      message: !hasSignature
        ? 'razorpay_signature is required and cannot be empty. Check that the Razorpay SDK success callback provides it (some SDKs use camelCase: razorpaySignature).'
        : 'razorpay_order_id, razorpay_payment_id, type and orderId are required',
    });
  }

  if (!['user_subscription', 'shop_subscription', 'catalog_subscription'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'type must be user_subscription, shop_subscription, or catalog_subscription',
    });
  }

  const paymentRecord = await Payment.findOne({ orderId, type, status: 'pending' });
  if (!paymentRecord) {
    return res.status(400).json({
      success: false,
      message: 'Order not found or already processed',
    });
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    paymentRecord.status = 'failed';
    await paymentRecord.save();
    return res.status(400).json({
      success: false,
      message: 'Payment verification failed',
    });
  }

  paymentRecord.razorpayPaymentId = razorpay_payment_id;
  paymentRecord.status = 'completed';
  await paymentRecord.save();

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + SUBSCRIPTION_DAYS);

  const globalUser = paymentRecord.globalUserRef
    ? await GlobalUser.findById(paymentRecord.globalUserRef)
    : null;

  if (type === 'user_subscription') {
    const userProfileId = paymentRecord.userProfileRef || globalUser?.userProfileRef;
    if (userProfileId) {
      await User.findByIdAndUpdate(userProfileId, {
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
      });
    } else if (globalUser) {
      globalUser.pendingUserSubscriptionEndDate = endDate;
      await globalUser.save();
    }
  } else if (type === 'shop_subscription') {
    const shopProfileId = paymentRecord.shopProfileRef || globalUser?.shopProfileRef;
    if (shopProfileId) {
      await Shop.findByIdAndUpdate(shopProfileId, {
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
      });
    } else if (globalUser) {
      globalUser.pendingShopSubscriptionEndDate = endDate;
      await globalUser.save();
    }
  } else if (type === 'catalog_subscription') {
    // Monthly catalog subscription: enable + set plan + expiry on both profiles linked to this globalUser
    if (globalUser) {
      await Promise.all([
        Shop.findOneAndUpdate(
          { globalUserRef: globalUser._id },
          {
            catalogEnabled: true,
            catalogPlan: paymentRecord.catalogPlan || 'BASIC',
            catalogSubscriptionStartDate: now,
            catalogSubscriptionEndDate: endDate,
          }
        ),
        User.findOneAndUpdate(
          { globalUserRef: globalUser._id },
          {
            catalogEnabled: true,
            catalogPlan: paymentRecord.catalogPlan || 'BASIC',
            catalogSubscriptionStartDate: now,
            catalogSubscriptionEndDate: endDate,
          }
        ),
      ]);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Payment verified. Subscription activated.',
    data: {
      subscriptionEndDate: endDate.toISOString(),
      type,
    },
  });
});
