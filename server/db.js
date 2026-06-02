const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id          SERIAL PRIMARY KEY,
      quote_code  VARCHAR(120) NOT NULL UNIQUE,
      data        JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS quotes_updated_at_idx
    ON quotes (updated_at DESC)
  `);
}

async function listQuotes() {
  const { rows } = await pool.query(`
    SELECT quote_code, updated_at
    FROM quotes
    ORDER BY updated_at DESC
  `);
  return rows;
}

async function getQuote(quoteCode) {
  const { rows } = await pool.query(
    `SELECT quote_code, data, created_at, updated_at FROM quotes WHERE quote_code = $1`,
    [quoteCode]
  );
  return rows[0] || null;
}

async function createQuote(quoteCode, data) {
  const { rows } = await pool.query(
    `INSERT INTO quotes (quote_code, data) VALUES ($1, $2::jsonb)
     RETURNING quote_code, created_at, updated_at`,
    [quoteCode, JSON.stringify(data)]
  );
  return rows[0];
}

async function updateQuote(quoteCode, data) {
  const { rows } = await pool.query(
    `UPDATE quotes
     SET data = $2::jsonb, updated_at = NOW()
     WHERE quote_code = $1
     RETURNING quote_code, created_at, updated_at`,
    [quoteCode, JSON.stringify(data)]
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  initDb,
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
};
