const express = require("express");

const router = express.Router();

// GET /posts?page=1&limit=20&tag=docker&published=true
router.get("/", async (req, res, next) => {
  try {
    const prisma    = req.app.get("prisma");
    const page      = Math.max(1, parseInt(req.query.page  || "1"));
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const skip      = (page - 1) * limit;
    const { tag, published } = req.query;

    const where = {};
    if (published !== undefined) where.published = published === "true";
    if (tag) {
      where.postTags = {
        some: { tag: { slug: tag } },
      };
    }

    const [total, data] = await prisma.$transaction([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        select: {
          id:        true,
          title:     true,
          content:   true,
          published: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, email: true, city: true },
          },
          postTags: {
            select: {
              tag: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take:    limit,
        skip,
      }),
    ]);

    // Reshape postTags → tags to match sql-api response shape
    const shaped = data.map(({ postTags, ...p }) => ({
      ...p,
      tags: postTags.map((pt) => pt.tag),
    }));

    res.json({
      data: shaped,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /posts/:id — post + auteur + tags
router.get("/:id", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const post = await prisma.post.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id:        true,
        title:     true,
        content:   true,
        published: true,
        viewCount: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, email: true, city: true },
        },
        postTags: {
          select: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { postTags, ...rest } = post;
    res.json({ ...rest, tags: postTags.map((pt) => pt.tag) });
  } catch (err) {
    next(err);
  }
});

// POST /posts
router.post("/", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const { user_id, title, content, published, tag_ids } = req.body;

    const post = await prisma.post.create({
      data: {
        userId:    user_id,
        title,
        content:   content ?? null,
        published: published ?? false,
        ...(tag_ids && tag_ids.length > 0 && {
          postTags: {
            create: tag_ids.map((tagId) => ({ tagId })),
          },
        }),
      },
      select: {
        id: true, userId: true, title: true, content: true,
        published: true, viewCount: true, createdAt: true,
      },
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
});

// PUT /posts/:id  — nested update: post fields + replace tag associations atomically
router.put("/:id", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const { title, content, published, tag_ids } = req.body;

    const data = {};
    if (title     !== undefined) data.title     = title;
    if (content   !== undefined) data.content   = content;
    if (published !== undefined) data.published = published;

    if (Array.isArray(tag_ids)) {
      data.postTags = {
        deleteMany: {},
        ...(tag_ids.length > 0 && { create: tag_ids.map((tagId) => ({ tagId })) }),
      };
    }

    const post = await prisma.post.update({
      where:  { id: parseInt(req.params.id) },
      data,
      select: { id: true, userId: true, title: true, content: true,
                published: true, viewCount: true, createdAt: true },
    });
    res.json(post);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Post not found" });
    next(err);
  }
});

// GET /posts/search/by-tag/:slug
router.get("/search/by-tag/:slug", async (req, res, next) => {
  try {
    const prisma = req.app.get("prisma");
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const skip   = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      where: {
        postTags: { some: { tag: { slug: req.params.slug } } },
      },
      select: {
        id: true, title: true, published: true, viewCount: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { viewCount: "desc" },
      take:    limit,
      skip,
    });

    res.json({ data: posts, meta: { page, limit } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
