const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    catalogImageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogImage',
      required: true,
    },
    catalogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Catalog',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    title: { type: String, default: null },
    price: { type: Number, default: null },
    imageUrl: { type: String, required: true },
    category: { type: String, default: null },
    metalType: { type: String, default: null },
    grams: { type: Number, default: null },
    sellerTenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sellerTenantType: {
      type: String,
      enum: ['SHOP', 'SERVICE_PROVIDER'],
      required: true,
    },
    sellerName: { type: String, default: null },
    sellerPhone: { type: String, default: null },
    sellerWhatsapp: { type: String, default: null },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    globalUserRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

cartSchema.index({ globalUserRef: 1 });

module.exports = mongoose.model('Cart', cartSchema);
