const express = require("express");
const { connectDb } = require("./db");
const { bot } = require("./bot");
const { port } = require("./config");
const api = require("./api");

async function main() {
  await connectDb();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/", (req, res) => {
    res.json({
      service: "Payment Gateway",
      status: "online",
      api: "/api",
      docs: "/api/docs"
    });
  });

  app.use("/api", api);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Internal server error."
    });
  });

  app.listen(port, () => {
    console.log(`HTTP server listening on ${port}`);
  });

  await bot.launch();
  console.log("Telegram bot started.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
