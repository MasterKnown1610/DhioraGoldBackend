const asyncHandler = require('../middleware/asyncHandler');
const Catalog = require('../models/Catalog');
const CatalogImage = require('../models/CatalogImage');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary, compressImage } = require('../middleware/upload');

const PLAN_LIMITS = {
  BASIC: { storageMb: 500, images: 300 },
  PRO: { storageMb: 2048, images: 1500 },
};

const ITEM_CATEGORIES = [
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
];

const METAL_TYPES = ['gold', 'silver'];

const normalizeCategory = (category) => {
  const raw = Array.isArray(category) ? category[0] : category;
  if (raw == null || String(raw).trim() === '') return 'other';
  const value = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (!ITEM_CATEGORIES.includes(value)) {
    throw new Error(`Invalid category "${raw}". Allowed: ${ITEM_CATEGORIES.join(', ')}`);
  }
  return value;
};

const normalizeMetalType = (metal) => {
  if (metal == null || String(metal).trim() === '') return 'gold';
  const raw = Array.isArray(metal) ? metal[0] : metal;
  const value = String(raw).trim().toLowerCase();
  if (!METAL_TYPES.includes(value)) {
    throw new Error(`Invalid metal type "${metal}". Allowed: ${METAL_TYPES.join(', ')}`);
  }
  return value;
};

/** Multipart may send a string, or duplicate keys may become an array — use first scalar. */
const firstScalar = (val) => {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val[0];
  return val;
};

const parseGrams = (gramsVal) => {
  const raw = firstScalar(gramsVal);
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (isNaN(n) || n < 0) throw new Error('Grams must be a non-negative number');
  return n;
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

  const tenant = resolved.tenant;
  const now = new Date();
  const isCatalogActive =
    tenant.catalogEnabled && (!tenant.catalogSubscriptionEndDate || tenant.catalogSubscriptionEndDate >= now);
  if (!isCatalogActive) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription inactive. Please activate or renew your catalog plan to use this feature.',
      code: 'CATALOG_NOT_ACTIVE',
    });
  }

  const catalog = await Catalog.create({
    tenantType: resolved.tenantType,
    tenantId: tenant._id,
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

  const now = new Date();
  const shopActive =
    shop &&
    shop.catalogEnabled &&
    (!shop.catalogSubscriptionEndDate || shop.catalogSubscriptionEndDate >= now);
  const userActive =
    user &&
    user.catalogEnabled &&
    (!user.catalogSubscriptionEndDate || user.catalogSubscriptionEndDate >= now);
  if (!shopActive && !userActive) {
    return res.json({ success: true, data: [] });
  }

  const catalogs = await Catalog.find({ $or: orClauses }).sort({ createdAt: -1 });
  res.json({ success: true, data: catalogs });
});

/**
 * Validate and parse a price field. Returns null if empty, throws on invalid.
 */
const parsePrice = (priceVal) => {
  const raw = firstScalar(priceVal);
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
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
  const title = firstScalar(req.body.title);
  const description = firstScalar(req.body.description);
  const category = firstScalar(req.body.category);
  const metalType = firstScalar(req.body.metalType);
  const grams = firstScalar(req.body.grams);
  const qualityRaw = firstScalar(req.body.quality);
  const quality =
    qualityRaw != null && String(qualityRaw).trim() !== ''
      ? String(qualityRaw).trim()
      : 'standard';

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

  const tenant = resolved.tenant;
  const now = new Date();
  const isCatalogActive =
    tenant.catalogEnabled && (!tenant.catalogSubscriptionEndDate || tenant.catalogSubscriptionEndDate >= now);
  if (!isCatalogActive) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription inactive. Please activate or renew to upload images.',
      code: 'CATALOG_NOT_ACTIVE',
    });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }

  let parsedPrice;
  let parsedCategory;
  let parsedMetal;
  let parsedGrams;
  try {
    parsedPrice = parsePrice(req.body.price);
    parsedCategory = normalizeCategory(category);
    parsedMetal = normalizeMetalType(metalType);
    parsedGrams = parseGrams(grams);
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }

  const { compressedBuffer, sizeMb, originalSizeMb } = await processFile(req.file, quality);

  const planLimits = PLAN_LIMITS[tenant.catalogPlan || 'BASIC'] || PLAN_LIMITS.BASIC;
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
      message: `Image limit reached. Maximum ${planLimits.images} images allowed on ${tenant.catalogPlan || 'BASIC'} plan`,
    });
  }

  const imageUrl = await uploadToCloudinary(compressedBuffer, 'goldbackend/catalogs', 'image/jpeg');

  const catalogImage = await CatalogImage.create({
    catalogId: catalog._id,
    imageUrl,
    title: title != null && String(title).trim() !== '' ? String(title).trim() : null,
    description: description != null && String(description).trim() !== '' ? String(description).trim() : null,
    price: parsedPrice,
    category: parsedCategory,
    metalType: parsedMetal,
    grams: parsedGrams,
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

  const tenant = resolved.tenant;
  const now = new Date();
  const isCatalogActive =
    tenant.catalogEnabled && (!tenant.catalogSubscriptionEndDate || tenant.catalogSubscriptionEndDate >= now);
  if (!isCatalogActive) {
    return res.status(403).json({
      success: false,
      message: 'Catalog subscription inactive. Please activate or renew to upload images.',
      code: 'CATALOG_NOT_ACTIVE',
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
  const categories   = toArray(req.body.categories);
  const metalTypes   = toArray(req.body.metalTypes);
  const gramsList    = toArray(req.body.grams);

  // Validate all prices upfront before touching Cloudinary
  const parsedPrices = [];
  const parsedCategories = [];
  const parsedMetalTypes = [];
  const parsedGramsList = [];
  for (let i = 0; i < files.length; i++) {
    try {
      parsedPrices.push(parsePrice(prices[i]));
      parsedCategories.push(normalizeCategory(categories[i]));
      parsedMetalTypes.push(normalizeMetalType(metalTypes[i]));
      parsedGramsList.push(parseGrams(gramsList[i]));
    } catch (e) {
      return res.status(400).json({ success: false, message: `Image ${i + 1}: ${e.message}` });
    }
  }

  // Compress all files first so we know the real sizes before checking limits
  const processed = await Promise.all(files.map((f) => processFile(f, quality)));

  const planLimits = PLAN_LIMITS[tenant.catalogPlan || 'BASIC'] || PLAN_LIMITS.BASIC;
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
      category:     parsedCategories[i],
      metalType:    parsedMetalTypes[i],
      grams:        parsedGramsList[i],
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

// GET /api/public/catalog-items?category=ring&metalType=gold|silver&minGrams=&maxGrams=&tenantType=SHOP|SERVICE_PROVIDER&tenantId=<id>&catalogId=<id>&limit=50&page=1
// Returns catalog items with filters + catalog + seller details.
const getPublicCatalogItems = asyncHandler(async (req, res) => {
  const { category, metalType, minGrams, maxGrams, tenantType, tenantId, catalogId, page = 1, limit = 50 } =
    req.query;

  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  const catalogFilter = {};
  if (catalogId) catalogFilter._id = catalogId;
  if (tenantId) catalogFilter.tenantId = tenantId;
  if (tenantType) catalogFilter.tenantType = String(tenantType).trim().toUpperCase();

  const catalogs = await Catalog.find(catalogFilter).sort({ createdAt: -1 });
  if (!catalogs.length) {
    return res.json({
      success: true,
      data: {
        items: [],
        page: parsedPage,
        limit: parsedLimit,
        total: 0,
        categories: ITEM_CATEGORIES,
        metalTypes: METAL_TYPES,
      },
    });
  }

  const catalogIds = catalogs.map((c) => c._id);
  const imageFilter = { catalogId: { $in: catalogIds } };

  if (category && String(category).trim() !== '') {
    try {
      imageFilter.category = normalizeCategory(category);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }
  }

  if (metalType && String(metalType).trim() !== '' && String(metalType).toLowerCase() !== 'all') {
    try {
      imageFilter.metalType = normalizeMetalType(metalType);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }
  }

  const minG =
    minGrams !== undefined && minGrams !== null && String(minGrams).trim() !== ''
      ? Number(minGrams)
      : null;
  const maxG =
    maxGrams !== undefined && maxGrams !== null && String(maxGrams).trim() !== ''
      ? Number(maxGrams)
      : null;
  if (minG != null || maxG != null) {
    imageFilter.grams = {};
    if (minG != null) {
      if (isNaN(minG) || minG < 0) {
        return res.status(400).json({ success: false, message: 'minGrams must be a non-negative number' });
      }
      imageFilter.grams.$gte = minG;
    }
    if (maxG != null) {
      if (isNaN(maxG) || maxG < 0) {
        return res.status(400).json({ success: false, message: 'maxGrams must be a non-negative number' });
      }
      imageFilter.grams.$lte = maxG;
    }
  }

  const [total, images] = await Promise.all([
    CatalogImage.countDocuments(imageFilter),
    CatalogImage.find(imageFilter)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit),
  ]);

  const catalogMap = new Map(catalogs.map((c) => [String(c._id), c]));
  const shopIds = catalogs.filter((c) => c.tenantType === 'SHOP').map((c) => c.tenantId);
  const userIds = catalogs.filter((c) => c.tenantType === 'SERVICE_PROVIDER').map((c) => c.tenantId);

  const [shops, users] = await Promise.all([
    shopIds.length ? Shop.find({ _id: { $in: shopIds } }) : [],
    userIds.length ? User.find({ _id: { $in: userIds } }) : [],
  ]);

  const shopMap = new Map(shops.map((s) => [String(s._id), s]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const items = images.map((img) => {
    const catalog = catalogMap.get(String(img.catalogId));
    const seller =
      catalog?.tenantType === 'SHOP'
        ? shopMap.get(String(catalog.tenantId))
        : userMap.get(String(catalog?.tenantId));

    return {
      item: img,
      catalog: catalog || null,
      seller: seller
        ? {
            _id: seller._id,
            type: catalog.tenantType,
            name: seller.shopName || seller.userName || seller.name || null,
            phoneNumber: seller.phoneNumber || null,
            whatsappNumber: seller.whatsappNumber || null,
            state: seller.state || null,
            district: seller.district || null,
            address: seller.address || null,
          }
        : null,
    };
  });

  res.json({
    success: true,
    data: {
      items,
      page: parsedPage,
      limit: parsedLimit,
      total,
      categories: ITEM_CATEGORIES,
      metalTypes: METAL_TYPES,
    },
  });
});

/** Catalogs whose tenant has an active catalog subscription (Shift Ecommerce marketplace). */
const getCatalogsForActiveSubscriptions = async () => {
  const now = new Date();
  const tenantQuery = {
    catalogEnabled: true,
    $or: [
      { catalogSubscriptionEndDate: null },
      { catalogSubscriptionEndDate: { $exists: false } },
      { catalogSubscriptionEndDate: { $gte: now } },
    ],
  };
  const [shops, users] = await Promise.all([
    Shop.find(tenantQuery).select('_id'),
    User.find(tenantQuery).select('_id'),
  ]);
  const or = [];
  shops.forEach((s) => or.push({ tenantType: 'SHOP', tenantId: s._id }));
  users.forEach((u) => or.push({ tenantType: 'SERVICE_PROVIDER', tenantId: u._id }));
  if (!or.length) return [];
  return Catalog.find({ $or: or }).sort({ createdAt: -1 });
};

// GET /api/public/market/items (alias: /shift-ecommerce/items) — same filters as /catalog-items but only active catalog tenants
const getShiftEcommerceItems = asyncHandler(async (req, res) => {
  const { category, metalType, minGrams, maxGrams, page = 1, limit = 50 } = req.query;

  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  const catalogs = await getCatalogsForActiveSubscriptions();
  if (!catalogs.length) {
    return res.json({
      success: true,
      data: {
        items: [],
        page: parsedPage,
        limit: parsedLimit,
        total: 0,
        categories: ITEM_CATEGORIES,
        metalTypes: METAL_TYPES,
      },
    });
  }

  const catalogIds = catalogs.map((c) => c._id);
  const imageFilter = { catalogId: { $in: catalogIds } };

  if (category && String(category).trim() !== '') {
    try {
      imageFilter.category = normalizeCategory(category);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }
  }

  if (metalType && String(metalType).trim() !== '' && String(metalType).toLowerCase() !== 'all') {
    try {
      imageFilter.metalType = normalizeMetalType(metalType);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }
  }

  const minG =
    minGrams !== undefined && minGrams !== null && String(minGrams).trim() !== ''
      ? Number(minGrams)
      : null;
  const maxG =
    maxGrams !== undefined && maxGrams !== null && String(maxGrams).trim() !== ''
      ? Number(maxGrams)
      : null;
  if (minG != null || maxG != null) {
    imageFilter.grams = {};
    if (minG != null) {
      if (isNaN(minG) || minG < 0) {
        return res.status(400).json({ success: false, message: 'minGrams must be a non-negative number' });
      }
      imageFilter.grams.$gte = minG;
    }
    if (maxG != null) {
      if (isNaN(maxG) || maxG < 0) {
        return res.status(400).json({ success: false, message: 'maxGrams must be a non-negative number' });
      }
      imageFilter.grams.$lte = maxG;
    }
  }

  const [total, images] = await Promise.all([
    CatalogImage.countDocuments(imageFilter),
    CatalogImage.find(imageFilter)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit),
  ]);

  const catalogMap = new Map(catalogs.map((c) => [String(c._id), c]));
  const shopIds = catalogs.filter((c) => c.tenantType === 'SHOP').map((c) => c.tenantId);
  const userIds = catalogs.filter((c) => c.tenantType === 'SERVICE_PROVIDER').map((c) => c.tenantId);

  const [shops, spUsers] = await Promise.all([
    shopIds.length ? Shop.find({ _id: { $in: shopIds } }) : [],
    userIds.length ? User.find({ _id: { $in: userIds } }) : [],
  ]);

  const shopMap = new Map(shops.map((s) => [String(s._id), s]));
  const userMap = new Map(spUsers.map((u) => [String(u._id), u]));

  const items = images.map((img) => {
    const catalog = catalogMap.get(String(img.catalogId));
    const seller =
      catalog?.tenantType === 'SHOP'
        ? shopMap.get(String(catalog.tenantId))
        : userMap.get(String(catalog?.tenantId));

    return {
      item: img,
      catalog: catalog || null,
      seller: seller
        ? {
            _id: seller._id,
            type: catalog.tenantType,
            name: seller.shopName || seller.userName || seller.name || null,
            phoneNumber: seller.phoneNumber || null,
            whatsappNumber: seller.whatsappNumber || null,
            state: seller.state || null,
            district: seller.district || null,
            address: seller.address || null,
          }
        : null,
    };
  });

  res.json({
    success: true,
    data: {
      items,
      page: parsedPage,
      limit: parsedLimit,
      total,
      categories: ITEM_CATEGORIES,
      metalTypes: METAL_TYPES,
    },
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
  const tenant = resolved.tenant;
  const now = new Date();
  const planKey = tenant.catalogPlan || 'BASIC';
  const planLimits = PLAN_LIMITS[planKey] || PLAN_LIMITS.BASIC;
  const active =
    tenant.catalogEnabled && (!tenant.catalogSubscriptionEndDate || tenant.catalogSubscriptionEndDate >= now);
  res.json({
    success: true,
    data: {
      catalogEnabled: !!active,
      catalogPlan: planKey,
      catalogSubscriptionEndDate: tenant.catalogSubscriptionEndDate || null,
      storageUsedMb: tenant.storageUsedMb || 0,
      storageLimitMb: planLimits.storageMb,
      totalImages: tenant.totalImages || 0,
      imagesLimit: planLimits.images,
    },
  });
});

// GET /api/catalogs/admin/all — admin: all catalogs across all tenants
const getAllCatalogsAdmin = asyncHandler(async (req, res) => {
  const catalogs = await Catalog.find({}).sort({ createdAt: -1 });
  res.json({ success: true, data: catalogs });
});

// PATCH /api/catalogs/admin/subscription — admin: manage catalog subscription for a tenant
// Body: { tenantType: 'SHOP'|'SERVICE_PROVIDER', tenantId, catalogPlan?: 'BASIC'|'PRO', extendDays?: number, catalogEnabled?: boolean, catalogSubscriptionEndDate?: ISO string }
const updateCatalogSubscriptionAdmin = asyncHandler(async (req, res) => {
  const { tenantType, tenantId, catalogPlan, extendDays, catalogEnabled, catalogSubscriptionEndDate } = req.body || {};

  const tt = String(tenantType || '').trim().toUpperCase();
  if (!['SHOP', 'SERVICE_PROVIDER'].includes(tt)) {
    return res.status(400).json({ success: false, message: 'tenantType must be SHOP or SERVICE_PROVIDER' });
  }
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'tenantId is required' });
  }

  const plan = catalogPlan != null ? String(catalogPlan).trim().toUpperCase() : undefined;
  if (plan != null && plan !== '' && !['BASIC', 'PRO'].includes(plan)) {
    return res.status(400).json({ success: false, message: 'catalogPlan must be BASIC or PRO' });
  }

  const days = extendDays != null ? Number(extendDays) : null;
  if (days != null && (!Number.isFinite(days) || days < 0)) {
    return res.status(400).json({ success: false, message: 'extendDays must be a non-negative number' });
  }

  const explicitEnd =
    catalogSubscriptionEndDate != null && String(catalogSubscriptionEndDate).trim() !== ''
      ? new Date(catalogSubscriptionEndDate)
      : null;
  if (explicitEnd && isNaN(explicitEnd.getTime())) {
    return res.status(400).json({ success: false, message: 'catalogSubscriptionEndDate must be a valid ISO date string' });
  }

  const Model = tt === 'SHOP' ? Shop : User;
  const tenant = await Model.findById(tenantId);
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

  const update = {};
  if (typeof catalogEnabled === 'boolean') update.catalogEnabled = catalogEnabled;
  if (plan) update.catalogPlan = plan;

  if (explicitEnd) {
    const now = new Date();
    update.catalogSubscriptionStartDate = tenant.catalogSubscriptionStartDate || now;
    update.catalogSubscriptionEndDate = explicitEnd;
    update.catalogEnabled = true;
  }

  if (days != null) {
    const now = new Date();
    const currentEnd = tenant.catalogSubscriptionEndDate && tenant.catalogSubscriptionEndDate > now
      ? tenant.catalogSubscriptionEndDate
      : now;
    const nextEnd = new Date(currentEnd);
    nextEnd.setDate(nextEnd.getDate() + days);
    update.catalogSubscriptionStartDate = tenant.catalogSubscriptionStartDate || now;
    update.catalogSubscriptionEndDate = nextEnd;
    update.catalogEnabled = true;
  }

  const updated = await Model.findByIdAndUpdate(tenantId, update, { new: true });
  res.json({ success: true, data: updated });
});

module.exports = {
  createCatalog,
  getMyCatalogs,
  uploadCatalogImage,
  bulkUploadCatalogImages,
  deleteCatalogImage,
  getPublicCatalog,
  getPublicCatalogsByTenant,
  getShiftEcommerceItems,
  getCatalogImages,
  getAllCatalogsAdmin,
  getCatalogSubscriptionStatus,
  updateCatalogSubscriptionAdmin,
  getPublicCatalogItems,
};
