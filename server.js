require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load Cloudinary config (for uploads)
require('./config/cloudinary');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userRoutes = require('./routes/userRoutes');
const helpRoutes = require('./routes/helpRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const admobRoutes = require('./routes/admobRoutes');
const goldRoutes = require('./routes/goldRoutes');
const path = require('path');

connectDB();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/users', userRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admob', admobRoutes);
app.use('/api/gold', goldRoutes);

// Promotions admin UI (serve at /promotions-admin/)
app.use('/promotions-admin', express.static(path.join(__dirname, 'website')));
app.get('/promotions-admin', (req, res) => res.redirect('/promotions-admin/'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running' });
});

// AdMob app-ads.txt (no auth, public, text/plain)
app.get('/app-ads.txt', (req, res) => {
  res.type('text/plain');
  res.send('google.com, pub-4292460929510961, DIRECT, f08c47fec0942fa0');
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('app-ads.txt configured correctly');
});
