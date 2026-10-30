'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
class Store {
  constructor(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY, url TEXT NOT NULL, analyzed INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS article_url ON articles(url);
      CREATE INDEX IF NOT EXISTS article_time ON articles(analyzed);
      CREATE TABLE IF NOT EXISTS rejected(url TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(sequence INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(started INTEGER PRIMARY KEY, finished INTEGER, status TEXT, detail TEXT);
    `);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, String(value)); }
  has(article) {
    return !!this.db.prepare('SELECT 1 FROM articles WHERE id=? OR url=? LIMIT 1').get(article.id, article.sourceUrl);
  }
  isRejected(url, now) { return !!this.db.prepare('SELECT 1 FROM rejected WHERE url=? AND expires>?').get(url, now); }
  add(kept, rejected, now = Date.now()) {
    return this.transaction(() => {
      const insert = this.db.prepare('INSERT OR IGNORE INTO articles VALUES (?,?,?,?)');
      let added = 0;
      for (const a of kept) {
        const t = Date.parse(a.analyzed_at || '') || now;
        const payload = { ...a, analyzed_at: new Date(t).toISOString() };
        added += Number(insert.run(a.id, a.sourceUrl, t, JSON.stringify(payload)).changes);
      }
      for (const a of rejected) if (a.sourceUrl) this.db.prepare('INSERT OR REPLACE INTO rejected VALUES (?,?)').run(a.sourceUrl, now + 86400000);
      this.db.prepare('DELETE FROM rejected WHERE expires<=?').run(now);
      return added;
    });
  }
  articles(since = 0) { return this.db.prepare('SELECT payload FROM articles WHERE analyzed>=? ORDER BY analyzed DESC,id').all(since).map(r => JSON.parse(r.payload)); }
  pending() { return this.db.prepare('SELECT * FROM outbox ORDER BY sequence LIMIT 1').get(); }
  enqueue(sequence, payload) { this.db.prepare('INSERT INTO outbox VALUES (?,?)').run(sequence, JSON.stringify(payload)); }
  acknowledge(sequence) {
    this.transaction(() => {
      this.set('published_sequence', sequence);
      this.db.prepare('DELETE FROM outbox WHERE sequence=?').run(sequence);
    });
  }
  close() { this.db.close(); }
}
module.exports = { Store };
