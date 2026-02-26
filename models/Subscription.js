const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
      index: true,
    },
    plan_type: {
      type: String,
      enum: ['SERVICE', 'SHOP'],
      required: true,
      index: true,
    },
    razorpay_subscription_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subscription_status: {
      type: String,
      enum: ['CREATED', 'AUTHENTICATED', 'ACTIVE', 'PAYMENT_FAILED', 'CANCELLED', 'COMPLETED', 'EXPIRED'],
      default: 'CREATED',
      index: true,
    },
    start_date: {
      type: Date,
      default: null,
    },
    expiry_date: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ user_id: 1, plan_type: 1 });
subscriptionSchema.index({ razorpay_subscription_id: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
