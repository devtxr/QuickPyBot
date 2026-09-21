require("dotenv").config();

const required = [
  "BOT_TOKEN",
  "MONGODB_URI",
  "PUBLIC_API_URL",
  "PAYTM_WORKER_URL",
  "APP_ENCRYPTION_KEY"
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.APP_ENCRYPTION_KEY)) {
  throw new Error("APP_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.");
}

module.exports = {
  botToken: process.env.BOT_TOKEN,
  mongoUri: process.env.MONGODB_URI,
  publicApiUrl: process.env.PUBLIC_API_URL.replace(/\/+$/, ""),
  paytmWorkerUrl: process.env.PAYTM_WORKER_URL.replace(/\/+$/, ""),
  encryptionKey: Buffer.from(process.env.APP_ENCRYPTION_KEY, "hex"),
  port: Number(process.env.PORT || 10000)
};
