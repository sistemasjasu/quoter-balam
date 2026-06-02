const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  initDb,
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const AUTH_EMAIL = (process.env.AUTH_EMAIL || 'aandrade@balamst.com').toLowerCase();
const AUTH_PASS_HASH = process.env.AUTH_PASS_HASH || '';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const passHash = hashPassword(password);

  if (!AUTH_PASS_HASH) {
    return res.status(500).json({ error: 'Server auth is not configured' });
  }

  if (email !== AUTH_EMAIL || passHash !== AUTH_PASS_HASH) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

app.get('/api/quotes', authMiddleware, async (_req, res) => {
  try {
    const quotes = await listQuotes();
    res.json(quotes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

app.get('/api/quotes/:code', authMiddleware, async (req, res) => {
  try {
    const quote = await getQuote(req.params.code);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json(quote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load quote' });
  }
});

app.post('/api/quotes', authMiddleware, async (req, res) => {
  const quoteCode = String(req.body.quote_code || '').trim();
  const data = req.body.data;

  if (!quoteCode) {
    return res.status(400).json({ error: 'quote_code is required' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data is required' });
  }

  try {
    const existing = await getQuote(quoteCode);
    if (existing) {
      return res.status(409).json({ error: 'Quote code already exists' });
    }
    const created = await createQuote(quoteCode, data);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

app.put('/api/quotes/:code', authMiddleware, async (req, res) => {
  const quoteCode = String(req.params.code || '').trim();
  const data = req.body.data;

  if (!quoteCode) {
    return res.status(400).json({ error: 'quote_code is required' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data is required' });
  }

  try {
    const updated = await updateQuote(quoteCode, data);
    if (!updated) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Quotes API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
