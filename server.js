import express from "express";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes, scryptSync } from "crypto";

dotenv.config();

const { Pool } = pg;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function ensureUsersTable() {
  await pool.query(`
    create table if not exists public.users (
      id bigserial primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    );
  `);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

app.use(express.json());

// Avoid stale assets/pages when switching between file:// and localhost views
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.static(__dirname));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/db/health", async (_req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      ok: false,
      message: "DATABASE_URL is missing. Create a .env file from .env.example"
    });
  }

  try {
    const result = await pool.query("select now() as server_time");
    res.json({ ok: true, serverTime: result.rows[0].server_time });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get("/api/db/tables", async (_req, res) => {
  try {
    const result = await pool.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name;
    `);
    res.json({ ok: true, tables: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, message: "Nome, email e password são obrigatórios." });
  }

  if (password.length < 8) {
    return res.status(400).json({ ok: false, message: "A password deve ter pelo menos 8 caracteres." });
  }

  try {
    await ensureUsersTable();

    const existing = await pool.query(
      "select id from public.users where lower(email)=lower($1) limit 1",
      [email.trim()]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ ok: false, message: "Este email já está registado." });
    }

    const passwordHash = hashPassword(password);
    const created = await pool.query(
      `insert into public.users (name, email, password_hash)
       values ($1, $2, $3)
       returning id, name, email, created_at`,
      [name.trim(), email.trim(), passwordHash]
    );

    return res.status(201).json({ ok: true, user: created.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao criar conta.", error: error.message });
  }
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
