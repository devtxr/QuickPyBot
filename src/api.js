const express = require("express");
const crypto = require("crypto");
const { Merchant } = require("./db");
const { hashApiKey, safeEqualHex } = require("./crypto");
const { generateQr, verifyPayment } = require("./paytmWorker");

const router = express.Router();

function getApiKey(req) {
  const direct = req.get("X-API-Key");
  if (direct) return direct.trim();

  const auth = req.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return "";
}

async function authenticate(req, res, next) {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey || apiKey.length > 200) {
      return res.status(401).json({
        status: "error",
        message: "Missing or invalid API key."
      });
    }

    const keyHash = hashApiKey(apiKey);
    const merchant = await Merchant.findOne({ apiKeyHash, active: true });

    if (!merchant || !safeEqualHex(keyHash, merchant.apiKeyHash)) {
      return res.status(401).json({
        status: "error",
        message: "Invalid API key."
      });
    }

    req.merchant = merchant;
    next();
  } catch (error) {
    next(error);
  }
}

function validAmount(value) {
  const s = String(value ?? "");
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s) && Number(s) > 0;
}

function validOrderId(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9._:-]{1,64}$/.test(value);
}

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "payment-gateway" });
});

router.post("/create-payment", authenticate, async (req, res, next) => {
  try {
    const { amount, order_id, note } = req.body || {};

    if (!validAmount(amount)) {
      return res.status(400).json({
        status: "error",
        message: "amount must be a positive number with up to 2 decimals."
      });
    }

    const orderId = order_id || `ORD_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    if (!validOrderId(orderId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid order_id. Use letters, numbers, ., _, :, or - only."
      });
    }

    const qr = await generateQr({
      upiId: req.merchant.upiId,
      amount,
      orderId,
      name: req.merchant.merchantName,
      note: note || `Payment ${orderId}`
    });

    res.json({
      status: "success",
      order_id: orderId,
      amount: String(amount),
      qr_url: qr.qr_url,
      upi_uri: qr.upi_uri
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verify-payment", authenticate, async (req, res, next) => {
  try {
    const { order_id, env = "prod" } = req.body || {};

    if (!validOrderId(order_id)) {
      return res.status(400).json({
        status: "error",
        message: "A valid order_id is required."
      });
    }

    if (!["prod", "stage"].includes(env)) {
      return res.status(400).json({
        status: "error",
        message: "env must be prod or stage."
      });
    }

    const result = await verifyPayment({
      mid: req.merchant.mid,
      orderId: order_id,
      env
    });

    res.json({
      status: result.status,
      verified: Boolean(result.verified),
      order_id,
      data: result.data || null
    });
  } catch (error) {
    next(error);
  }
});

router.get("/docs", (req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Payment API Docs</title>
<style>
body{font-family:system-ui;background:#0b1020;color:#eee;max-width:850px;margin:40px auto;padding:20px}
pre{background:#151b2d;padding:16px;border-radius:10px;overflow:auto}
code{color:#8ee7ff}a{color:#8ee7ff}
</style></head><body>
<h1>Payment API</h1>
<p>Use your API key in <code>X-API-Key</code> or <code>Authorization: Bearer ...</code>.</p>
<h2>Create Payment</h2>
<pre>POST /api/create-payment
Content-Type: application/json
X-API-Key: cs_live_xxx

{
  "amount": "100.00",
  "order_id": "ORDER_123",
  "note": "Order payment"
}</pre>
<h2>Response</h2>
<pre>{
  "status": "success",
  "order_id": "ORDER_123",
  "amount": "100.00",
  "qr_url": "https://...",
  "upi_uri": "upi://pay?..."
}</pre>
<h2>Verify Payment</h2>
<pre>POST /api/verify-payment
Content-Type: application/json
X-API-Key: cs_live_xxx

{
  "order_id": "ORDER_123",
  "env": "prod"
}</pre>
<h2>JavaScript</h2>
<pre>const r = await fetch("YOUR_API_URL/api/create-payment", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY"
  },
  body: JSON.stringify({
    amount: "100.00",
    order_id: "ORDER_123"
  })
});
const data = await r.json();</pre>
<p>Keep your API key private. Do not expose it in public frontend code.</p>
</body></html>`);
});

router.use((err, req, res, next) => {
  console.error(err);
  res.status(502).json({
    status: "error",
    message: err.message || "Payment service error."
  });
});

module.exports = router;
