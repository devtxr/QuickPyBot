// Example website integration.
// Keep your API key on a trusted backend; do not expose it in public browser JS.

async function createPayment() {
  const response = await fetch("https://YOUR-RENDER-APP.onrender.com/api/create-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "cs_live_YOUR_KEY"
    },
    body: JSON.stringify({
      amount: "100.00",
      order_id: "ORDER_12345",
      note: "Test payment"
    })
  });

  const data = await response.json();

  if (data.status !== "success") {
    throw new Error(data.message || "Payment creation failed");
  }

  console.log("QR:", data.qr_url);
  console.log("UPI:", data.upi_uri);
  console.log("Order:", data.order_id);

  // After the customer scans/pays, call your backend's verify endpoint.
}
