const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    serviceProvided: {
      type: String,
      required: [true, 'Service provided is required'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    district: {
      type: String,
      trim: true,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    pincode: {
      type: String,
      trim: true,
      default: null,
    },
    profileImage: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    globalUserRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      default: null,
    },
    subscriptionStartDate: { type: Date, default: null },
    subscriptionEndDate: { type: Date, default: null },
    plan: {
      type: String,
      enum: ['BASIC'],
      default: 'BASIC',
    },
    catalogEnabled: { type: Boolean, default: false },
    catalogPlan: {
      type: String,
      enum: ['BASIC', 'PRO'],
      default: 'BASIC',
    },
    catalogSubscriptionStartDate: { type: Date, default: null },
    catalogSubscriptionEndDate: { type: Date, default: null },
    storageUsedMb: { type: Number, default: 0 },
    totalImages: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
