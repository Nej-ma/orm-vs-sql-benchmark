const express = require("express");
const pool    = require("../db");

const router = express.Router();

// GET /users?page=1&limit=20&city=Paris&search=john
router.get("/", async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;
    const { city, search } = req.query;

    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (city) {
      conditions.push(`city = $${idx++}`);
      params.push(city);
    }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT id, name, email, age, city, created_at
       FROM users
       ${where}
       ORDER BY id
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json({
      data:  dataResult.rows,
      meta:  { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, age, city, created_at FROM users WHERE id = $1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /users
router.post("/", async (req, res, next) => {
  try {
    const { name, email, age, city } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, age, city)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, age, city, created_at`,
      [name, email, age || null, city || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id
router.put("/:id", async (req, res, next) => {
  try {
    const { name, email, age, city } = req.body;
    const { rows } = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           age   = COALESCE($3, age),
           city  = COALESCE($4, city)
       WHERE id = $5
       RETURNING id, name, email, age, city, created_at`,
      [name || null, email || null, age || null, city || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM users WHERE id = $1",
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: "User not found" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /users/:id/posts  — jointure 1-N avec infos auteur
router.get("/:id/posts", async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;

    // First check user exists
    const userResult = await pool.query(
      "SELECT id, name, email, city FROM users WHERE id = $1",
      [req.params.id]
    );
    if (!userResult.rows.length) return res.status(404).json({ error: "User not found" });

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM posts WHERE user_id = $1",
      [req.params.id]
    );
    const total = parseInt(countResult.rows[0].count);

    const postsResult = await pool.query(
      `SELECT p.id, p.title, p.content, p.published, p.view_count, p.created_at
       FROM posts p
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    res.json({
      user: userResult.rows[0],
      data: postsResult.rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
