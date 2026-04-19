const express = require('express');
const router = express.Router();
const {
  getPublicCatalog,
  getPublicCatalogsByTenant,
  getPublicCatalogItems,
  getShiftEcommerceItems,
} = require('../controllers/catalogController');

// Must be before /:catalogId to avoid route collision
router.get('/catalogs/by-tenant/:tenantId', getPublicCatalogsByTenant);
router.get('/catalog-items', getPublicCatalogItems);
router.get('/market/items', getShiftEcommerceItems);
router.get('/shift-ecommerce/items', getShiftEcommerceItems);

// Public catalog view (no auth required)
router.get('/catalogs/:catalogId', getPublicCatalog);

module.exports = router;
