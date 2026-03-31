const express         = require("express");
const { PrismaClient } = require("@prisma/client");

const usersRouter = require("./routes/users");
const postsRouter = require("./routes/posts");

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3002;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("X-Implementation", "prisma-orm");
  next();
});

// Expose prisma on app for routes
app.set("prisma", prisma);

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", implementation: "prisma-orm", timestamp: new Date() });
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

app.listen(PORT, async () => {
  console.log(`[orm-api] listening on port ${PORT}`);
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
