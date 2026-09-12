// db.js — Accès aux données via Postgres (Supabase, ou toute base Postgres compatible).
// Les images sont stockées directement en base (en data URL base64), plusieurs par
// chapitre, dans une colonne JSONB "images" (tableau ordonné).

const { Pool } = require('pg');
const crypto = require('crypto');

const DEFAULT_AUTHOR = 'Blaise BAZINGA';

if (!process.env.DATABASE_URL) {
  console.warn(
    '⚠️  DATABASE_URL n\'est pas défini. Configure cette variable d\'environnement ' +
    '(chaîne de connexion Supabase) pour que les chapitres soient sauvegardés durablement.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chapters (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      chapter_text TEXT NOT NULL,
      author TEXT NOT NULL,
      image_data TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // CREATE TABLE IF NOT EXISTS n'ajoute pas de colonne à une table déjà existante :
  // pour les bases créées avant l'introduction du multi-images, on l'ajoute explicitement.
  await pool.query(`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS image_data TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migration douce : les chapitres créés avant l'introduction du support multi-images
  // avaient leur unique photo dans image_data. On la reprend dans le tableau images.
  await pool.query(`
    UPDATE chapters
    SET images = jsonb_build_array(image_data)
    WHERE image_data IS NOT NULL AND images = '[]'::jsonb
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM chapters');
  if (rows[0].count === 0) {
    await pool.query(
      `INSERT INTO chapters (id, title, chapter_text, author, images, published_at)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, now())`,
      [
        crypto.randomUUID(),
        'Chapitre 1 — Le commencement',
        "Ceci est le premier chapitre de votre feuilleton.\n\n" +
          "Remplacez ce texte depuis l'espace admin (/admin.html) pour publier votre propre histoire. " +
          "Chaque nouveau chapitre que vous publiez devient automatiquement celui affiché par défaut aux lecteurs.\n\n" +
          "Astuce : tapez [image] sur sa propre ligne à l'endroit où vous voulez insérer une photo.\n\n" +
          "Le QR code de votre feuilleton peut toujours pointer vers la même adresse : il affichera toujours le dernier chapitre en date.",
        DEFAULT_AUTHOR
      ]
    );
  }

  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('bookTitle', 'Mon Feuilleton')
     ON CONFLICT (key) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('synopsis', '')
     ON CONFLICT (key) DO NOTHING`
  );
}

function toChapterDTO(row) {
  return {
    id: row.id,
    title: row.title,
    text: row.chapter_text,
    author: row.author,
    images: Array.isArray(row.images) ? row.images : [],
    publishedAt: row.published_at.toISOString()
  };
}

async function listChaptersFull() {
  const { rows } = await pool.query(
    'SELECT * FROM chapters ORDER BY published_at DESC'
  );
  return rows.map(toChapterDTO);
}

async function listChaptersLight() {
  const { rows } = await pool.query(
    'SELECT id, title, author, published_at, images FROM chapters ORDER BY published_at DESC'
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    publishedAt: r.published_at.toISOString(),
    imageCount: Array.isArray(r.images) ? r.images.length : 0
  }));
}

async function getChapterWithPosition(id) {
  const list = await listChaptersFull();
  const index = list.findIndex((c) => c.id === id);
  if (index === -1) return null;
  return { chapter: list[index], index, total: list.length };
}

async function getLatestWithPosition() {
  const list = await listChaptersFull();
  if (!list.length) return null;
  return { chapter: list[0], index: 0, total: list.length };
}

async function createChapter({ title, text, author, images }) {
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO chapters (id, title, chapter_text, author, images, published_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())
     RETURNING *`,
    [id, title, text, author || DEFAULT_AUTHOR, JSON.stringify(images || [])]
  );
  return toChapterDTO(rows[0]);
}

async function updateChapter(id, { title, text, author, newImages, removeImageIndices }) {
  const { rows: existingRows } = await pool.query('SELECT * FROM chapters WHERE id = $1', [id]);
  if (!existingRows.length) return null;
  const existing = existingRows[0];

  const newTitle = title && title.trim() ? title.trim() : existing.title;
  const newText = text && text.trim() ? text.trim() : existing.chapter_text;
  const newAuthor = author && author.trim() ? author.trim() : existing.author;

  const currentImages = Array.isArray(existing.images) ? existing.images : [];
  const toRemove = new Set(removeImageIndices || []);
  const kept = currentImages.filter((_, idx) => !toRemove.has(idx));
  const finalImages = [...kept, ...(newImages || [])];

  const { rows } = await pool.query(
    `UPDATE chapters SET title = $1, chapter_text = $2, author = $3, images = $4::jsonb
     WHERE id = $5 RETURNING *`,
    [newTitle, newText, newAuthor, JSON.stringify(finalImages), id]
  );
  return toChapterDTO(rows[0]);
}

async function deleteChapter(id) {
  const { rowCount } = await pool.query('DELETE FROM chapters WHERE id = $1', [id]);
  return rowCount > 0;
}

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    bookTitle: map.bookTitle || 'Mon Feuilleton',
    synopsis: map.synopsis || ''
  };
}

async function updateSettings({ bookTitle, synopsis }) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('bookTitle', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [bookTitle]
  );
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('synopsis', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [synopsis || '']
  );
  return getSettings();
}

module.exports = {
  initDb,
  listChaptersLight,
  getChapterWithPosition,
  getLatestWithPosition,
  createChapter,
  updateChapter,
  deleteChapter,
  getSettings,
  updateSettings,
  DEFAULT_AUTHOR
};
