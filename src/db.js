const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  dateStrings: ["DATE"],
  supportBigNumbers: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Runs fn(conn) inside a transaction; conn.q / conn.one mirror the pool helpers.
async function transaction(fn) {
  const conn = await pool.getConnection();
  conn.q = async (sql, params = []) => (await conn.query(sql, params))[0];
  conn.one = async (sql, params = []) => (await conn.q(sql, params))[0] || null;
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };
