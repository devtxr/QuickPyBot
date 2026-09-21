const { Telegraf, Markup } = require("telegraf");
const { Merchant } = require("./db");

const {
  generateApiKey,
  hashApiKey,
  encrypt,
  decrypt
} = require("./crypto");

const {
  publicApiUrl,
  botToken
} = require("./config");

const {
  createPaymentToken,
  safeAmount,
  safeOrderId,
  makeOrderId
} = require("./paymentLink");

const {
  generateQr
} = require("./paytmWorker");

const bot = new Telegraf(botToken);

const setupState = new Map();


// =====================================================
// MAIN MENU
// =====================================================

const menu = Markup.inlineKeyboard([
  [
    Markup.button.callback(
      "➕ Setup Payment",
      "setup"
    )
  ],

  [
    Markup.button.callback(
      "🔗 Generate Payment Link",
      "generate_link"
    )
  ],

  [
    Markup.button.callback(
      "🔑 My API Key",
      "my_key"
    )
  ],

  [
    Markup.button.callback(
      "🌐 API Endpoint",
      "api_endpoint"
    )
  ],

  [
    Markup.button.callback(
      "📚 API Docs",
      "docs"
    )
  ],

  [
    Markup.button.callback(
      "📊 Account",
      "account"
    )
  ],

  [
    Markup.button.callback(
      "🔄 Regenerate Key",
      "regenerate"
    )
  ]
]);


// =====================================================
// HELPERS
// =====================================================

function displayName(ctx) {
  return (
    ctx.from?.first_name ||
    ctx.from?.username ||
    "there"
  );
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

Example:
merchant@paytm

/cancel — cancel setup`;

  }


  return `3/3 🏪 Send your merchant/store name.

Or type - to use "Merchant".

/cancel — cancel setup`;
}


// =====================================================
// EDIT PANEL
// =====================================================

async function editPanel(
  ctx,
  text,
  options = {}
) {

  try {

    return await ctx.editMessageText(
      text,
      {
        ...options,
        ...menu
      }
    );

  } catch (error) {

    const message =
      String(error.message || "");

    // Telegram message already same
    if (
      message.includes(
        "message is not modified"
      )
    ) {
      return;
    }

    // Fallback
    return ctx.reply(
      text,
      {
        ...options,
        ...menu
      }
    );
  }
}


// =====================================================
// START
// =====================================================

bot.start(async (ctx) => {

  await ctx.reply(

    `👋 Hello ${displayName(ctx)}!

💳 <b>QuickPy Payment Gateway</b>

Setup your payment details once.

After setup you'll receive:

🔑 Unique API Key
🌐 API Endpoint
📚 API Documentation
🔗 Payment Link

You can integrate the payment API into your website or generate payment links directly from Telegram.`,

    {
      parse_mode: "HTML",
      ...menu
    }

  );

});


// =====================================================
// SETUP PAYMENT
// =====================================================

bot.action(
  "setup",
  async (ctx) => {

    await ctx.answerCbQuery();

    setupState.set(
      String(ctx.from.id),
      {
        step: "mid"
      }
    );

    return editPanel(

      ctx,

      `➕ <b>Setup Payment</b>

${setupText("mid")}`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// GENERATE PAYMENT LINK
// =====================================================

bot.action(
  "generate_link",
  async (ctx) => {

    await ctx.answerCbQuery();

    const merchant =
      await getMerchant(
        ctx.from.id
      );

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


    setupState.set(
      String(ctx.from.id),
      {
        step: "link_amount"
      }
    );


    return editPanel(

      ctx,

      `🔗 <b>Generate Payment Link</b>

💰 Send the payment amount.

Example:

<code>100</code>

or

<code>100.50</code>

Send /cancel to cancel.`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// MY API KEY
// =====================================================

bot.action(
  "my_key",
  async (ctx) => {

    await ctx.answerCbQuery();

    const merchant =
      await getMerchant(
        ctx.from.id
      );


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


    const key =
      decrypt(
        merchant.encryptedApiKey
      );


    return editPanel(

      ctx,

      `🔑 <b>Your API Key</b>

<code>${key}</code>

⚠️ Keep this API key private.`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// API ENDPOINT
// =====================================================

bot.action(
  "api_endpoint",
  async (ctx) => {

    await ctx.answerCbQuery();

    return editPanel(

      ctx,

      `🌐 <b>API Endpoint</b>

<code>${publicApiUrl}/api</code>`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// API DOCS
// =====================================================

bot.action(
  "docs",
  async (ctx) => {

    await ctx.answerCbQuery();

    return editPanel(

      ctx,

      `📚 <b>API Documentation</b>

${publicApiUrl}/api/docs`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// ACCOUNT
// =====================================================

bot.action(
  "account",
  async (ctx) => {

    await ctx.answerCbQuery();

    const merchant =
      await getMerchant(
        ctx.from.id
      );


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
${
  merchant.active
    ? "✅ Active"
    : "❌ Disabled"
}`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// REGENERATE API KEY
// =====================================================

bot.action(
  "regenerate",
  async (ctx) => {

    await ctx.answerCbQuery();

    const merchant =
      await getMerchant(
        ctx.from.id
      );


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


    const key =
      generateApiKey();


    merchant.apiKeyHash =
      hashApiKey(key);

    merchant.encryptedApiKey =
      encrypt(key);

    merchant.apiKeyPrefix =
      key.slice(0, 16);


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

  }
);


// =====================================================
// HOME
// =====================================================

bot.action(
  "home",
  async (ctx) => {

    await ctx.answerCbQuery();

    return editPanel(

      ctx,

      `💳 <b>QuickPy Payment Gateway</b>

Manage your payment integration below.`,

      {
        parse_mode: "HTML"
      }

    );

  }
);


// =====================================================
// TEXT INPUT
// =====================================================

bot.on(
  "text",
  async (ctx) => {

    const userId =
      String(ctx.from.id);


    const state =
      setupState.get(
        userId
      );


    // No active flow
    if (!state) {
      return;
    }


    const value =
      ctx.message.text.trim();


    // =================================================
    // CANCEL
    // =================================================

    if (
      value === "/cancel"
    ) {

      setupState.delete(
        userId
      );


      return ctx.reply(
        "❌ Payment setup cancelled.",
        menu
      );

    }


    // =================================================
    // PAYMENT LINK - AMOUNT
    // =================================================

    if (
      state.step ===
      "link_amount"
    ) {

      if (
        !safeAmount(value)
      ) {

        return ctx.reply(

          `❌ Invalid amount.

Amount must be a positive number.

Example:

100

100.50`

        );

      }


      state.amount =
        value;

      state.step =
        "link_order";


      return ctx.reply(

        `🧾 <b>Send Order ID</b>

Example:

<code>ORDER123</code>

Or send <code>-</code> to generate automatically.

Send /cancel to cancel.`,

        {
          parse_mode: "HTML"
        }

      );

    }


    // =================================================
    // PAYMENT LINK - ORDER ID
    // =================================================

    if (
      state.step ===
      "link_order"
    ) {

      let orderId =
        value;


      // Automatic Order ID
      if (
        orderId === "-"
      ) {

        orderId =
          makeOrderId();

      }


      // Custom Order ID
      else if (
        !safeOrderId(
          orderId
        )
      ) {

        return ctx.reply(

          `❌ Invalid Order ID.

Allowed characters:

A-Z
a-z
0-9
.
_
:
-

Example:

<code>ORDER123</code>`,

          {
            parse_mode: "HTML"
          }

        );

      }


      try {

        const merchant =
          await getMerchant(
            ctx.from.id
          );


        if (!merchant) {

          setupState.delete(
            userId
          );


          return ctx.reply(
            "❌ Payment account is not configured.",
            menu
          );

        }


        // =============================================
        // GENERATE QR
        // =============================================

        const qr =
          await generateQr({

            upiId:
              merchant.upiId,

            amount:
              state.amount,

            orderId:
              orderId,

            name:
              merchant.merchantName,

            note:
              `Payment ${orderId}`

          });


        // =============================================
        // CREATE ENCRYPTED PAYMENT TOKEN
        // =============================================

        const token =
          createPaymentToken({

            telegramUserId:
              String(
                ctx.from.id
              ),

            mid:
              merchant.mid,

            upiId:
              merchant.upiId,

            merchantName:
              merchant.merchantName,

            amount:
              state.amount,

            order_id:
              orderId,

            qr_url:
              qr.qr_url,

            upi_uri:
              qr.upi_uri,

            createdAt:
              Date.now()

          });


        // =============================================
        // CREATE PAYMENT LINK
        // =============================================

        const paymentLink =
          `${publicApiUrl}/pay/${encodeURIComponent(token)}`;


        // Clear state
        setupState.delete(
          userId
        );


        // =============================================
        // SEND PAYMENT LINK
        // =============================================

        return ctx.reply(

          `✅ <b>Payment Link Created</b>

━━━━━━━━━━━━━━

💰 Amount:
<b>₹${state.amount}</b>

🧾 Order ID:
<code>${orderId}</code>

━━━━━━━━━━━━━━

🔗 <b>Payment Link:</b>

<code>${paymentLink}</code>

━━━━━━━━━━━━━━

⚡ Payment verification is automatic.

Customer can open the payment page and pay using UPI.`,

          {

            parse_mode:
              "HTML",

            ...Markup.inlineKeyboard([

              [

                Markup.button.url(
                  "💳 Open Payment Page",
                  paymentLink
                )

              ],

              [

                Markup.button.callback(
                  "🏠 Main Menu",
                  "home"
                )

              ]

            ])

          }

        );

      }


      catch (error) {

        console.error(
          "Payment link error:",
          error
        );


        return ctx.reply(

          `❌ <b>Unable to create payment link.</b>

${error.message || "Payment service error."}`,

          {

            parse_mode:
              "HTML",

            ...menu

          }

        );

      }

    }


    // =================================================
    // SETUP STEP 1 - MID
    // =================================================

    if (
      state.step ===
      "mid"
    ) {

      if (
        !/^[A-Za-z0-9_-]{3,64}$/.test(
          value
        )
      ) {

        return ctx.reply(

          `❌ Invalid Merchant ID.

Please send a valid Paytm Merchant ID.`

        );

      }


      state.mid =
        value;

      state.step =
        "upi";


      return ctx.reply(
        setupText("upi")
      );

    }


    // =================================================
    // SETUP STEP 2 - UPI
    // =================================================

    if (
      state.step ===
      "upi"
    ) {

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


      state.upiId =
        value;

      state.step =
        "name";


      return ctx.reply(
        setupText("name")
      );

    }


    // =================================================
    // SETUP STEP 3 - MERCHANT NAME
    // =================================================

    if (
      state.step ===
      "name"
    ) {

      state.merchantName =
        value === "-"
          ? "Merchant"
          : value.slice(
              0,
              80
            );


      // ===============================================
      // GENERATE API KEY
      // ===============================================

      const apiKey =
        generateApiKey();


      // ===============================================
      // MERCHANT DATA
      // ===============================================

      const merchantData = {

        telegramUserId:
          userId,

        username:
          ctx.from.username ||
          "",

        firstName:
          ctx.from.first_name ||
          "",

        mid:
          state.mid,

        upiId:
          state.upiId,

        merchantName:
          state.merchantName,

        apiKeyHash:
          hashApiKey(
            apiKey
          ),

        encryptedApiKey:
          encrypt(
            apiKey
          ),

        apiKeyPrefix:
          apiKey.slice(
            0,
            16
          ),

        active:
          true

      };


      // ===============================================
      // SAVE MERCHANT
      // ===============================================

      await Merchant.findOneAndUpdate(

        {
          telegramUserId:
            userId
        },

        merchantData,

        {
          upsert:
            true,

          new:
            true,

          setDefaultsOnInsert:
            true

        }

      );


      setupState.delete(
        userId
      );


      // ===============================================
      // SETUP SUCCESS
      // ===============================================

      return ctx.reply(

        `✅ <b>Payment Setup Complete!</b>

━━━━━━━━━━━━━━

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

🔗 <b>Payment Link:</b>

You can now generate payment links directly from the main menu.

━━━━━━━━━━━━━━

⚠️ <b>Security:</b>

Never share your API key publicly.`,

        {

          parse_mode:
            "HTML",

          ...menu

        }

      );

    }

  }
);


// =====================================================
// ERROR HANDLER
// =====================================================

bot.catch(
  (error) => {

    console.error(
      "Telegram bot error:",
      error
    );

  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  bot
};
