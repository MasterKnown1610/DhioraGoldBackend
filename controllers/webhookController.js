const crypto = require('crypto');
const asyncHandler = require('../middleware/asyncHandler');
const Subscription = require('../models/Subscription');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const User = require('../models/User');
const Shop = require('../models/Shop');
const GlobalUser = require('../models/GlobalUser');

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const RENEWAL_DAYS = 30;

function verifyRazorpayWebhookSignature(body, signature) {
  if (!RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * @route   POST /api/webhook/razorpay
 * Must be called with raw body (no JSON parser). Verifies X-Razorpay-Signature.
 * Subscription dates on User/Shop are updated ONLY here, after Razorpay confirms payment.
 * Until these events run, the user must not get listing access (listing APIs use subscriptionEndDate).
 * Handles: subscription.activated, subscription.charged, payment.failed, subscription.cancelled
 */
exports.handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body;

  if (!rawBody) {
    console.error('[webhook/razorpay] Missing body');
    return res.status(400).json({ success: false, message: 'Missing body' });
  }

  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  if (!verifyRazorpayWebhookSignature(bodyString, signature)) {
    console.error('[webhook/razorpay] Invalid signature - check RAZORPAY_WEBHOOK_SECRET and Dashboard webhook URL');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(bodyString);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }

  const event = payload.event;
  console.log('[webhook/razorpay] Event received:', event, payload.payload ? 'has payload' : 'no payload');
  if (!event) {
    return res.status(200).json({ received: true });
  }

  const payloadSubscription = payload.payload?.subscription?.entity || payload.payload?.subscription;
  const payloadPayment = payload.payload?.payment?.entity || payload.payload?.payment;

  switch (event) {
    case 'subscription.activated': {
      // First payment confirmed; grant access only now (set subscription dates on User/Shop).
      console.log('[webhook/razorpay] subscription.activated for:', payloadSubscription?.id);
      if (!payloadSubscription?.id) break;
      const sub = await Subscription.findOne({ razorpay_subscription_id: payloadSubscription.id });
      if (!sub) break;
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + RENEWAL_DAYS);
      sub.subscription_status = 'ACTIVE';
      sub.start_date = now;
      sub.expiry_date = expiry;
      await sub.save();

      const globalUser = await GlobalUser.findById(sub.user_id);
      if (sub.plan_type === 'SERVICE' && globalUser?.userProfileRef) {
        await User.findByIdAndUpdate(globalUser.userProfileRef, {
          subscriptionStartDate: now,
          subscriptionEndDate: expiry,
        });
      } else if (sub.plan_type === 'SHOP' && globalUser?.shopProfileRef) {
        await Shop.findByIdAndUpdate(globalUser.shopProfileRef, {
          subscriptionStartDate: now,
          subscriptionEndDate: expiry,
        });
      }
      console.log('[webhook/razorpay] subscription.activated done, sub status ACTIVE');
      break;
    }

    case 'subscription.charged': {
      // Recurring payment confirmed; extend access (update subscription dates on User/Shop).
      console.log('[webhook/razorpay] subscription.charged sub:', payloadSubscription?.id, 'payment:', payloadPayment?.id, 'amount:', payloadPayment?.amount);
      if (!payloadSubscription?.id || !payloadPayment?.id) break;
      const sub = await Subscription.findOne({ razorpay_subscription_id: payloadSubscription.id });
      if (!sub) break;

      const amount = payloadPayment.amount != null ? payloadPayment.amount / 100 : 0;
      await SubscriptionPayment.findOneAndUpdate(
        { subscription_id: sub._id, razorpay_payment_id: payloadPayment.id },
        {
          user_id: sub.user_id,
          subscription_id: sub._id,
          razorpay_payment_id: payloadPayment.id,
          amount,
          payment_date: new Date(),
          status: 'captured',
        },
        { upsert: true, new: true }
      );

      const currentExpiry = sub.expiry_date ? new Date(sub.expiry_date) : new Date();
      currentExpiry.setDate(currentExpiry.getDate() + RENEWAL_DAYS);
      sub.expiry_date = currentExpiry;
      sub.subscription_status = 'ACTIVE';
      await sub.save();

      const globalUser = await GlobalUser.findById(sub.user_id);
      if (sub.plan_type === 'SERVICE' && globalUser?.userProfileRef) {
        await User.findByIdAndUpdate(globalUser.userProfileRef, {
          subscriptionEndDate: currentExpiry,
        });
      } else if (sub.plan_type === 'SHOP' && globalUser?.shopProfileRef) {
        await Shop.findByIdAndUpdate(globalUser.shopProfileRef, {
          subscriptionEndDate: currentExpiry,
        });
      }
      console.log('[webhook/razorpay] subscription.charged done, expiry extended');
      break;
    }

    case 'payment.failed': {
      console.log('[webhook/razorpay] payment.failed for subscription:', payload.payload?.payment?.entity?.subscription_id);
      const paymentEntity = payload.payload?.payment?.entity || payload.payload?.payment;
      if (!paymentEntity?.subscription_id) break;
      const sub = await Subscription.findOne({ razorpay_subscription_id: paymentEntity.subscription_id });
      if (sub) {
        sub.subscription_status = 'PAYMENT_FAILED';
        await sub.save();
      }
      break;
    }

    case 'subscription.cancelled': {
      if (!payloadSubscription?.id) break;
      const sub = await Subscription.findOne({ razorpay_subscription_id: payloadSubscription.id });
      if (sub) {
        sub.subscription_status = 'CANCELLED';
        await sub.save();
      }
      break;
    }

    default:
      break;
  }

  res.status(200).json({ received: true });
});
