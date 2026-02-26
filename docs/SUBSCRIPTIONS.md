# Razorpay Subscriptions (AutoPay)

## Overview

Service Provider and Shop listings use **Razorpay Subscriptions** (e.g. 35 monthly billing cycles). Activation and renewals are driven by webhooks; the app does not activate subscriptions from the payment success callback.

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

Subscription runs for the configured `total_count` cycles (e.g. 35 months).

---

## Troubleshooting: Money not deducted / AutoPay not charging

1. **First payment (auth)**  
   The **first** deduction happens when the user completes the Razorpay checkout (enters card and pays). If they close checkout without paying, the subscription stays in `CREATED` and no money is taken. Ensure the user completes the full payment flow in the Razorpay screen.

2. **Webhook not configured**  
   Razorpay must call your webhook so your app marks the subscription active and (later) extends expiry on each charge.  
   - In **Razorpay Dashboard → Settings → Webhooks**, add URL: `https://your-api-domain.com/api/webhook/razorpay`  
   - Enable events: `subscription.activated`, `subscription.charged`, `payment.failed`, `subscription.cancelled`  
   - Copy the **Webhook Secret** and set it in your env as `RAZORPAY_WEBHOOK_SECRET`  
   - If the secret is wrong or URL unreachable, Razorpay may still charge the customer but your server will return 400 and you won’t see logs.

3. **Check server logs**  
   When a webhook is received you should see:  
   - `[webhook/razorpay] Event received: subscription.activated` (first payment success)  
   - `[webhook/razorpay] Event received: subscription.charged` (each recurring charge)  
   If these never appear, the webhook URL is not being hit (wrong URL, firewall, or not using HTTPS in production).

4. **Razorpay plan and AutoPay**  
   In Dashboard, ensure the **Plan** used (`RAZORPAY_PLAN_SERVICE` / `RAZORPAY_PLAN_SHOP`) is a **recurring** plan and that **Subscription / AutoPay** is enabled for your account.

5. **Subscription status in DB**  
   Check the `subscriptions` collection: after the first successful payment you should see `subscription_status: ACTIVE` and `start_date` / `expiry_date` set. If it stays `CREATED`, the first payment was never completed or the webhook never ran.
