const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['earn', 'spend'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      required: true,
      enum: ['reward_ad', 'unlock_phone', 'boost_shop', 'remove_ads'],
    },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
