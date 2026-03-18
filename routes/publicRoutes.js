const express = require('express');
const router = express.Router();
const { getPublicCatalog, getPublicCatalogsByTenant } = require('../controllers/catalogController');

// Must be before /:catalogId to avoid route collision
router.get('/catalogs/by-tenant/:tenantId', getPublicCatalogsByTenant);

// Public catalog view (no auth required)
router.get('/catalogs/:catalogId', getPublicCatalog);

module.exports = router;
