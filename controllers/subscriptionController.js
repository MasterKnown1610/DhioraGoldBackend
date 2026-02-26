const Razorpay = require('razorpay');
const asyncHandler = require('../middleware/asyncHandler');
const Subscription = require('../models/Subscription');
const GlobalUser = require('../models/GlobalUser');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const PLAN_SERVICE = process.env.RAZORPAY_PLAN_SERVICE ;
const PLAN_SHOP = process.env.RAZORPAY_PLAN_SHOP ;

const getRazorpayInstance = () => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys not configured.');
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

/**
 * Get or create Razorpay customer for a GlobalUser. Saves razorpayCustomerId on user.
 */
async function getOrCreateRazorpayCustomer(globalUser) {
  if (globalUser.razorpayCustomerId) {
    return globalUser.razorpayCustomerId;
  }
  const razorpay = getRazorpayInstance();
  const name = (globalUser.name || 'Customer').trim().slice(0, 50);
  const email = (globalUser.email || `user-${globalUser._id}@placeholder.local`).trim().slice(0, 64);
  const contact = (globalUser.phoneNumber || '9999999999').replace(/\D/g, '').slice(0, 15);
  const contactWithCountry = contact.length === 10 ? `91${contact}` : contact;

  const customer = await razorpay.customers.create({
    name,
    email,
    contact: contactWithCountry,
    fail_existing: 0,
    notes: { global_user_id: String(globalUser._id) },
  });

  await GlobalUser.findByIdAndUpdate(globalUser._id, { razorpayCustomerId: customer.id });
  return customer.id;
}

/**
 * @route   POST /api/subscription/create
 * @body    { user_id?: string, plan_type: "SERVICE" | "SHOP" }
 * Creates Razorpay subscription (AutoPay), saves with status CREATED. Activation happens via webhook.
 * If user_id is omitted, uses logged-in user. Otherwise user_id must match req.user (users can only create for themselves).
 */
exports.createSubscription = asyncHandler(async (req, res) => {
  const { plan_type } = req.body;
  let { user_id } = req.body;

  if (!plan_type) {
    return res.status(400).json({
      success: false,
      message: 'plan_type is required',
    });
  }

  const planTypeUpper = plan_type.toUpperCase();
  if (planTypeUpper !== 'SERVICE' && planTypeUpper !== 'SHOP') {
    return res.status(400).json({
      success: false,
      message: 'plan_type must be SERVICE or SHOP',
    });
  }

  const currentUser = req.user;
  if (!currentUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  if (!user_id) user_id = currentUser._id.toString();
  if (user_id !== currentUser._id.toString()) {
    return res.status(403).json({ success: false, message: 'You can only create a subscription for yourself' });
  }

  const plan_id = planTypeUpper === 'SERVICE' ? PLAN_SERVICE : PLAN_SHOP;

  const globalUser = await GlobalUser.findById(user_id).select('name email phoneNumber razorpayCustomerId');
  if (!globalUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  let customerId;
  let razorpaySubscription;
  try {
    customerId = await getOrCreateRazorpayCustomer(globalUser);
    const razorpay = getRazorpayInstance();
    const nowUnix = Math.floor(Date.now() / 1000);
    const subscriptionPayload = {
      plan_id,
      customer_id: customerId,
      total_count: 1200,
      customer_notify: 1,
      start_at: nowUnix + 60,
      expire_by: nowUnix + 30 * 24 * 60 * 60,
    };
    razorpaySubscription = await razorpay.subscriptions.create(subscriptionPayload);
  } catch (razorpayErr) {
    const statusCode = razorpayErr.statusCode || 502;
    const msg =
      razorpayErr.error?.description ||
      razorpayErr.error?.reason ||
      (typeof razorpayErr.error === 'string' ? razorpayErr.error : razorpayErr.message) ||
      'Razorpay request failed';
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
      success: false,
      message: msg,
    });
  }

  await Subscription.create({
    user_id: globalUser._id,
    plan_type: planTypeUpper,
    razorpay_subscription_id: razorpaySubscription.id,
    subscription_status: 'CREATED',
    start_date: null,
    expiry_date: null,
  });

  res.status(200).json({
    success: true,
    data: {
      subscription_id: razorpaySubscription.id,
      razorpay_key: RAZORPAY_KEY_ID,
    },
  });
});
