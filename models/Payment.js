const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    amount: { type: Number, required: true }, // in paise
    type: {
      type: String,
      required: true,
      enum: ['user_subscription', 'shop_subscription', 'referral_refund'],
    },
    globalUserRef: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', default: null },
    userProfileRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    shopProfileRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ globalUserRef: 1, type: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
