const { Telegraf, Markup } = require("telegraf");
const { Merchant } = require("./db");
const {
  generateApiKey,
  hashApiKey,
  encrypt,
  decrypt
} = require("./crypto");
const { publicApiUrl, botToken } = require("./config");
const {
  createPaymentToken,
  safeAmount,
  safeOrderId,
  makeOrderId
} = require("./paymentLink");

const { generateQr } = require("./paytmWorker");

const bot = new Telegraf(botToken);
const setupState = new Map();

const menu = Markup.inlineKeyboard([
  [Markup.button.callback("➕ Setup Payment", "setup")],
  [Markup.button.callback("🔗 Generate Payment Link", "generate_link")],
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
  return Merchant.findOne({
    telegramUserId: String(userId)
  });
}

function setupText(step) {
  if (step === "mid") {
    return `1/3 🔐 Send your Paytm Merchant ID (MID):

/cancel — cancel setup`;
  }

  if (step === "upi") {
    return `2/3 💳 Send your UPI ID
Example: merchant@paytm

/cancel — cancel setup`;
  }

  return `3/3 🏪 Send your merchant/store name.

Or type - to use "Merchant".

/cancel — cancel setup`;
}

/*
 * IMPORTANT:
 * Inline buttons edit the existing message instead
 * of creating a new menu message.
 */
async function editPanel(ctx, text, options = {}) {
  try {
    return await ctx.editMessageText(text, {
      ...options,
      ...menu
    });
  } catch (error) {
    const message = String(error.message || "");

    // Telegram says message is already identical.
    if (message.includes("message is not modified")) {
      return;
    }

    // If Telegram cannot edit the old message,
    // create one as fallback.
    return ctx.reply(text, {
      ...options,
      ...menu
    });
  }
}


// ===============================
// START
// ===============================

bot.start(async (ctx) => {
  await ctx.reply(
    `👋 Hello ${displayName(ctx)}!

💳 <b>Payment Gateway</b>

Setup your payment details once.

After setup you'll receive:
🔑 Unique API Key
🌐 API Endpoint
📚 API Documentation

You can then integrate the API into your website.`,
    {
      parse_mode: "HTML",
      ...menu
    }
  );
});


// ===============================
// SETUP PAYMENT
// ===============================

bot.action("setup", async (ctx) => {
  await ctx.answerCbQuery();

  setupState.set(String(ctx.from.id), {
    step: "mid"
  });

  await editPanel(
    ctx,
    `➕ <b>Setup Payment</b>

${setupText("mid")}`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// MY API KEY
// ===============================

bot.action("my_key", async (ctx) => {
  await ctx.answerCbQuery();

  const merchant = await getMerchant(ctx.from.id);

  if (!merchant) {
    return editPanel(
      ctx,
      `❌ <b>Payment account is not configured yet.</b>

Tap ➕ Setup Payment to configure your account.`,
      {
        parse_mode: "HTML"
      }
    );
  }

  const key = decrypt(merchant.encryptedApiKey);

  return editPanel(
    ctx,
    `🔑 <b>Your API Key</b>

<code>${key}</code>

⚠️ Keep this API key private.`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// API ENDPOINT
// ===============================

bot.action("api_endpoint", async (ctx) => {
  await ctx.answerCbQuery();

  return editPanel(
    ctx,
    `🌐 <b>API Endpoint</b>

<code>${publicApiUrl}/api</code>`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// API DOCS
// ===============================

bot.action("docs", async (ctx) => {
  await ctx.answerCbQuery();

  return editPanel(
    ctx,
    `📚 <b>API Documentation</b>

${publicApiUrl}/api/docs`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// ACCOUNT
// ===============================

bot.action("account", async (ctx) => {
  await ctx.answerCbQuery();

  const merchant = await getMerchant(ctx.from.id);

  if (!merchant) {
    return editPanel(
      ctx,
      `❌ <b>No payment account configured.</b>

Tap ➕ Setup Payment to configure it.`,
      {
        parse_mode: "HTML"
      }
    );
  }

  return editPanel(
    ctx,
    `📊 <b>Account</b>

💳 MID:
<code>${merchant.mid}</code>

💰 UPI:
<code>${merchant.upiId}</code>

🏪 Store:
${merchant.merchantName}

📌 Status:
${merchant.active ? "✅ Active" : "❌ Disabled"}`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// REGENERATE API KEY
// ===============================

bot.action("regenerate", async (ctx) => {
  await ctx.answerCbQuery();

  const merchant = await getMerchant(ctx.from.id);

  if (!merchant) {
    return editPanel(
      ctx,
      `❌ <b>Payment account is not configured.</b>

Please setup your payment account first.`,
      {
        parse_mode: "HTML"
      }
    );
  }

  const key = generateApiKey();

  merchant.apiKeyHash = hashApiKey(key);
  merchant.encryptedApiKey = encrypt(key);
  merchant.apiKeyPrefix = key.slice(0, 16);

  await merchant.save();

  return editPanel(
    ctx,
    `✅ <b>API Key Regenerated</b>

🔑 New API Key:

<code>${key}</code>

⚠️ The previous API key is now invalid.`,
    {
      parse_mode: "HTML"
    }
  );
});


// ===============================
// TEXT INPUT / SETUP FLOW
// ===============================

bot.on("text", async (ctx) => {
  const userId = String(ctx.from.id);

  const state = setupState.get(userId);

  // User is not currently setting up payment.
  if (!state) {
    return;
  }

  const value = ctx.message.text.trim();

  // Cancel
  if (value === "/cancel") {
    setupState.delete(userId);

    return ctx.reply(
      "❌ Payment setup cancelled.",
      menu
    );
  }


  // =============================
  // STEP 1 - MID
  // =============================

  if (state.step === "mid") {

    if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
      return ctx.reply(
        `❌ Invalid Merchant ID.

Please send a valid Paytm Merchant ID.`
      );
    }

    state.mid = value;
    state.step = "upi";

    return ctx.reply(
      setupText("upi")
    );
  }


  // =============================
  // STEP 2 - UPI
  // =============================

  if (state.step === "upi") {

    if (
  value.length < 5 ||
  value.length > 128 ||
  !value.includes("@") ||
  /\s/.test(value) ||
  value.startsWith("@") ||
  value.endsWith("@")
) {
      return ctx.reply(
        `❌ Invalid UPI ID.

Example:
merchant@paytm`
      );
    }

    state.upiId = value;
    state.step = "name";

    return ctx.reply(
      setupText("name")
    );
  }


  // =============================
  // STEP 3 - MERCHANT NAME
  // =============================

  if (state.step === "name") {

    state.merchantName =
      value === "-"
        ? "Merchant"
        : value.slice(0, 80);


    // Generate unique API key
    const apiKey = generateApiKey();


    const merchantData = {
      telegramUserId: userId,

      username:
        ctx.from.username || "",

      firstName:
        ctx.from.first_name || "",

      mid:
        state.mid,

      upiId:
        state.upiId,

      merchantName:
        state.merchantName,

      apiKeyHash:
        hashApiKey(apiKey),

      encryptedApiKey:
        encrypt(apiKey),

      apiKeyPrefix:
        apiKey.slice(0, 16),

      active:
        true
    };


    await Merchant.findOneAndUpdate(
      {
        telegramUserId: userId
      },
      merchantData,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );


    setupState.delete(userId);


    return ctx.reply(
      `✅ <b>Payment Setup Complete!</b>

💳 <b>Merchant ID:</b>
<code>${state.mid}</code>

💰 <b>UPI ID:</b>
<code>${state.upiId}</code>

🏪 <b>Store:</b>
${state.merchantName}

━━━━━━━━━━━━━━

🔑 <b>Your API Key:</b>

<code>${apiKey}</code>

━━━━━━━━━━━━━━

🌐 <b>API Endpoint:</b>

<code>${publicApiUrl}/api</code>

━━━━━━━━━━━━━━

📚 <b>API Docs:</b>

${publicApiUrl}/api/docs

━━━━━━━━━━━━━━

⚠️ <b>Security:</b>
Never share your API key publicly.`,
      {
        parse_mode: "HTML",
        ...menu
      }
    );
  }
});


// ===============================
// ERROR HANDLER
// ===============================

bot.catch((error) => {
  console.error(
    "Telegram bot error:",
    error
  );
});


module.exports = {
  bot
};
