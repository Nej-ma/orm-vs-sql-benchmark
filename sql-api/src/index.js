const express = require("express");
const pool    = require("./db");

const usersRouter = require("./routes/users");
const postsRouter = require("./routes/posts");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Identify which implementation is responding
app.use((req, res, next) => {
  res.setHeader("X-Implementation", "sql-native");
  next();
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", implementation: "sql-native", timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

app.use("/users", usersRouter);
app.use("/posts", postsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[sql-api] listening on port ${PORT}`);
});
