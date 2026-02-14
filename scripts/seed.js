/**
 * Seed script: run with `npm run seed`
 * Requires MONGODB_URI and Cloudinary env vars for image uploads.
 * Without Cloudinary, shop/user images will be empty.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const GlobalUser = require('../models/GlobalUser');
const Shop = require('../models/Shop');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldbackend';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  await GlobalUser.deleteMany({});
  await Shop.deleteMany({});
  await User.deleteMany({});

  const hashedPassword = await bcrypt.hash('password123', 12);

  const globalUsers = await GlobalUser.insertMany([
    { name: 'John Doe', email: 'john@example.com', password: hashedPassword },
    { name: 'Jane Smith', phoneNumber: '9876543210', password: hashedPassword },
  ]);
  console.log('Created GlobalUsers:', globalUsers.length);

  const shops = await Shop.insertMany([
    {
      shopName: 'Gold Palace',
      address: '123 Main Street, Market Area',
      pincode: '560001',
      phoneNumber: '9876543211',
      whatsappNumber: '9876543211',
      state: 'Karnataka',
      district: 'Bangalore Urban',
      images: [],
    },
    {
      shopName: 'Shine Jewellers',
      address: '45 MG Road',
      pincode: '560002',
      phoneNumber: '9876543212',
      state: 'Karnataka',
      district: 'Bangalore Urban',
      images: [],
    },
  ]);
  console.log('Created Shops:', shops.length);

  const users = await User.insertMany([
    {
      userName: 'Ravi Kumar',
      serviceProvided: 'Gold polishing and repair',
      address: 'Block A, Sector 2',
      state: 'Karnataka',
      district: 'Bangalore Urban',
      pincode: '560003',
      phoneNumber: '9876543213',
    },
    {
      userName: 'Priya Singh',
      serviceProvided: 'Custom jewellery design',
      state: 'Karnataka',
      district: 'Mysore',
      phoneNumber: '9876543214',
    },
  ]);
  console.log('Created Users:', users.length);

  console.log('Seed completed.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
