const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const globalUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    userProfileRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    shopProfileRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      default: null,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    resetPasswordToken: { type: String, select: false, default: null },
    resetPasswordExpires: { type: Date, select: false, default: null },
    goldPoints: { type: Number, default: 0, min: 0 },
    adsWatchedToday: { type: Number, default: 0, min: 0 },
    lastAdWatchDate: { type: Date, default: null },
    isPremium: { type: Boolean, default: false },
    adFreeUntil: { type: Date, default: null },
    referralCode: { type: String, trim: true, default: null, unique: true, sparse: true },
    referralBalance: { type: Number, default: 0, min: 0 },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalUser', default: null },
    referralRefundRequestedAt: { type: Date, default: null },
    referralWithdrawalAmount: { type: Number, default: null },
    referralWithdrawalType: { type: String, enum: ['phonepe', 'gpay'], default: null },
    referralWithdrawalPhone: { type: String, trim: true, default: null },
    pendingUserSubscriptionEndDate: { type: Date, default: null },
    pendingShopSubscriptionEndDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// At least one of email or phoneNumber
globalUserSchema.pre('validate', function (next) {
  if (!this.email && !this.phoneNumber) {
    next(new Error('Either email or phoneNumber is required'));
  } else {
    next();
  }
});

globalUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

globalUserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('GlobalUser', globalUserSchema);
