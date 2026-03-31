const express = require("express");
const pool    = require("../db");

const router = express.Router();

// GET /posts?page=1&limit=20&tag=docker&published=true
// Jointure complexe : posts + auteur + tags (N-N)
router.get("/", async (req, res, next) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page  || "1"));
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset    = (page - 1) * limit;
    const { tag, published } = req.query;

    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (published !== undefined) {
      conditions.push(`p.published = $${idx++}`);
      params.push(published === "true");
    }
    if (tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.slug = $${idx++}
      )`);
      params.push(tag);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM posts p ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    // One query: posts + auteur + tags agrégés en JSON
    const dataResult = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.content,
         p.published,
         p.view_count,
         p.created_at,
         json_build_object(
           'id',    u.id,
           'name',  u.name,
           'email', u.email,
           'city',  u.city
         ) AS author,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
             ORDER BY t.name
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       ${where}
       GROUP BY p.id, u.id
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json({
      data: dataResult.rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /posts/:id  — post + auteur + tags
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.content,
         p.published,
         p.view_count,
         p.created_at,
         json_build_object(
           'id',    u.id,
           'name',  u.name,
           'email', u.email,
           'city',  u.city
         ) AS author,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
             ORDER BY t.name
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.id = $1
       GROUP BY p.id, u.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Post not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /posts
router.post("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { user_id, title, content, published, tag_ids } = req.body;

    const postResult = await client.query(
      `INSERT INTO posts (user_id, title, content, published)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, title, content, published, view_count, created_at`,
      [user_id, title, content || null, published ?? false]
    );
    const post = postResult.rows[0];

    if (tag_ids && tag_ids.length > 0) {
      const placeholders = tag_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await client.query(
        `INSERT INTO post_tags (post_id, tag_id) VALUES ${placeholders}`,
        [post.id, ...tag_ids]
      );
    }

    await client.query("COMMIT");
    res.status(201).json(post);
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /posts/search/by-tag/:slug  — posts filtrés par tag avec auteur
router.get("/search/by-tag/:slug", async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT
         p.id, p.title, p.published, p.view_count, p.created_at,
         json_build_object('id', u.id, 'name', u.name) AS author
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE t.slug = $1
       ORDER BY p.view_count DESC
       LIMIT $2 OFFSET $3`,
      [req.params.slug, limit, offset]
    );

    res.json({ data: rows, meta: { page, limit } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
