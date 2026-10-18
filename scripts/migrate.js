// Applies database migrations: npm run migrate
const { migrate } = require("../src/migrations");
const db = require("../src/db");

migrate()
  .then(() => db.pool.end())
  .catch(async (err) => {
    console.error(err);
    await db.pool.end();
    process.exit(1);
  });
