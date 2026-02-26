const mongoose = require('mongoose');

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
      index: true,
    },
    subscription_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true,
    },
    razorpay_payment_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['captured', 'failed', 'refunded'],
      default: 'captured',
    },
  },
  { timestamps: true }
);

subscriptionPaymentSchema.index({ subscription_id: 1, razorpay_payment_id: 1 }, { unique: true });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
