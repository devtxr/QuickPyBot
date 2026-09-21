const crypto = require("crypto");
const { encrypt, decrypt } = require("./crypto");
const { verifyPayment } = require("./paytmWorker");

const notifiedPayments = new Set();

function createPaymentToken(data) {
  return encrypt(JSON.stringify(data));
}

function readPaymentToken(token) {
  try {
    return JSON.parse(decrypt(token));
  } catch {
    throw new Error("Invalid or expired payment link.");
  }
}

function safeOrderId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9._:-]{1,64}$/.test(value)
  );
}

function safeAmount(value) {
  const s = String(value ?? "");

  return (
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s) &&
    Number(s) > 0
  );
}

function makeOrderId() {
  return `ORD_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

async function verifyLinkPayment(data, bot) {
  const result = await verifyPayment({
    mid: data.mid,
    orderId: data.order_id,
    env: "prod"
  });

  const verified =
    result.status === "success" &&
    Boolean(result.verified);

  if (verified) {
    const paymentId = data.order_id;

    if (!notifiedPayments.has(paymentId)) {
      notifiedPayments.add(paymentId);

      await bot.telegram.sendMessage(
        data.telegramUserId,
        `✅ <b>PAYMENT SUCCESSFUL</b>

💰 Amount: ₹${data.amount}
🧾 Order ID:
<code>${data.order_id}</code>

💳 UPI:
<code>${data.upiId}</code>

🎉 Payment has been verified successfully.`,
        {
          parse_mode: "HTML"
        }
      );
    }
  }

  return {
    verified,
    data: result.data || null
  };
}

module.exports = {
  createPaymentToken,
  readPaymentToken,
  verifyLinkPayment,
  safeAmount,
  safeOrderId,
  makeOrderId
};
