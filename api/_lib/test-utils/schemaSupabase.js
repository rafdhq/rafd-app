/**
 * Schema-aware test helper.
 *
 * The sandbox cannot reach a live Supabase project (egress denied), so to PROVE
 * the Platform Admin fix we run the REAL, unmodified handlers against an
 * in-memory store that enforces the ACTUAL database schema derived from the
 * migration files (supabase/migrations/*.sql).
 *
 * The enforcing client mimics PostgREST: inserting/updating a column that does
 * not exist in the schema returns a `42703`-style "column ... does not exist"
 * error — exactly what production returned before migration
 * 20260722000013_platform_schema_align.sql was added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createFakeSupabase } from './fakeSupabase.js';

const CONSTRAINT_KEYWORDS = new Set([
  'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'CONSTRAINT', 'INDEX', 'KEY', 'EXCLUDE', 'LIKE',
]);

function splitTopLevelCommas(body) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function columnsFromCreateTable(body) {
  const cols = new Set();
  for (const raw of splitTopLevelCommas(body)) {
    const def = raw.trim();
    if (!def) continue;
    const first = def.split(/\s+/)[0].replace(/"/g, '');
    if (!first) continue;
    if (CONSTRAINT_KEYWORDS.has(first.toUpperCase())) continue;
    cols.add(first);
  }
  return cols;
}

/**
 * Parse every migration and compute the effective column set per table.
 * @param {{ exclude?: RegExp }} [opts]
 * @returns {Record<string, Set<string>>}
 */
export function loadMigrationSchema(opts = {}) {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const schema = {};
  const ensure = (t) => (schema[t] ||= new Set());

  for (const file of files) {
    if (opts.exclude && opts.exclude.test(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');

    // CREATE TABLE [IF NOT EXISTS] name ( ... );
    const createRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
    let m;
    while ((m = createRe.exec(sql))) {
      const table = m[1];
      for (const col of columnsFromCreateTable(m[2])) ensure(table).add(col);
    }

    // ALTER TABLE name ADD COLUMN [IF NOT EXISTS] col type;
    const addRe = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/gi;
    while ((m = addRe.exec(sql))) {
      ensure(m[1]).add(m[2]);
    }
  }
  return schema;
}

/**
 * Wrap the in-memory fake so insert/update payloads are validated against the
 * provided schema map (table -> Set<column>). Unknown columns produce a
 * PostgREST-like error instead of silently succeeding.
 *
 * @param {() => Record<string, Set<string>>} getSchema
 */
export function createSchemaEnforcingSupabase(getSchema) {
  const fake = createFakeSupabase();
  const origFrom = fake.from.bind(fake);

  fake.from = (table) => {
    const qb = origFrom(table);
    const cols = getSchema()?.[table];

    const validate = (rows) => {
      if (!cols) return null; // table not in schema map -> don't enforce
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (!cols.has(key)) {
            return {
              message: `column "${key}" of relation "${table}" does not exist`,
              code: '42703',
            };
          }
        }
      }
      return null;
    };

    const origInsert = qb.insert.bind(qb);
    const origUpdate = qb.update.bind(qb);
    const origExec = qb._exec.bind(qb);

    qb.insert = (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      qb._schemaError = validate(rows);
      return origInsert(payload);
    };
    qb.update = (patch) => {
      qb._schemaError = validate([patch]);
      return origUpdate(patch);
    };
    qb._exec = async () => {
      if (qb._schemaError) return { data: null, error: qb._schemaError };
      return origExec();
    };

    return qb;
  };

  return fake;
}
