import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data.db')

const db = new Database(dbPath)

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS inscricoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    instituicao TEXT NOT NULL,
    cargo TEXT NOT NULL,
    presente INTEGER NOT NULL DEFAULT 0,
    data_inscricao TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    nome TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS certificados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscricao_id INTEGER NOT NULL UNIQUE,
    arquivo_path TEXT,
    gerado INTEGER NOT NULL DEFAULT 0,
    enviado INTEGER NOT NULL DEFAULT 0,
    data_gerado TEXT,
    data_enviado TEXT,
    FOREIGN KEY (inscricao_id) REFERENCES inscricoes(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscricao_id INTEGER NOT NULL UNIQUE,
    nota_geral INTEGER NOT NULL CHECK(nota_geral BETWEEN 1 AND 5),
    nota_conteudo INTEGER NOT NULL CHECK(nota_conteudo BETWEEN 1 AND 5),
    nota_organizacao INTEGER NOT NULL CHECK(nota_organizacao BETWEEN 1 AND 5),
    nota_palestrantes INTEGER NOT NULL CHECK(nota_palestrantes BETWEEN 1 AND 5),
    comentario TEXT,
    sugestoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (inscricao_id) REFERENCES inscricoes(id)
  );
`)

export default db
