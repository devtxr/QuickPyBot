const { Telegraf, Markup } = require("telegraf");
const { Merchant } = require("./db");
const { generateApiKey, hashApiKey, encrypt, decrypt } = require("./crypto");
const { publicApiUrl } = require("./config");

const bot = new Telegraf(require("./config").botToken);
const setupState = new Map();

const menu = Markup.inlineKeyboard([
  [Markup.button.callback("➕ Setup Payment", "setup")],
  [Markup.button.callback("🔑 My API Key", "my_key")],
  [Markup.button.callback("🌐 API Endpoint", "api_endpoint")],
  [Markup.button.callback("📚 API Docs", "docs")],
  [Markup.button.callback("📊 Account", "account")],
  [Markup.button.callback("🔄 Regenerate Key", "regenerate")]
]);

function displayName(ctx) {
  return ctx.from?.first_name || ctx.from?.username || "there";
}

async function getMerchant(userId) {
  return Merchant.findOne({ telegramUserId: String(userId) });
}

function setupText(step) {
  if (step === "mid") return "1/3 🔐 Send your Paytm Merchant ID (MID):";
  if (step === "upi") return "2/3 💳 Send your UPI ID (example: merchant@paytm):";
  return "3/3 🏪 Send your merchant/store name (or type - to use Merchant):";
}

bot.start(async (ctx) => {
  await ctx.reply(
    `👋 Hello ${displayName(ctx)}!\n\n` +
    `💳 Payment Gateway\n\n` +
    `Setup your payment details once. After that you'll get a unique API key and API endpoint for your website.`,
    menu
  );
});

bot.action("setup", async (ctx) => {
  await ctx.answerCbQuery();
  setupState.set(String(ctx.from.id), { step: "mid" });
  await ctx.reply(setupText("mid"));
});

bot.action("my_key", async (ctx) => {
  await ctx.answerCbQuery();
  const merchant = await getMerchant(ctx.from.id);

  if (!merchant) {
    return ctx.reply("❌ Payment account is not configured yet.", menu);
  }

  const key = decrypt(merchant.encryptedApiKey);
  await ctx.reply(
    `🔑 Your API Key\n\n<code>${key}</code>\n\n⚠️ Keep this key private.`,
    { parse_mode: "HTML", ...menu }
  );
});

bot.action("api_endpoint", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🌐 API Endpoint\n\n<code>${publicApiUrl}/api</code>`,
    { parse_mode: "HTML", ...menu }
  );
});

bot.action("docs", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `📚 API Documentation\n\n${publicApiUrl}/api/docs`,
    menu
  );
});

bot.action("account", async (ctx) => {
  await ctx.answerCbQuery();
  const merchant = await getMerchant(ctx.from.id);

  if (!merchant) {
    return ctx.reply("❌ No payment account configured.", menu);
  }

  await ctx.reply(
    `📊 Account\n\n` +
    `MID: <code>${merchant.mid}</code>\n` +
    `UPI: <code>${merchant.upiId}</code>\n` +
    `Store: ${merchant.merchantName}\n` +
    `Status: ${merchant.active ? "✅ Active" : "❌ Disabled"}`,
    { parse_mode: "HTML", ...menu }
  );
});

bot.action("regenerate", async (ctx) => {
  await ctx.answerCbQuery();

  const merchant = await getMerchant(ctx.from.id);
  if (!merchant) {
    return ctx.reply("❌ Setup your payment account first.", menu);
  }

  const key = generateApiKey();
  merchant.apiKeyHash = hashApiKey(key);
  merchant.encryptedApiKey = encrypt(key);
  merchant.apiKeyPrefix = key.slice(0, 16);
  await merchant.save();

  await ctx.reply(
    `✅ API key regenerated.\n\n🔑 New key:\n<code>${key}</code>\n\nThe old key is now invalid.`,
    { parse_mode: "HTML", ...menu }
  );
});

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);
  const state = setupState.get(userId);
  if (!state) return;

  const value = ctx.message.text.trim();

  if (value === "/cancel") {
    setupState.delete(userId);
    return ctx.reply("❌ Setup cancelled.", menu);
  }

  if (state.step === "mid") {
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
      return ctx.reply("❌ Invalid MID format. Send the Merchant ID again.");
    }
    state.mid = value;
    state.step = "upi";
    return ctx.reply(setupText("upi"));
  }

  if (state.step === "upi") {
    if (!/^[^\\s@]+@[^\\s@]+$/.test(value) || value.length > 128) {
      return ctx.reply("❌ Invalid UPI ID. Example: merchant@paytm");
    }
    state.upiId = value;
    state.step = "name";
    return ctx.reply(setupText("name"));
  }

  if (state.step === "name") {
    state.merchantName = value === "-" ? "Merchant" : value.slice(0, 80);

    const apiKey = generateApiKey();
    const update = {
      telegramUserId: userId,
      username: ctx.from.username || "",
      firstName: ctx.from.first_name || "",
      mid: state.mid,
      upiId: state.upiId,
      merchantName: state.merchantName,
      apiKeyHash: hashApiKey(apiKey),
      encryptedApiKey: encrypt(apiKey),
      apiKeyPrefix: apiKey.slice(0, 16),
      active: true
    };

    await Merchant.findOneAndUpdate(
      { telegramUserId: userId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    setupState.delete(userId);

    return ctx.reply(
      `✅ Payment setup complete!\n\n` +
      `💳 MID: <code>${state.mid}</code>\n` +
      `UPI: <code>${state.upiId}</code>\n\n` +
      `🔑 API Key:\n<code>${apiKey}</code>\n\n` +
      `🌐 API:\n<code>${publicApiUrl}/api</code>\n\n` +
      `📚 Docs:\n${publicApiUrl}/api/docs\n\n` +
      `⚠️ Save the API key securely. Anyone who has it can create/verify payments for this account.`,
      { parse_mode: "HTML", ...menu }
    );
  }
});

bot.catch((err) => console.error("Telegram bot error:", err));

module.exports = { bot };
