const express = require("express");
const { connectDb } = require("./db");
const { bot } = require("./bot");
const { port, publicApiUrl } = require("./config");
const api = require("./api");

const {
  readPaymentToken,
  verifyLinkPayment
} = require("./paymentLink");

async function main() {
  await connectDb();

  const app = express();

  app.disable("x-powered-by");

  app.use(
    express.json({
      limit: "32kb"
    })
  );

  // =========================
  // HOME
  // =========================

  app.get("/", (req, res) => {
    res.json({
      service: "QuickPy Payment Gateway",
      status: "online",
      api: "/api",
      docs: "/api/docs"
    });
  });

  // =========================
  // API
  // =========================

  app.use("/api", api);

  // =========================
  // PAYMENT PAGE
  // =========================

  app.get("/pay/:token", async (req, res) => {
    try {
      const payment = readPaymentToken(
        req.params.token
      );

      if (!payment.amount || !payment.order_id) {
        return res.status(400).send("Invalid payment link.");
      }

      const amount = String(payment.amount);
      const orderId = String(payment.order_id);

      const qrUrl = payment.qr_url || "";
      const upiUri = payment.upi_uri || "";

      const token = encodeURIComponent(
        req.params.token
      );

      res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
>

<title>Pay ₹${amount}</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family:
    Inter,
    system-ui,
    Arial,
    sans-serif;

  background:
    radial-gradient(
      circle at top,
      #172554,
      #020617 65%
    );

  color: white;
  padding: 20px;
}

.card {
  width: 100%;
  max-width: 420px;

  background:
    rgba(255,255,255,0.08);

  border: 1px solid
    rgba(255,255,255,0.15);

  border-radius: 28px;

  padding: 28px;

  text-align: center;

  backdrop-filter: blur(20px);

  box-shadow:
    0 25px 80px
    rgba(0,0,0,0.45);
}

.logo {
  width: 70px;
  height: 70px;

  margin: 0 auto 15px;

  border-radius: 20px;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 32px;

  background:
    linear-gradient(
      135deg,
      #06b6d4,
      #6366f1,
      #a855f7
    );

  box-shadow:
    0 10px 35px
    rgba(99,102,241,0.45);
}

h1 {
  margin: 5px 0;
  font-size: 25px;
}

.amount {
  font-size: 42px;
  font-weight: 800;

  margin: 18px 0;

  background:
    linear-gradient(
      90deg,
      #22d3ee,
      #818cf8,
      #c084fc
    );

  -webkit-background-clip: text;
  color: transparent;
}

.info {
  background:
    rgba(255,255,255,0.06);

  border-radius: 15px;

  padding: 13px;

  margin-bottom: 18px;

  text-align: left;
}

.info div {
  display: flex;
  justify-content: space-between;

  margin: 7px 0;

  gap: 15px;
}

.label {
  color: #94a3b8;
}

.qr {
  width: 250px;
  height: 250px;

  max-width: 100%;

  background: white;

  padding: 12px;

  border-radius: 20px;

  object-fit: contain;

  margin: 10px auto 20px;
}

.pay-btn {
  width: 100%;

  border: 0;

  padding: 16px;

  border-radius: 15px;

  font-size: 17px;

  font-weight: 700;

  color: white;

  background:
    linear-gradient(
      135deg,
      #06b6d4,
      #4f46e5,
      #9333ea
    );

  cursor: pointer;
}

.pay-btn:disabled {
  opacity: .5;
}

.status {
  margin-top: 18px;

  padding: 14px;

  border-radius: 14px;

  background:
    rgba(255,255,255,0.06);

  color: #cbd5e1;
}

.success {
  background:
    rgba(34,197,94,0.15);

  color: #86efac;
}

.error {
  background:
    rgba(239,68,68,0.15);

  color: #fca5a5;
}

.small {
  color: #64748b;
  font-size: 12px;
  margin-top: 20px;
}

</style>

</head>

<body>

<div class="card">

  <div class="logo">
    💳
  </div>

  <h1>
    ${payment.merchantName || "Secure Payment"}
  </h1>

  <div class="amount">
    ₹${amount}
  </div>

  <div class="info">

    <div>
      <span class="label">
        Order ID
      </span>

      <strong>
        ${orderId}
      </strong>
    </div>

    <div>
      <span class="label">
        UPI
      </span>

      <strong>
        ${payment.upiId}
      </strong>
    </div>

  </div>

  ${
    qrUrl
      ? `<img
          class="qr"
          src="${qrUrl}"
          alt="Payment QR"
        >`
      : ""
  }

  ${
    upiUri
      ? `<button
          class="pay-btn"
          id="payBtn"
          onclick="openUPI()"
        >
          💳 Pay ₹${amount} Now
        </button>`
      : ""
  }

  <div
    class="status"
    id="status"
  >
    ⏳ Waiting for payment...
  </div>

  <div class="small">
    Secure payment powered by QuickPy
  </div>

</div>

<script>

const token = "${token}";

const upiUri =
  ${JSON.stringify(upiUri)};

function openUPI() {

  if (!upiUri) {
    return;
  }

  window.location.href = upiUri;
}

async function checkPayment() {

  try {

    const response =
      await fetch(
        "/pay/" +
        token +
        "/verify",
        {
          method: "POST"
        }
      );

    const data =
      await response.json();

    const status =
      document.getElementById(
        "status"
      );

    if (
      data.status === "success" &&
      data.verified === true
    ) {

      status.className =
        "status success";

      status.innerHTML =
        "✅ <b>Payment Successful!</b><br>" +
        "Your payment has been verified.";

      const button =
        document.getElementById(
          "payBtn"
        );

      if (button) {
        button.disabled = true;
        button.innerText =
          "✅ Payment Successful";
      }

      return;
    }

    if (data.status === "pending") {

      status.className =
        "status";

      status.innerHTML =
        "⏳ Waiting for payment...";

    }

  } catch (error) {

    console.error(error);

  }

}


// Check every 4 seconds.
setInterval(
  checkPayment,
  4000
);

checkPayment();

</script>

</body>
</html>`);
    } catch (error) {
      console.error(error);

      res.status(400).send(
        "Invalid or expired payment link."
      );
    }
  });

  // =========================
  // PAYMENT VERIFY
  // =========================

  app.post(
    "/pay/:token/verify",
    async (req, res) => {
      try {

        const payment =
          readPaymentToken(
            req.params.token
          );

        const result =
          await verifyLinkPayment(
            payment,
            bot
          );

        if (result.verified) {

          return res.json({
            status: "success",
            verified: true,
            order_id:
              payment.order_id
          });

        }

        return res.json({
          status: "pending",
          verified: false,
          order_id:
            payment.order_id
        });

      } catch (error) {

        console.error(
          "Payment verification error:",
          error
        );

        return res.status(400).json({
          status: "error",
          verified: false,
          message:
            "Unable to verify payment."
        });
      }
    }
  );

  // =========================
  // ERROR HANDLER
  // =========================

  app.use(
    (err, req, res, next) => {

      console.error(err);

      res.status(500).json({
        status: "error",
        message:
          "Internal server error."
      });

    }
  );

  app.listen(
    port,
    () => {
      console.log(
        `HTTP server listening on ${port}`
      );

      console.log(
        `Public URL: ${publicApiUrl}`
      );
    }
  );

  await bot.launch();

  console.log(
    "Telegram bot started."
  );

  process.once(
    "SIGINT",
    () => bot.stop("SIGINT")
  );

  process.once(
    "SIGTERM",
    () => bot.stop("SIGTERM")
  );
}

main().catch(
  (error) => {
    console.error(
      "Startup failed:",
      error
    );

    process.exit(1);
  }
);
