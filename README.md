# Gold Backend API

REST API for the Gold app built with **Node.js**, **Express.js**, and **MongoDB (Mongoose)**.

## Tech Stack

- Node.js + Express.js
- MongoDB with Mongoose
- JWT authentication
- bcrypt for password hashing
- dotenv for environment variables
- Multer + Cloudinary for image uploads
- express-validator for validation
- MVC folder structure

## Setup

### 1. Install dependencies

```bash
cd goldbackend
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (e.g. `mongodb://localhost:27017/goldbackend`) |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `PORT` | Server port (default `5000`) |

### 3. Run the server

```bash
npm run dev
```

Runs with nodemon. For production:

```bash
npm start
```

### 4. Seed data (optional)

```bash
npm run seed
```

Creates sample global users, shops, and users.

### 5. Test all APIs (optional)

With the server running in one terminal (`npm run dev`), in another terminal:

```bash
npm run test:api
```

Runs a script that calls health, auth (register/login), shop and user register/list/single, and checks 404. Requires Node 18+ (uses built-in `fetch`).

---

## API Overview

Base URL: `http://localhost:5000` (or your `PORT`)

### Authentication

- **POST** `/api/auth/register` – Register global user (contact)
- **POST** `/api/auth/login` – Login (returns JWT)
- **POST** `/api/auth/forgot-password` – Request password reset (email or phone) → returns `resetToken`
- **POST** `/api/auth/reset-password` – Set new password with `resetToken` + `newPassword`
- **POST** `/api/auth/change-password` – Change password when logged in (JWT + `currentPassword`, `newPassword`)

### Shops

- **POST** `/api/shops` – Register shop (multipart: body + up to 5 images)
- **GET** `/api/shops` – List shops (pagination, search, filters)
- **GET** `/api/shops/:id` – Get single shop

**Note:** Shop and user list/detail are public. Phone numbers are only returned when the request includes a valid `Authorization: Bearer <token>`.

### Users

- **POST** `/api/users` – Register user (multipart: body + optional profile image)
- **GET** `/api/users` – List users (pagination, search, filters)
- **GET** `/api/users/:id` – Get single user

### Help / Complaints

- **POST** `/api/help` – Submit a complaint (name, subject, message, email or phoneNumber; optional JWT to link to user)
- **GET** `/api/help` – List my complaints (requires JWT, pagination: page, limit)

---

## Example Request Bodies

### POST /api/auth/register

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}
```

Or with phone:

```json
{
  "name": "Jane Doe",
  "phoneNumber": "9876543210",
  "password": "secret123"
}
```

### POST /api/auth/login

```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

Or:

```json
{
  "phoneNumber": "9876543210",
  "password": "secret123"
}
```

### POST /api/auth/forgot-password

```json
{
  "email": "john@example.com"
}
```

Or with phone: `{ "phoneNumber": "9876543210" }`. Response includes `resetToken` (use within 1 hour).

### POST /api/auth/reset-password

```json
{
  "resetToken": "<token from forgot-password>",
  "newPassword": "newsecret123"
}
```

### POST /api/auth/change-password (requires Authorization: Bearer &lt;token&gt;)

```json
{
  "currentPassword": "secret123",
  "newPassword": "newsecret123"
}
```

### POST /api/help (complaint)

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Issue with order",
  "message": "Description of the complaint..."
}
```

Or with phone: include `phoneNumber` instead of/in addition to `email`. At least one of email or phoneNumber is required.

### POST /api/shops

- **Content-Type:** `multipart/form-data`
- **Body fields:** `shopName`, `address`, `pincode`, `phoneNumber`, `state`, `district`, `whatsappNumber` (optional)
- **Files:** `images` (max 5 files)

Example (form-data):

- shopName: "Gold Palace"
- address: "123 Main St"
- pincode: "560001"
- phoneNumber: "9876543210"
- state: "Karnataka"
- district: "Bangalore Urban"
- images: (file1, file2, ...)

### POST /api/users

- **Content-Type:** `multipart/form-data`
- **Body fields:** `userName`, `serviceProvided`, `address`, `state`, `district`, `pincode`, `phoneNumber` (all optional except userName, serviceProvided)
- **File:** `image` (single, optional – profile image)

---

## Query Parameters

### GET /api/shops

| Param | Description |
|-------|-------------|
| `search` | Text search (shopName, address, pincode, district, state) |
| `state` | Filter by state |
| `district` | Filter by district |
| `pincode` | Filter by pincode |
| `page` | Page number (default 1) |
| `limit` | Items per page (default 10, max 100) |

### GET /api/users

| Param | Description |
|-------|-------------|
| `search` | Text search (userName, address, pincode, district, serviceProvided) |
| `state` | Filter by state |
| `district` | Filter by district |
| `page` | Page number |
| `limit` | Items per page |

---

## Project Structure

```
goldbackend/
├── config/
│   ├── db.js           # MongoDB connection
│   └── cloudinary.js   # Cloudinary config
├── controllers/
│   ├── admobController.js
│   ├── authController.js
│   ├── goldController.js
│   ├── shopController.js
│   └── userController.js
├── middleware/
│   ├── asyncHandler.js
│   ├── auth.js         # Optional & required JWT
│   ├── errorHandler.js
│   ├── upload.js       # Multer + Cloudinary
│   └── validate.js     # express-validator
├── models/
│   ├── GlobalUser.js
│   ├── Shop.js
│   ├── Transaction.js
│   └── User.js
├── routes/
│   ├── admobRoutes.js
│   ├── authRoutes.js
│   ├── goldRoutes.js
│   ├── shopRoutes.js
│   └── userRoutes.js
├── scripts/
│   └── seed.js
├── utils/
│   ├── admobSsv.js
│   ├── pagination.js
│   └── search.js
├── .env.example
├── package.json
├── server.js
└── README.md
```

---

## Auth Header

For endpoints that return phone numbers (shops/users), send:

```
Authorization: Bearer <your_jwt_token>
```

Obtain the token from `POST /api/auth/login` or `/api/auth/register` (response field `data.token`).

---

## Gold Points & AdMob SSV

The backend includes a **Gold Points** reward system. Points are **only** granted via **AdMob Server-Side Verification (SSV)**; the frontend must never grant rewards on its own.

### How AdMob SSV works

1. User completes a rewarded ad in the app.
2. Google AdMob sends a **GET** request to your backend callback URL with query params: `user_id`, `reward_amount`, `signature`, `key_id`.
3. Backend **validates** the request (and in production should **verify the signature** with Google’s public keys), then:
   - Ensures the user exists and is not over the daily ad cap.
   - Credits 1 gold point, increments `adsWatchedToday`, updates `lastAdWatchDate`.
   - Saves a transaction with `source: "reward_ad"`.
4. Response is returned to AdMob; the app should only show “reward granted” after this callback succeeds.

**Security:** Rewards are granted only when the backend receives and accepts the SSV callback. The `utils/admobSsv.js` helper checks required params; for production you should verify the signature using Google’s verifier keys (e.g. [AdMob SSV docs](https://developers.google.com/admob/android/rewarded-video-ssv) or a library like `@exoshtw/admob-ssv`).

### Daily ad cap (max 20 per day)

- Each user may earn gold from **at most 20 rewarded ads per day**.
- `adsWatchedToday` is reset when the date changes (next calendar day).
- If the user has already reached 20 for the day, the SSV endpoint returns **429** with a clear message; no gold is added.

### How gold usage works

- **Unlock phone:** `POST /api/gold/unlock-phone` — costs **2** gold points; records a spend transaction.
- **Boost shop:** `POST /api/gold/boost-shop` — costs **10** gold points; sets `boostExpires` on the user’s shop (e.g. 7 days).
- **Remove ads:** `POST /api/gold/remove-ads` — costs **5** gold points; sets `adFreeUntil` on the user (e.g. 30 days).

All gold routes require **JWT** (`Authorization: Bearer <token>`). Each endpoint checks balance before deducting and records a transaction with the appropriate `source`.

### Premium users

If `user.isPremium === true`:

- No gold is deducted for unlock / boost / remove-ads.
- SSV reward endpoint returns success without adding gold (premium users skip ads).
- Future payment integration (e.g. Razorpay) can set `isPremium`; payment logic is not implemented yet.

### Gold & AdMob API summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admob/reward` | No (callback from Google) | SSV: grant 1 gold if user exists and under daily cap |
| POST | `/api/gold/unlock-phone` | JWT | Spend 2 gold; record transaction |
| POST | `/api/gold/boost-shop` | JWT | Spend 10 gold; set shop `boostExpires` |
| POST | `/api/gold/remove-ads` | JWT | Spend 5 gold; set user `adFreeUntil` |
| GET | `/api/gold/wallet` | JWT | Balance, ads today, remaining ads, paginated transactions |

### Response format

All Gold/AdMob responses use the same shape:

```json
{
  "success": true,
  "message": "Reward granted",
  "data": { ... }
}
```

Errors use `success: false` and appropriate HTTP status (400, 401, 404, 429).

### Example requests and responses

**1. AdMob SSV callback (GET – called by Google)**

```bash
curl -X GET "http://localhost:5000/api/admob/reward?user_id=USER_MONGO_ID&reward_amount=1&signature=SIGNATURE&key_id=KEY_ID"
```

Success (200):

```json
{
  "success": true,
  "message": "Reward granted",
  "data": {
    "goldPoints": 5,
    "adsWatchedToday": 3,
    "remainingAdsToday": 17
  }
}
```

Daily cap reached (429):

```json
{
  "success": false,
  "message": "Daily ad limit reached (max 20 per day)",
  "data": { "adsWatchedToday": 20, "remaining": 0 }
}
```

**2. Unlock phone (POST – requires JWT)**

```bash
curl -X POST http://localhost:5000/api/gold/unlock-phone \
  -H "Authorization: Bearer YOUR_JWT"
```

Success (200):

```json
{
  "success": true,
  "message": "Phone unlocked",
  "data": {
    "goldPoints": 8,
    "transaction": { "type": "spend", "amount": 2, "source": "unlock_phone" }
  }
}
```

**3. Wallet (GET – requires JWT)**

```bash
curl -X GET "http://localhost:5000/api/gold/wallet?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT"
```

Success (200):

```json
{
  "success": true,
  "message": "Wallet retrieved",
  "data": {
    "goldPoints": 10,
    "adsWatchedToday": 5,
    "remainingAdsToday": 15,
    "isPremium": false,
    "adFreeUntil": null,
    "transactions": [...],
    "pagination": { "page": 1, "limit": 10, "total": 12, "pages": 2 }
  }
}
```

### Sample MongoDB documents

**GlobalUser** (gold-related fields):

```json
{
  "_id": "ObjectId(\"...\")",
  "name": "John",
  "email": "john@example.com",
  "goldPoints": 10,
  "adsWatchedToday": 5,
  "lastAdWatchDate": "2025-02-14T10:00:00.000Z",
  "isPremium": false,
  "adFreeUntil": null
}
```

**Transaction**:

```json
{
  "_id": "ObjectId(\"...\")",
  "user": "ObjectId(\"...\")",
  "type": "earn",
  "amount": 1,
  "source": "reward_ad",
  "createdAt": "2025-02-14T10:00:00.000Z"
}
```

**Shop** (boost):

```json
{
  "_id": "ObjectId(\"...\")",
  "shopName": "Gold Palace",
  "globalUserRef": "ObjectId(\"...\")",
  "boostExpires": "2025-02-21T10:00:00.000Z"
}
```

### Project structure (Gold / AdMob)

```
goldbackend/
├── controllers/
│   ├── admobController.js   # SSV reward handler
│   └── goldController.js    # unlock, boost, remove-ads, wallet
├── models/
│   ├── GlobalUser.js        # goldPoints, adsWatchedToday, lastAdWatchDate, isPremium, adFreeUntil
│   ├── Transaction.js       # user, type, amount, source
│   └── Shop.js              # boostExpires
├── routes/
│   ├── admobRoutes.js       # GET /reward
│   └── goldRoutes.js        # /unlock-phone, /boost-shop, /remove-ads, /wallet
└── utils/
    └── admobSsv.js          # SSV param validation (extend for signature verification)
```
