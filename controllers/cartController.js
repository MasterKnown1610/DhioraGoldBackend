const asyncHandler = require('../middleware/asyncHandler');
const Cart = require('../models/Cart');
const Catalog = require('../models/Catalog');
const CatalogImage = require('../models/CatalogImage');
const Shop = require('../models/Shop');
const User = require('../models/User');

const isCatalogTenantActive = async (tenantType, tenantId) => {
  const now = new Date();
  const Model = tenantType === 'SHOP' ? Shop : User;
  const tenant = await Model.findById(tenantId);
  if (!tenant) return false;
  const active =
    tenant.catalogEnabled &&
    (!tenant.catalogSubscriptionEndDate || tenant.catalogSubscriptionEndDate >= now);
  return active;
};

const sellerSnapshot = (tenantType, tenant) => {
  if (!tenant) return null;
  return {
    sellerTenantId: tenant._id,
    sellerTenantType: tenantType,
    sellerName: tenant.shopName || tenant.userName || tenant.name || null,
    sellerPhone: tenant.phoneNumber || null,
    sellerWhatsapp: tenant.whatsappNumber || null,
  };
};

// GET /api/cart
const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ globalUserRef: req.user._id }).lean();
  if (!cart) {
    return res.json({
      success: true,
      data: { items: [], itemCount: 0, subtotal: 0 },
    });
  }
  const subtotal = (cart.items || []).reduce((sum, it) => {
    const line = (it.price != null ? Number(it.price) : 0) * (it.quantity || 1);
    return sum + line;
  }, 0);
  const itemCount = (cart.items || []).reduce((n, it) => n + (it.quantity || 0), 0);
  res.json({
    success: true,
    data: { ...cart, subtotal, itemCount },
  });
});

// POST /api/cart/items  { catalogImageId, quantity? }
const addCartItem = asyncHandler(async (req, res) => {
  const { catalogImageId, quantity = 1 } = req.body || {};
  const qty = Math.max(1, Math.min(99, Number(quantity) || 1));

  if (!catalogImageId) {
    return res.status(400).json({ success: false, message: 'catalogImageId is required' });
  }

  const image = await CatalogImage.findById(catalogImageId);
  if (!image) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const catalog = await Catalog.findById(image.catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const active = await isCatalogTenantActive(catalog.tenantType, catalog.tenantId);
  if (!active) {
    return res.status(400).json({
      success: false,
      message: 'This listing is not available for purchase right now',
    });
  }

  const TenantModel = catalog.tenantType === 'SHOP' ? Shop : User;
  const tenant = await TenantModel.findById(catalog.tenantId);
  const snap = sellerSnapshot(catalog.tenantType, tenant);
  if (!snap) {
    return res.status(400).json({ success: false, message: 'Seller not found' });
  }

  let cart = await Cart.findOne({ globalUserRef: req.user._id });
  if (!cart) {
    cart = await Cart.create({ globalUserRef: req.user._id, items: [] });
  }

  const idx = cart.items.findIndex((i) => i.catalogImageId.toString() === String(catalogImageId));
  if (idx >= 0) {
    cart.items[idx].quantity = Math.min(99, cart.items[idx].quantity + qty);
  } else {
    cart.items.push({
      catalogImageId: image._id,
      catalogId: catalog._id,
      quantity: qty,
      title: image.title || null,
      price: image.price != null ? image.price : null,
      imageUrl: image.imageUrl,
      category: image.category || null,
      metalType: image.metalType || null,
      grams: image.grams != null ? image.grams : null,
      ...snap,
    });
  }

  await cart.save();
  const plain = cart.toObject ? cart.toObject() : cart;
  const subtotal = plain.items.reduce((sum, it) => {
    const line = (it.price != null ? Number(it.price) : 0) * (it.quantity || 1);
    return sum + line;
  }, 0);
  const itemCount = plain.items.reduce((n, it) => n + (it.quantity || 0), 0);

  res.status(201).json({
    success: true,
    data: { cart: plain, subtotal, itemCount },
  });
});

// PATCH /api/cart/items/:catalogImageId  { quantity }
const updateCartItemQty = asyncHandler(async (req, res) => {
  const { catalogImageId } = req.params;
  const { quantity } = req.body || {};
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
    return res.status(400).json({ success: false, message: 'quantity must be 1–99' });
  }

  const cart = await Cart.findOne({ globalUserRef: req.user._id });
  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart is empty' });
  }

  const item = cart.items.find((i) => i.catalogImageId.toString() === catalogImageId);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not in cart' });
  }

  item.quantity = qty;
  await cart.save();

  const plain = cart.toObject ? cart.toObject() : cart;
  const subtotal = plain.items.reduce((sum, it) => {
    const line = (it.price != null ? Number(it.price) : 0) * (it.quantity || 1);
    return sum + line;
  }, 0);
  const itemCount = plain.items.reduce((n, it) => n + (it.quantity || 0), 0);

  res.json({ success: true, data: { cart: plain, subtotal, itemCount } });
});

// DELETE /api/cart/items/:catalogImageId
const removeCartItem = asyncHandler(async (req, res) => {
  const { catalogImageId } = req.params;

  const cart = await Cart.findOne({ globalUserRef: req.user._id });
  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart is empty' });
  }

  cart.items = cart.items.filter((i) => i.catalogImageId.toString() !== catalogImageId);
  await cart.save();

  const plain = cart.toObject ? cart.toObject() : cart;
  const subtotal = plain.items.reduce((sum, it) => {
    const line = (it.price != null ? Number(it.price) : 0) * (it.quantity || 1);
    return sum + line;
  }, 0);
  const itemCount = plain.items.reduce((n, it) => n + (it.quantity || 0), 0);

  res.json({ success: true, data: { cart: plain, subtotal, itemCount } });
});

// DELETE /api/cart
const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate({ globalUserRef: req.user._id }, { $set: { items: [] } });
  res.json({ success: true, data: { items: [], subtotal: 0, itemCount: 0 } });
});

module.exports = {
  getCart,
  addCartItem,
  updateCartItemQty,
  removeCartItem,
  clearCart,
};
