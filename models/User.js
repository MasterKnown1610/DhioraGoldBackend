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
  },
  { timestamps: true }
);

userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
