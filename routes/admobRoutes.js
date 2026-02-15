const express = require('express');
const { reward } = require('../controllers/admobController');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.get('/reward', asyncHandler(reward));

module.exports = router;
