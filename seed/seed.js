/**
 * ADS Benchmark – Data Seeder
 *
 * Génère :
 *   - 10 000 utilisateurs
 *   - 3 posts par utilisateur (30 000 posts)
 *   - 20 tags (déjà insérés par init.sql)
 *   - 2-3 tags par post (≈ 75 000 lignes post_tags)
 *
 * Utilise des inserts en batch pour éviter de saturer la connexion.
 */

const { Pool }  = require("pg");
const { faker } = require("@faker-js/faker");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  user:     process.env.DB_USER     || "ads",
  password: process.env.DB_PASSWORD || "ads_secret",
  database: process.env.DB_NAME     || "ads_benchmark",
});

const USERS_COUNT  = 10_000;
const POSTS_PER_USER = 3;
const BATCH_SIZE   = 500;

const CITIES = [
  "Paris", "Lyon", "Marseille", "Toulouse", "Nice",
  "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille",
  "Rennes", "Reims", "Le Havre", "Grenoble", "Dijon",
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickNUnique(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function truncateTables(client) {
  console.log("Truncating existing data...");
  await client.query("TRUNCATE post_tags, posts, users RESTART IDENTITY CASCADE");
}

async function seedUsers(client) {
  console.log(`Seeding ${USERS_COUNT} users in batches of ${BATCH_SIZE}...`);

  let inserted = 0;
  const emails = new Set();

  for (let batch = 0; batch < USERS_COUNT; batch += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, USERS_COUNT - batch);
    const values = [];
    const params = [];
    let   idx    = 1;

    for (let i = 0; i < count; i++) {
      let email;
      do { email = faker.internet.email().toLowerCase(); } while (emails.has(email));
      emails.add(email);

      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(
        faker.person.fullName(),
        email,
        randomInt(18, 70),
        CITIES[randomInt(0, CITIES.length - 1)]
      );
    }

    await client.query(
      `INSERT INTO users (name, email, age, city) VALUES ${values.join(", ")}`,
      params
    );

    inserted += count;
    process.stdout.write(`\r  users: ${inserted}/${USERS_COUNT}`);
  }
  console.log();
}

async function seedPostsAndTags(client, tagIds) {
  const totalPosts = USERS_COUNT * POSTS_PER_USER;
  console.log(`Seeding ${totalPosts} posts...`);

  let postId    = 1;
  let userStart = 1;

  for (let batch = 0; batch < USERS_COUNT; batch += BATCH_SIZE) {
    const usersInBatch = Math.min(BATCH_SIZE, USERS_COUNT - batch);

    // Insert posts for this batch of users
    const postValues = [];
    const postParams = [];
    let   idx        = 1;

    for (let u = 0; u < usersInBatch; u++) {
      const userId = userStart + u;
      for (let p = 0; p < POSTS_PER_USER; p++) {
        postValues.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        postParams.push(
          userId,
          faker.lorem.sentence({ min: 4, max: 10 }),
          faker.lorem.paragraphs({ min: 1, max: 3 }),
          Math.random() > 0.3,        // 70% published
          randomInt(0, 10_000)         // view_count
        );
      }
    }

    const postResult = await client.query(
      `INSERT INTO posts (user_id, title, content, published, view_count)
       VALUES ${postValues.join(", ")}
       RETURNING id`,
      postParams
    );

    // Insert post_tags for each inserted post
    const ptValues = [];
    const ptParams = [];
    let   ptIdx    = 1;

    for (const row of postResult.rows) {
      const tagsForPost = pickNUnique(tagIds, randomInt(2, 3));
      for (const tagId of tagsForPost) {
        ptValues.push(`($${ptIdx++}, $${ptIdx++})`);
        ptParams.push(row.id, tagId);
      }
    }

    if (ptValues.length > 0) {
      await client.query(
        `INSERT INTO post_tags (post_id, tag_id) VALUES ${ptValues.join(", ")} ON CONFLICT DO NOTHING`,
        ptParams
      );
    }

    userStart += usersInBatch;
    postId    += usersInBatch * POSTS_PER_USER;
    process.stdout.write(`\r  posts: ${Math.min(postId - 1, totalPosts)}/${totalPosts}`);
  }
  console.log();
}

async function main() {
  console.log("=== ADS Benchmark Seeder ===\n");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await truncateTables(client);

    // Fetch tag IDs (inserted by init.sql)
    const tagResult = await client.query("SELECT id FROM tags ORDER BY id");
    const tagIds    = tagResult.rows.map((r) => r.id);
    console.log(`Found ${tagIds.length} tags.`);

    await seedUsers(client);
    await seedPostsAndTags(client, tagIds);

    await client.query("COMMIT");

    // Stats
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)    AS users,
        (SELECT COUNT(*) FROM posts)    AS posts,
        (SELECT COUNT(*) FROM tags)     AS tags,
        (SELECT COUNT(*) FROM post_tags) AS post_tags
    `);
    console.log("\n=== Seeding complete ===");
    console.log(stats.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
