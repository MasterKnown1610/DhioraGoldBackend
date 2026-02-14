const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    ctaType: {
      type: String,
      enum: ['phone', 'website', 'whatsapp'],
      default: null,
    },
    ctaValue: {
      type: String,
      trim: true,
      default: null,
    },
    ctaLabel: {
      type: String,
      trim: true,
      default: null,
    },
    ctaMessage: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

promotionSchema.index({ endDate: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
