import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.LEAD_FACTORY_DB
  ?? path.join(process.cwd(), "data", "leads.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(
    path.join(process.cwd(), "db", "schema.sql"),
    "utf8"
  );
  _db.exec(schema);
  applyMigrations(_db);
  return _db;
}

// Additive migrations for columns introduced after initial schema. Each block
// is idempotent: check pragma first, only run ALTER if the column is missing.
function applyMigrations(d: Database.Database) {
  const leadCols = d
    .prepare("PRAGMA table_info(leads)")
    .all() as { name: string }[];
  const names = new Set(leadCols.map((c) => c.name));
  if (!names.has("qual_score")) {
    d.exec("ALTER TABLE leads ADD COLUMN qual_score INTEGER");
  }
  if (!names.has("qual_flag")) {
    d.exec("ALTER TABLE leads ADD COLUMN qual_flag TEXT");
  }
  if (!names.has("dup_score")) {
    d.exec("ALTER TABLE leads ADD COLUMN dup_score REAL");
  }
  if (!names.has("dup_of")) {
    d.exec("ALTER TABLE leads ADD COLUMN dup_of TEXT");
  }
}

export function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
