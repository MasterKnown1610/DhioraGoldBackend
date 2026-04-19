const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getCart,
  addCartItem,
  updateCartItemQty,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');

router.use(requireAuth);

router.get('/', getCart);
router.post('/items', addCartItem);
router.patch('/items/:catalogImageId', updateCartItemQty);
router.delete('/items/:catalogImageId', removeCartItem);
router.delete('/', clearCart);

module.exports = router;
