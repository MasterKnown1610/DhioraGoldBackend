const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { uploadSingle, uploadCatalogBulk } = require('../middleware/upload');
const {
  createCatalog,
  getMyCatalogs,
  uploadCatalogImage,
  bulkUploadCatalogImages,
  deleteCatalogImage,
  getCatalogImages,
  getAllCatalogsAdmin,
  getCatalogSubscriptionStatus,
  updateCatalogSubscriptionAdmin,
} = require('../controllers/catalogController');

// Admin: all catalogs
router.get('/admin/all', getAllCatalogsAdmin);
router.patch('/admin/subscription', updateCatalogSubscriptionAdmin);

// Catalog subscription status
router.get('/subscription-status', requireAuth, getCatalogSubscriptionStatus);

// Create a new catalog
router.post('/', requireAuth, createCatalog);

// Get all my catalogs
router.get('/my', requireAuth, getMyCatalogs);

// Get images for a specific catalog (owner)
router.get('/:catalogId/images', requireAuth, getCatalogImages);

// Bulk upload up to 10 images — MUST come before /:catalogId/images to avoid route collision
router.post('/:catalogId/images/bulk', requireAuth, uploadCatalogBulk, bulkUploadCatalogImages);

// Single upload with price to a catalog
router.post('/:catalogId/images', requireAuth, uploadSingle, uploadCatalogImage);

// Delete a specific catalog image
router.delete('/:catalogId/images/:imageId', requireAuth, deleteCatalogImage);

module.exports = router;
