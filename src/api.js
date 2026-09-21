const express = require("express");

const { Merchant } = require("./db");

const {
  hashApiKey,
  safeEqualHex
} = require("./crypto");

const {
  generateQr,
  verifyPayment
} = require("./paytmWorker");

const {
  makeOrderId
} = require("./paymentLink");


const router = express.Router();


// =====================================================
// API KEY
// =====================================================

function getApiKey(req) {

  const direct =
    req.get("X-API-Key");

  if (direct) {
    return direct.trim();
  }


  const auth =
    req.get("Authorization") || "";


  if (
    auth.startsWith("Bearer ")
  ) {

    return auth
      .slice(7)
      .trim();

  }


  return "";
}


// =====================================================
// AUTHENTICATION
// =====================================================

async function authenticate(
  req,
  res,
  next
) {

  try {

    const apiKey =
      getApiKey(req);


    if (
      !apiKey ||
      apiKey.length > 200
    ) {

      return res.status(401).json({

        status:
          "error",

        message:
          "Missing or invalid API key."

      });

    }


    const keyHash =
      hashApiKey(
        apiKey
      );


    const merchant =
      await Merchant.findOne({

        apiKeyHash,

        active:
          true

      });


    if (
      !merchant ||
      !safeEqualHex(
        keyHash,
        merchant.apiKeyHash
      )
    ) {

      return res.status(401).json({

        status:
          "error",

        message:
          "Invalid API key."

      });

    }


    req.merchant =
      merchant;


    next();

  }

  catch (error) {

    next(error);

  }

}


// =====================================================
// AMOUNT VALIDATION
// =====================================================

function validAmount(value) {

  const s =
    String(value ?? "");


  return (
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s) &&
    Number(s) > 0
  );

}


// =====================================================
// ORDER ID VALIDATION
// =====================================================

function validOrderId(value) {

  return (
    typeof value === "string" &&
    /^QuickPyBot[A-Za-z0-9]+$/.test(value) &&
    value.length <= 64
  );

}


// =====================================================
// HEALTH
// =====================================================

router.get(
  "/health",
  (req, res) => {

    res.json({

      status:
        "ok",

      service:
        "payment-gateway"

    });

  }
);


// =====================================================
// CREATE PAYMENT
// =====================================================

router.post(
  "/create-payment",
  authenticate,
  async (req, res, next) => {

    try {

      const {
        amount,
        note
      } = req.body || {};


      // ---------------------------------------------
      // Validate amount
      // ---------------------------------------------

      if (
        !validAmount(amount)
      ) {

        return res.status(400).json({

          status:
            "error",

          message:
            "amount must be a positive number with up to 2 decimals."

        });

      }


      // ---------------------------------------------
      // AUTOMATIC ORDER ID
      // ---------------------------------------------

      const orderId =
        makeOrderId();


      // ---------------------------------------------
      // Validate generated Order ID
      // ---------------------------------------------

      if (
        !validOrderId(
          orderId
        )
      ) {

        return res.status(500).json({

          status:
            "error",

          message:
            "Unable to generate a valid order ID."

        });

      }


      // ---------------------------------------------
      // Generate QR
      // ---------------------------------------------

      const qr =
        await generateQr({

          upiId:
            req.merchant.upiId,

          amount:
            amount,

          orderId:
            orderId,

          name:
            req.merchant.merchantName,

          note:
            note ||
            `Payment ${orderId}`

        });


      // ---------------------------------------------
      // Response
      // ---------------------------------------------

      return res.json({

        status:
          "success",

        order_id:
          orderId,

        amount:
          String(amount),

        qr_url:
          qr.qr_url,

        upi_uri:
          qr.upi_uri

      });

    }

    catch (error) {

      next(error);

    }

  }
);


// =====================================================
// VERIFY PAYMENT
// =====================================================

router.post(
  "/verify-payment",
  authenticate,
  async (req, res, next) => {

    try {

      const {
        order_id,
        env = "prod"
      } = req.body || {};


      // ---------------------------------------------
      // Validate Order ID
      // ---------------------------------------------

      if (
        !validOrderId(
          order_id
        )
      ) {

        return res.status(400).json({

          status:
            "error",

          message:
            "A valid QuickPyBot order_id is required."

        });

      }


      // ---------------------------------------------
      // Validate environment
      // ---------------------------------------------

      if (
        !["prod", "stage"].includes(
          env
        )
      ) {

        return res.status(400).json({

          status:
            "error",

          message:
            "env must be prod or stage."

        });

      }


      // ---------------------------------------------
      // Verify payment
      // ---------------------------------------------

      const result =
        await verifyPayment({

          mid:
            req.merchant.mid,

          orderId:
            order_id,

          env:
            env

        });


      // ---------------------------------------------
      // Response
      // ---------------------------------------------

      return res.json({

        status:
          result.status,

        verified:
          Boolean(
            result.verified
          ),

        order_id:
          order_id,

        data:
          result.data || null

      });

    }

    catch (error) {

      next(error);

    }

  }
);


// =====================================================
// API DOCUMENTATION
// =====================================================

router.get(
  "/docs",
  (req, res) => {

    res.type("html").send(`<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width"
>

<title>
QuickPy Payment API
</title>

<style>

body {
  font-family:
    system-ui,
    Arial,
    sans-serif;

  background:
    #0b1020;

  color:
    #eee;

  max-width:
    850px;

  margin:
    40px auto;

  padding:
    20px;
}

h1 {
  margin-bottom:
    8px;
}

h2 {
  margin-top:
    35px;
}

pre {
  background:
    #151b2d;

  padding:
    16px;

  border-radius:
    10px;

  overflow:
    auto;
}

code {
  color:
    #8ee7ff;
}

.info {
  background:
    #111827;

  padding:
    15px;

  border-radius:
    10px;

  margin:
    20px 0;
}

</style>

</head>

<body>

<h1>
💳 QuickPy Payment API
</h1>

<p>
Create and verify UPI payments using your QuickPy API key.
</p>


<div class="info">

<b>Important:</b>

Order ID is generated automatically by QuickPy.

You only need to send the payment amount.

</div>


<h2>
🔐 Authentication
</h2>

<p>
Use your API key in either:
</p>

<pre>X-API-Key: cs_live_xxx</pre>

<p>
or:
</p>

<pre>
Authorization: Bearer cs_live_xxx
</pre>


<h2>
💰 Create Payment
</h2>

<pre>
POST /api/create-payment

Content-Type: application/json

X-API-Key: YOUR_API_KEY

{
  "amount": "100.00"
}
</pre>


<h2>
📦 Optional Note
</h2>

<pre>
{
  "amount": "100.00",
  "note": "Order payment"
}
</pre>


<h2>
✅ Response
</h2>

<pre>
{
  "status": "success",
  "order_id": "QuickPyBot1758441234567a3f21",
  "amount": "100.00",
  "qr_url": "https://...",
  "upi_uri": "upi://pay?..."
}
</pre>


<h2>
🔍 Verify Payment
</h2>

<p>
Use the <code>order_id</code> returned from Create Payment.
</p>

<pre>
POST /api/verify-payment

Content-Type: application/json

X-API-Key: YOUR_API_KEY

{
  "order_id": "QuickPyBot1758441234567a3f21",
  "env": "prod"
}
</pre>


<h2>
📱 JavaScript Integration
</h2>

<pre>
const response = await fetch(
  "YOUR_API_URL/api/create-payment",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "YOUR_API_KEY"
    },

    body: JSON.stringify({
      amount: "100.00"
    })
  }
);

const data =
  await response.json();

console.log(data.order_id);
console.log(data.qr_url);
console.log(data.upi_uri);
</pre>


<h2>
🔄 Verification Example
</h2>

<pre>
const response = await fetch(
  "YOUR_API_URL/api/verify-payment",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "YOUR_API_KEY"
    },

    body: JSON.stringify({
      order_id: data.order_id,
      env: "prod"
    })
  }
);

const result =
  await response.json();

console.log(result);
</pre>


<p>
⚠️ Keep your API key private.
Do not expose it in public frontend code.
</p>

</body>

</html>`);

  }
);


// =====================================================
// ERROR HANDLER
// =====================================================

router.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(err);

    res.status(502).json({

      status:
        "error",

      message:
        err.message ||
        "Payment service error."

    });

  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;
