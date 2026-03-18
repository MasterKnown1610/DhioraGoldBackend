const mongoose = require('mongoose');

const catalogSchema = new mongoose.Schema(
  {
    tenantType: {
      type: String,
      enum: ['SHOP', 'SERVICE_PROVIDER'],
      required: [true, 'Tenant type is required'],
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Tenant ID is required'],
    },
    title: {
      type: String,
      required: [true, 'Catalog title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

catalogSchema.index({ tenantId: 1, tenantType: 1 });

module.exports = mongoose.model('Catalog', catalogSchema);
