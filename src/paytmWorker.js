const { paytmWorkerUrl } = require("./config");

async function workerRequest(path, options = {}) {
  const response = await fetch(`${paytmWorkerUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Payment worker returned non-JSON (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data.message || `Payment worker HTTP ${response.status}`);
  }

  return data;
}

async function generateQr({ upiId, amount, orderId, name, note }) {
  return workerRequest("/api/generate-qr", {
    method: "POST",
    body: JSON.stringify({
      upi_id: upiId,
      amount: String(amount),
      order_id: orderId,
      name: name || "Merchant",
      note: note || ""
    })
  });
}

async function verifyPayment({ mid, orderId, env = "prod" }) {
  return workerRequest("/api/verify", {
    method: "POST",
    body: JSON.stringify({
      mid,
      order_id: orderId,
      env
    })
  });
}

module.exports = { generateQr, verifyPayment };
