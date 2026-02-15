const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 5,
        message: 'Maximum 5 images allowed',
      },
    },
    openingHours: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    globalUserRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      default: null,
    },
    boostExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

shopSchema.index({ phoneNumber: 1 }, { unique: true });

module.exports = mongoose.model('Shop', shopSchema);
