// server.js — Feuilleton QR
// Sert le lecteur (PWA) et l'admin, avec une API JSON pour publier/lire des chapitres.
// Les données (chapitres, réglages, images) vivent dans Postgres (Supabase) — voir db.js —
// pour survivre aux redémarrages du service, y compris sur un hébergement gratuit.

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changemoi';

// --- Upload d'images en mémoire (converties en data URL, stockées en base) --------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 6 }, // 3 Mo/photo, 6 photos max par chapitre
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format d\'image non supporté.'));
  }
});

function fileToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

// --- Sessions admin (en mémoire, simples) -----------------------------------

const sessions = new Map(); // token -> expiry timestamp
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const expiry = token && sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
  next();
}

// --- App ----------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -- API publique --

app.get('/api/chapters', async (req, res, next) => {
  try {
    res.json(await db.listChaptersLight());
  } catch (err) { next(err); }
});

app.get('/api/chapters/latest', async (req, res, next) => {
  try {
    const result = await db.getLatestWithPosition();
    if (!result) return res.status(404).json({ error: 'Aucun chapitre publié.' });
    result.chapter.views = await db.incrementChapterView(result.chapter.id);
    res.json(result);
  } catch (err) { next(err); }
});

app.get('/api/chapters/:id', async (req, res, next) => {
  try {
    const result = await db.getChapterWithPosition(req.params.id);
    if (!result) return res.status(404).json({ error: 'Chapitre introuvable.' });
    result.chapter.views = await db.incrementChapterView(result.chapter.id);
    res.json(result);
  } catch (err) { next(err); }
});

app.post('/api/chapters/:id/like', async (req, res, next) => {
  try {
    const likes = await db.incrementChapterLike(req.params.id);
    if (likes === null) return res.status(404).json({ error: 'Chapitre introuvable.' });
    res.json({ likes });
  } catch (err) { next(err); }
});

app.post('/api/book/like', async (req, res, next) => {
  try {
    res.json({ bookLikes: await db.incrementBookLike() });
  } catch (err) { next(err); }
});

app.get('/api/settings', async (req, res, next) => {
  try {
    res.json(await db.getSettings());
  } catch (err) { next(err); }
});

// -- Auth admin --

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  res.json({ token: createSession() });
});

// -- API admin (protégée) --

app.get('/api/admin/chapters', requireAdmin, async (req, res, next) => {
  try {
    // La liste admin renvoie le texte complet de chaque chapitre, pour pré-remplir l'édition.
    const light = await db.listChaptersLight();
    const full = await Promise.all(light.map(async (c) => {
      const result = await db.getChapterWithPosition(c.id);
      return result.chapter;
    }));
    res.json(full);
  } catch (err) { next(err); }
});

app.put('/api/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const { bookTitle, synopsis } = req.body || {};
    if (!bookTitle || !bookTitle.trim()) {
      return res.status(400).json({ error: 'Le titre du livre ne peut pas être vide.' });
    }
    res.json(await db.updateSettings({ bookTitle: bookTitle.trim(), synopsis }));
  } catch (err) { next(err); }
});

app.post('/api/admin/chapters', requireAdmin, upload.array('images', 6), async (req, res, next) => {
  try {
    const { title, text, author } = req.body || {};
    if (!title || !title.trim() || !text || !text.trim()) {
      return res.status(400).json({ error: 'Titre et texte du chapitre requis.' });
    }
    const chapter = await db.createChapter({
      title: title.trim(),
      text: text.trim(),
      author: (author || '').trim(),
      images: (req.files || []).map(fileToDataUrl)
    });
    res.status(201).json(chapter);
  } catch (err) { next(err); }
});

app.put('/api/admin/chapters/:id', requireAdmin, upload.array('images', 6), async (req, res, next) => {
  try {
    const { title, text, author, removeImageIndices } = req.body || {};
    let indices = [];
    if (removeImageIndices) {
      try { indices = JSON.parse(removeImageIndices); } catch { indices = []; }
    }
    const chapter = await db.updateChapter(req.params.id, {
      title,
      text,
      author,
      newImages: (req.files || []).map(fileToDataUrl),
      removeImageIndices: indices
    });
    if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable.' });
    res.json(chapter);
  } catch (err) { next(err); }
});

app.delete('/api/admin/chapters/:id', requireAdmin, async (req, res, next) => {
  try {
    const ok = await db.deleteChapter(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Chapitre introuvable.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Erreur serveur.' });
});

db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Feuilleton QR en écoute sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Impossible d\'initialiser la base de données :', err.message);
    process.exit(1);
  });
