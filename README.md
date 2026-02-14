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
│   ├── authController.js
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
│   └── User.js
├── routes/
│   ├── authRoutes.js
│   ├── shopRoutes.js
│   └── userRoutes.js
├── scripts/
│   └── seed.js
├── utils/
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
