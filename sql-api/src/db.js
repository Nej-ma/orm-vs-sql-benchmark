const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  user:     process.env.DB_USER     || "ads",
  password: process.env.DB_PASSWORD || "ads_secret",
  database: process.env.DB_NAME     || "ads_benchmark",
  max:      20,   // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error", err);
});

module.exports = pool;
