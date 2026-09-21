# Payment Gateway Telegram Bot

Node.js + Express + Telegraf + MongoDB gateway that wraps the existing
Paytm Worker API.

## What users do

1. Open the Telegram bot.
2. Tap `➕ Setup Payment`.
3. Send MID.
4. Send UPI ID.
5. Send store name.
6. Bot creates a unique API key.
7. User gets `/api` endpoint and docs URL.

## API

### Create payment

`POST /api/create-payment`

Headers:
- `X-API-Key: cs_live_xxx`
- `Content-Type: application/json`

Body:
```json
{
  "amount": "100.00",
  "order_id": "ORDER_123",
  "note": "My order"
}
```

Response:
```json
{
  "status": "success",
  "order_id": "ORDER_123",
  "amount": "100.00",
  "qr_url": "https://...",
  "upi_uri": "upi://pay?..."
}
```

### Verify payment

`POST /api/verify-payment`

```json
{
  "order_id": "ORDER_123",
  "env": "prod"
}
```

## Render setup

1. Push this folder to your GitHub repository.
2. Create a Render Web Service from the repository.
3. Add the environment variables from `.env.example`.
4. Set `PUBLIC_API_URL` to the exact Render URL.
5. Deploy.

## MongoDB

Create a MongoDB Atlas database and put its connection string into
`MONGODB_URI`.

## Generate APP_ENCRYPTION_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env` or real API keys to GitHub.

## Existing worker

The project calls:

`https://paytm-v2.codescan.workers.dev`

for:
- `/api/generate-qr`
- `/api/verify`

Make sure the worker and the payment verification method you use are
authorized and compatible with your merchant/payment account before
using this in production.
