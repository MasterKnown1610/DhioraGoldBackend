const asyncHandler = require('../middleware/asyncHandler');
const Catalog = require('../models/Catalog');
const CatalogImage = require('../models/CatalogImage');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary, compressImage } = require('../middleware/upload');

const PLAN_LIMITS = {
  BASIC: { storageMb: 500, images: 100 },
};

/**
 * Resolve the Shop or User profile for the authenticated GlobalUser.
 * Returns { tenant, tenantType, TenantModel } or null.
 */
const resolveTenant = async (globalUser) => {
  const shop = await Shop.findOne({ globalUserRef: globalUser._id });
  if (shop) return { tenant: shop, tenantType: 'SHOP', TenantModel: Shop };
  const user = await User.findOne({ globalUserRef: globalUser._id });
  if (user) return { tenant: user, tenantType: 'SERVICE_PROVIDER', TenantModel: User };
  return null;
};

// POST /api/catalogs
const createCatalog = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Title is required' });
  }

  const resolved = await resolveTenant(req.user);
  if (!resolved) {
    return res
      .status(404)
      .json({ success: false, message: 'No shop or service provider profile found' });
  }

  if (!resolved.tenant.catalogEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription required. Please activate your catalog plan to use this feature.',
      code: 'CATALOG_NOT_ENABLED',
    });
  }

  const catalog = await Catalog.create({
    tenantType: resolved.tenantType,
    tenantId: resolved.tenant._id,
    title: title.trim(),
    description: description?.trim() || null,
  });

  res.status(201).json({ success: true, data: catalog });
});

// GET /api/catalogs/my
const getMyCatalogs = asyncHandler(async (req, res) => {
  // Return catalogs for ALL profiles (shop + SP) linked to this globalUser
  const [shop, user] = await Promise.all([
    Shop.findOne({ globalUserRef: req.user._id }),
    User.findOne({ globalUserRef: req.user._id }),
  ]);

  if (!shop && !user) {
    return res
      .status(404)
      .json({ success: false, message: 'No shop or service provider profile found' });
  }

  const orClauses = [];
  if (shop) orClauses.push({ tenantId: shop._id, tenantType: 'SHOP' });
  if (user) orClauses.push({ tenantId: user._id, tenantType: 'SERVICE_PROVIDER' });

  const catalogs = await Catalog.find({ $or: orClauses }).sort({ createdAt: -1 });
  res.json({ success: true, data: catalogs });
});

/**
 * Validate and parse a price field. Returns null if empty, throws on invalid.
 */
const parsePrice = (priceVal) => {
  if (priceVal === undefined || priceVal === null || priceVal === '') return null;
  const n = Number(priceVal);
  if (isNaN(n) || n < 0) throw new Error('Price must be a non-negative number');
  return n;
};

/**
 * Compress one file buffer, return { compressedBuffer, sizeMb, originalSizeMb }.
 */
const processFile = async (file, quality) => {
  const originalSizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(4));
  const compressedBuffer = await compressImage(file.buffer, quality);
  const sizeMb = parseFloat((compressedBuffer.length / (1024 * 1024)).toFixed(4));
  return { compressedBuffer, sizeMb, originalSizeMb };
};

// POST /api/catalogs/:catalogId/images  (single upload)
const uploadCatalogImage = asyncHandler(async (req, res) => {
  const { catalogId } = req.params;
  const { title, description, price, quality = 'standard' } = req.body;

  if (!['standard', 'hd'].includes(quality)) {
    return res.status(400).json({ success: false, message: 'quality must be "standard" or "hd"' });
  }

  const catalog = await Catalog.findById(catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const resolved = await resolveTenant(req.user);
  if (!resolved || catalog.tenantId.toString() !== resolved.tenant._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to upload to this catalog' });
  }

  if (!resolved.tenant.catalogEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription required.',
      code: 'CATALOG_NOT_ENABLED',
    });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }

  let parsedPrice;
  try {
    parsedPrice = parsePrice(price);
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }

  const { compressedBuffer, sizeMb, originalSizeMb } = await processFile(req.file, quality);

  const tenant = resolved.tenant;
  const planLimits = PLAN_LIMITS[tenant.plan || 'BASIC'];
  const currentStorage = tenant.storageUsedMb || 0;
  const currentImages = tenant.totalImages || 0;

  if (currentStorage + sizeMb > planLimits.storageMb) {
    return res.status(400).json({
      success: false,
      message: `Storage limit exceeded. Used: ${currentStorage.toFixed(2)}MB of ${planLimits.storageMb}MB`,
    });
  }
  if (currentImages + 1 > planLimits.images) {
    return res.status(400).json({
      success: false,
      message: `Image limit reached. Maximum ${planLimits.images} images allowed on ${tenant.plan || 'BASIC'} plan`,
    });
  }

  const imageUrl = await uploadToCloudinary(compressedBuffer, 'goldbackend/catalogs', 'image/jpeg');

  const catalogImage = await CatalogImage.create({
    catalogId: catalog._id,
    imageUrl,
    title: title?.trim() || null,
    description: description?.trim() || null,
    price: parsedPrice,
    sizeMb,
    originalSizeMb,
    quality,
  });

  await resolved.TenantModel.findByIdAndUpdate(tenant._id, {
    $inc: { storageUsedMb: sizeMb, totalImages: 1 },
  });

  res.status(201).json({ success: true, data: catalogImage });
});

// POST /api/catalogs/:catalogId/images/bulk  (bulk upload, up to 10 images)
const bulkUploadCatalogImages = asyncHandler(async (req, res) => {
  const { catalogId } = req.params;
  const { quality = 'standard' } = req.body;

  if (!['standard', 'hd'].includes(quality)) {
    return res.status(400).json({ success: false, message: 'quality must be "standard" or "hd"' });
  }

  const catalog = await Catalog.findById(catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const resolved = await resolveTenant(req.user);
  if (!resolved || catalog.tenantId.toString() !== resolved.tenant._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to upload to this catalog' });
  }

  if (!resolved.tenant.catalogEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription required.',
      code: 'CATALOG_NOT_ENABLED',
    });
  }

  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one image file is required' });
  }

  // Parse per-image metadata arrays sent as titles[0], prices[0], etc.
  const toArray = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };
  const titles       = toArray(req.body.titles);
  const descriptions = toArray(req.body.descriptions);
  const prices       = toArray(req.body.prices);

  // Validate all prices upfront before touching Cloudinary
  const parsedPrices = [];
  for (let i = 0; i < files.length; i++) {
    try {
      parsedPrices.push(parsePrice(prices[i]));
    } catch (e) {
      return res.status(400).json({ success: false, message: `Image ${i + 1}: ${e.message}` });
    }
  }

  // Compress all files first so we know the real sizes before checking limits
  const processed = await Promise.all(files.map((f) => processFile(f, quality)));

  const tenant = resolved.tenant;
  const planLimits = PLAN_LIMITS[tenant.plan || 'BASIC'];
  let currentStorage = tenant.storageUsedMb || 0;
  let currentImages  = tenant.totalImages  || 0;

  const totalNewSizeMb = processed.reduce((s, p) => s + p.sizeMb, 0);

  if (currentImages + files.length > planLimits.images) {
    return res.status(400).json({
      success: false,
      message: `Image limit: can add ${planLimits.images - currentImages} more image(s). Tried to add ${files.length}.`,
    });
  }
  if (currentStorage + totalNewSizeMb > planLimits.storageMb) {
    return res.status(400).json({
      success: false,
      message: `Storage limit: ${(planLimits.storageMb - currentStorage).toFixed(2)}MB available, these images need ${totalNewSizeMb.toFixed(2)}MB after compression.`,
    });
  }

  // Upload all to Cloudinary and save records sequentially to keep counters accurate
  const created = [];
  let addedSizeMb = 0;

  for (let i = 0; i < files.length; i++) {
    const { compressedBuffer, sizeMb, originalSizeMb } = processed[i];

    const imageUrl = await uploadToCloudinary(compressedBuffer, 'goldbackend/catalogs', 'image/jpeg');

    const catalogImage = await CatalogImage.create({
      catalogId: catalog._id,
      imageUrl,
      title:        titles[i]?.trim()       || null,
      description:  descriptions[i]?.trim() || null,
      price:        parsedPrices[i],
      sizeMb,
      originalSizeMb,
      quality,
    });

    created.push(catalogImage);
    addedSizeMb += sizeMb;
  }

  await resolved.TenantModel.findByIdAndUpdate(tenant._id, {
    $inc: { storageUsedMb: parseFloat(addedSizeMb.toFixed(4)), totalImages: files.length },
  });

  res.status(201).json({
    success: true,
    uploaded: created.length,
    data: created,
  });
});

// DELETE /api/catalogs/:catalogId/images/:imageId
const deleteCatalogImage = asyncHandler(async (req, res) => {
  const { catalogId, imageId } = req.params;

  const catalog = await Catalog.findById(catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const resolved = await resolveTenant(req.user);
  if (!resolved || catalog.tenantId.toString() !== resolved.tenant._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const image = await CatalogImage.findOne({ _id: imageId, catalogId: catalog._id });
  if (!image) {
    return res.status(404).json({ success: false, message: 'Image not found in this catalog' });
  }

  await deleteFromCloudinary(image.imageUrl);

  await resolved.TenantModel.findByIdAndUpdate(resolved.tenant._id, {
    $inc: {
      storageUsedMb: -image.sizeMb,
      totalImages: -1,
    },
  });

  await image.deleteOne();

  res.json({ success: true, message: 'Image deleted successfully' });
});

// GET /api/public/catalogs/:catalogId
const getPublicCatalog = asyncHandler(async (req, res) => {
  const { catalogId } = req.params;

  const catalog = await Catalog.findById(catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const images = await CatalogImage.find({ catalogId: catalog._id }).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { catalog, images },
  });
});

// GET /api/catalogs/:catalogId/images — owner view with all image details
const getCatalogImages = asyncHandler(async (req, res) => {
  const { catalogId } = req.params;

  const catalog = await Catalog.findById(catalogId);
  if (!catalog) {
    return res.status(404).json({ success: false, message: 'Catalog not found' });
  }

  const resolved = await resolveTenant(req.user);
  if (!resolved || catalog.tenantId.toString() !== resolved.tenant._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const images = await CatalogImage.find({ catalogId: catalog._id }).sort({ createdAt: -1 });

  res.json({ success: true, data: images });
});

// GET /api/public/catalogs/by-tenant/:tenantId?tenantType=SHOP|SERVICE_PROVIDER
const getPublicCatalogsByTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  // Find the globalUserRef for this tenant (could be a Shop or User _id)
  let globalRef = null;
  const asShop = await Shop.findById(tenantId).select('globalUserRef');
  if (asShop) {
    globalRef = asShop.globalUserRef;
  } else {
    const asUser = await User.findById(tenantId).select('globalUserRef');
    if (asUser) globalRef = asUser.globalUserRef;
  }

  if (globalRef) {
    // Return catalogs for ALL profiles linked to the same globalUser
    const [linkedShop, linkedUser] = await Promise.all([
      Shop.findOne({ globalUserRef: globalRef }).select('_id'),
      User.findOne({ globalUserRef: globalRef }).select('_id'),
    ]);
    const orClauses = [];
    if (linkedShop) orClauses.push({ tenantId: linkedShop._id, tenantType: 'SHOP' });
    if (linkedUser) orClauses.push({ tenantId: linkedUser._id, tenantType: 'SERVICE_PROVIDER' });
    if (orClauses.length > 0) {
      const catalogs = await Catalog.find({ $or: orClauses }).sort({ createdAt: -1 });
      return res.json({ success: true, data: catalogs });
    }
  }

  // Fallback: direct match
  const catalogs = await Catalog.find({ tenantId }).sort({ createdAt: -1 });
  res.json({ success: true, data: catalogs });
});

// GET /api/catalogs/subscription-status — check if catalog is enabled for the logged-in user
const getCatalogSubscriptionStatus = asyncHandler(async (req, res) => {
  const resolved = await resolveTenant(req.user);
  if (!resolved) {
    return res
      .status(404)
      .json({ success: false, message: 'No shop or service provider profile found' });
  }
  res.json({
    success: true,
    data: {
      catalogEnabled: resolved.tenant.catalogEnabled || false,
      plan: resolved.tenant.plan || 'BASIC',
    },
  });
});

// GET /api/catalogs/admin/all — admin: all catalogs across all tenants
const getAllCatalogsAdmin = asyncHandler(async (req, res) => {
  const catalogs = await Catalog.find({}).sort({ createdAt: -1 });
  res.json({ success: true, data: catalogs });
});

module.exports = {
  createCatalog,
  getMyCatalogs,
  uploadCatalogImage,
  bulkUploadCatalogImages,
  deleteCatalogImage,
  getPublicCatalog,
  getPublicCatalogsByTenant,
  getCatalogImages,
  getAllCatalogsAdmin,
  getCatalogSubscriptionStatus,
};
