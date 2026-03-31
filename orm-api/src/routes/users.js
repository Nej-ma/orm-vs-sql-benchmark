const express = require("express");

const router = express.Router();

// GET /users?page=1&limit=20&city=Paris&search=john
router.get("/", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const skip   = (page - 1) * limit;
    const { city, search } = req.query;

    const where = {};
    if (city)   where.city  = city;
    if (search) where.OR    = [
      { name:  { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];

    const [total, data] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, age: true, city: true, createdAt: true },
        orderBy: { id: "asc" },
        take: limit,
        skip,
      }),
    ]);

    res.json({
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
router.get("/:id", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const user = await prisma.user.findUnique({
      where:  { id: parseInt(req.params.id) },
      select: { id: true, name: true, email: true, age: true, city: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /users
router.post("/", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const { name, email, age, city } = req.body;
    const user = await prisma.user.create({
      data: { name, email, age: age ?? null, city: city ?? null },
      select: { id: true, name: true, email: true, age: true, city: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id
router.put("/:id", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const { name, email, age, city } = req.body;

    const data = {};
    if (name  !== undefined) data.name  = name;
    if (email !== undefined) data.email = email;
    if (age   !== undefined) data.age   = age;
    if (city  !== undefined) data.city  = city;

    const user = await prisma.user.update({
      where:  { id: parseInt(req.params.id) },
      data,
      select: { id: true, name: true, email: true, age: true, city: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "User not found" });
    next(err);
  }
});

// DELETE /users/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "User not found" });
    next(err);
  }
});

// GET /users/:id/posts  — relation 1-N via Prisma include
router.get("/:id/posts", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const skip   = (page - 1) * limit;
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, city: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const [total, posts] = await prisma.$transaction([
      prisma.post.count({ where: { userId } }),
      prisma.post.findMany({
        where:   { userId },
        select:  { id: true, title: true, content: true, published: true, viewCount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take:    limit,
        skip,
      }),
    ]);

    res.json({
      user,
      data: posts,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
