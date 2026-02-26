# Razorpay Subscriptions (AutoPay)

## Overview

Service Provider and Shop listings use **Razorpay Subscriptions** with `total_count: 0` (unlimited monthly billing until the user cancels). Activation and renewals are driven by webhooks; the app does not activate subscriptions from the payment success callback.

## Plan IDs

- **Service Provider**: `plan_SKfWn8O1Naj9Nn` (env: `RAZORPAY_PLAN_SERVICE`)
- **Shop**: `plan_SKfc3LUbFHdPVp` (env: `RAZORPAY_PLAN_SHOP`)

## Backend

### Create subscription

- **POST** `/api/subscription/create` (auth required)
- Body: `{ "plan_type": "SERVICE" | "SHOP" }`
- Response: `{ "subscription_id", "razorpay_key" }`

The backend creates a Razorpay customer (if needed), then a subscription with `total_count: 0` and `customer_notify: 1`, and stores a row in `subscriptions` with `subscription_status: CREATED`.

### Webhook

- **POST** `/api/webhook/razorpay`
- **Must** receive the **raw request body** (no JSON body parser) for signature verification.
- Configure in Razorpay Dashboard: **Settings → Webhooks** with URL:  
  `https://your-api-domain.com/api/webhook/razorpay`
- Set **Webhook Secret** in Dashboard and add to env: `RAZORPAY_WEBHOOK_SECRET`.

**Events handled:**

| Event                   | Action |
|-------------------------|--------|
| `subscription.activated` | Set status ACTIVE, set start_date and expiry_date (+30 days), update User/Shop subscription dates. |
| `subscription.charged`   | Add +30 days to expiry_date, insert/update `subscription_payments`, keep status ACTIVE, update User/Shop expiry. |
| `payment.failed`          | Set subscription_status = PAYMENT_FAILED. |
| `subscription.cancelled` | Set subscription_status = CANCELLED. |

## Frontend

1. Call `createSubscription('SERVICE' | 'SHOP')` to get `subscription_id` and `razorpay_key`.
2. Open Razorpay checkout with `subscription_id` (no `order_id`).
3. On success, show a message that the subscription will be activated shortly; **do not** call a verify endpoint or set subscription locally. Rely on webhook + refresh (e.g. pull-to-refresh or `getMe()`).

## Environment

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` – API keys.
- `RAZORPAY_WEBHOOK_SECRET` – From Dashboard → Webhooks (required for subscription webhooks).
- Optional: `RAZORPAY_PLAN_SERVICE`, `RAZORPAY_PLAN_SHOP` – Override default plan IDs.

## Database

- **subscriptions**: user_id, plan_type, razorpay_subscription_id, subscription_status, start_date, expiry_date.
- **subscription_payments**: user_id, subscription_id, razorpay_payment_id, amount, payment_date, status.

Subscription is not auto-cancelled; it runs until the user cancels in Razorpay or via your UI if you add a cancel API.
