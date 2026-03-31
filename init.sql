-- ============================================================
-- ADS Benchmark - Database Schema
-- Évaluation ORM vs SQL natif
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)        NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    age         INTEGER             CHECK (age >= 0 AND age <= 120),
    city        VARCHAR(100),
    created_at  TIMESTAMP           DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255)        NOT NULL,
    content     TEXT,
    published   BOOLEAN             DEFAULT false,
    view_count  INTEGER             DEFAULT 0,
    created_at  TIMESTAMP           DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) UNIQUE NOT NULL,
    slug    VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- Indexes for realistic query performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id     ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_published   ON posts(published);
CREATE INDEX IF NOT EXISTS idx_posts_created_at  ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_city        ON users(city);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id  ON post_tags(tag_id);

-- Pre-insert the 20 fixed tags
INSERT INTO tags (name, slug) VALUES
    ('JavaScript',  'javascript'),
    ('TypeScript',  'typescript'),
    ('Node.js',     'nodejs'),
    ('Python',      'python'),
    ('Docker',      'docker'),
    ('PostgreSQL',  'postgresql'),
    ('Redis',       'redis'),
    ('GraphQL',     'graphql'),
    ('REST API',    'rest-api'),
    ('Performance', 'performance'),
    ('Security',    'security'),
    ('DevOps',      'devops'),
    ('Machine Learning', 'machine-learning'),
    ('React',       'react'),
    ('Vue.js',      'vuejs'),
    ('Architecture','architecture'),
    ('Testing',     'testing'),
    ('Microservices','microservices'),
    ('Cloud',       'cloud'),
    ('Open Source', 'open-source')
ON CONFLICT DO NOTHING;
