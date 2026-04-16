const mongoose = require('mongoose');

const catalogImageSchema = new mongoose.Schema(
  {
    catalogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Catalog',
      required: [true, 'Catalog ID is required'],
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
    },
    title: {
      type: String,
      trim: true,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: null,
    },
    sizeMb: {
      type: Number,
      required: [true, 'File size is required'],
    },
    originalSizeMb: {
      type: Number,
      default: null,
    },
    quality: {
      type: String,
      enum: ['standard', 'hd'],
      default: 'standard',
    },
    category: {
      type: String,
      enum: [
        'ring',
        'chain',
        'haram',
        'necklace',
        'bangle',
        'bracelet',
        'earring',
        'pendant',
        'anklet',
        'nose_pin',
        'mangalsutra',
        'waist_belt',
        'brooch',
        'coin',
        'other',
      ],
      default: 'other',
    },
  },
  { timestamps: true }
);

catalogImageSchema.index({ catalogId: 1 });

module.exports = mongoose.model('CatalogImage', catalogImageSchema);
