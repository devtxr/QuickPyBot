const mongoose = require("mongoose");
const { mongoUri } = require("./config");

const merchantSchema = new mongoose.Schema(
  {
    telegramUserId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },

    mid: { type: String, required: true },
    upiId: { type: String, required: true },
    merchantName: { type: String, default: "Merchant" },

    apiKeyHash: { type: String, required: true, unique: true, index: true },
    encryptedApiKey: { type: String, required: true },
    apiKeyPrefix: { type: String, required: true },

    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Merchant = mongoose.model("Merchant", merchantSchema);

async function connectDb() {
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
}

module.exports = { Merchant, connectDb };
