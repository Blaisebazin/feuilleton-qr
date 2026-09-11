// db.js — Accès aux données via Postgres (Supabase, ou toute base Postgres compatible).
// Remplace l'ancien stockage dans data/db.json, qui disparaissait à chaque redémarrage
// sur le plan gratuit de Render. Les images sont stockées directement en base
// (en data URL base64) pour éviter toute dépendance à un disque local.

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
      published_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM chapters');
  if (rows[0].count === 0) {
    await pool.query(
      `INSERT INTO chapters (id, title, chapter_text, author, image_data, published_at)
       VALUES ($1, $2, $3, $4, NULL, now())`,
      [
        crypto.randomUUID(),
        'Chapitre 1 — Le commencement',
        "Ceci est le premier chapitre de votre feuilleton.\n\n" +
          "Remplacez ce texte depuis l'espace admin (/admin.html) pour publier votre propre histoire. " +
          "Chaque nouveau chapitre que vous publiez devient automatiquement celui affiché par défaut aux lecteurs.\n\n" +
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
    image: row.image_data || null,
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
    'SELECT id, title, author, published_at, image_data FROM chapters ORDER BY published_at DESC'
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    publishedAt: r.published_at.toISOString(),
    hasImage: !!r.image_data
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

async function createChapter({ title, text, author, imageData }) {
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO chapters (id, title, chapter_text, author, image_data, published_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING *`,
    [id, title, text, author || DEFAULT_AUTHOR, imageData || null]
  );
  return toChapterDTO(rows[0]);
}

async function updateChapter(id, { title, text, author, imageData, removeImage }) {
  const { rows: existingRows } = await pool.query('SELECT * FROM chapters WHERE id = $1', [id]);
  if (!existingRows.length) return null;
  const existing = existingRows[0];

  const newTitle = title && title.trim() ? title.trim() : existing.title;
  const newText = text && text.trim() ? text.trim() : existing.chapter_text;
  const newAuthor = author && author.trim() ? author.trim() : existing.author;
  let newImage = existing.image_data;
  if (removeImage) newImage = null;
  if (imageData) newImage = imageData;

  const { rows } = await pool.query(
    `UPDATE chapters SET title = $1, chapter_text = $2, author = $3, image_data = $4
     WHERE id = $5 RETURNING *`,
    [newTitle, newText, newAuthor, newImage, id]
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
