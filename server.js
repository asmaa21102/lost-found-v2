// Lost & Found — one server for the web app and its API.
//   PORT=8102 DB_USER=… DB_PASS=… node server.js
const config = require("./src/config");
const { migrate } = require("./src/migrations");
const { createApp } = require("./src/app");
const pipeline = require("./src/pipeline");
const retention = require("./src/retention");

async function main() {
  await migrate();
  const app = createApp();
  app.listen(config.port, "127.0.0.1", () => console.log(`Lost & Found running on ${config.baseUrl}`));
  retention.schedule();
  // Load the AI model in the background; the site works without it meanwhile.
  pipeline
    .warmUp()
    .then(() => config.ai.enabled && console.log("AI photo search ready"))
    .catch((err) => console.error("AI not available:", err.message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
