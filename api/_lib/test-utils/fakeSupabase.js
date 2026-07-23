/**
 * Minimal in-memory stand-in for the Supabase JS client, scoped to the exact
 * chain shapes used by api/_lib/modules/*.js (.from/.select/.eq/.in/.order/
 * .limit/.single/.maybeSingle/.insert/.update/.delete, plus .auth.getUser and
 * .storage.from().upload()/.getPublicUrl()).
 *
 * Why this exists: this sandbox's egress proxy denies direct outbound HTTPS to
 * the Supabase project host (confirmed via the proxy's own status endpoint —
 * an organization policy denial, not a bug), so no Node script here can do a
 * live signInWithPassword/REST round-trip against Supabase. This fake lets the
 * REAL, unmodified handler modules (api/_lib/modules/*.js, including the full
 * withApi -> requireAuth -> resolveTenantId -> handler pipeline) run against a
 * fast, deterministic in-memory Postgres-like store instead — proving the
 * production code's own logic, not a reimplementation of it.
 */

function matchOrder(rows, order) {
  if (!order) return rows;
  const { col, asc } = order;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * (asc ? 1 : -1);
  });
}

class FakeQueryBuilder {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._count = null;
    this._head = false;
    this._single = false;
    this._maybeSingle = false;
    this._op = 'select';
    this._insertRows = null;
    this._updatePatch = null;
  }

  select(_cols, opts) {
    if (opts?.count) this._count = opts.count;
    if (opts?.head) this._head = true;
    return this;
  }
  eq(col, val) {
    this._filters.push((r) => r[col] === val);
    return this;
  }
  neq(col, val) {
    this._filters.push((r) => r[col] !== val);
    return this;
  }
  in(col, arr) {
    this._filters.push((r) => arr.includes(r[col]));
    return this;
  }
  gte(col, val) {
    this._filters.push((r) => r[col] >= val);
    return this;
  }
  order(col, opts) {
    this._order = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  single() {
    this._single = true;
    return this;
  }
  maybeSingle() {
    this._maybeSingle = true;
    return this;
  }

  insert(payload) {
    this._op = 'insert';
    this._insertRows = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(patch) {
    this._op = 'update';
    this._updatePatch = patch;
    return this;
  }
  delete() {
    this._op = 'delete';
    return this;
  }

  _rows() {
    const table = this.store.table(this.table);
    return table.filter((r) => this._filters.every((f) => f(r)));
  }

  async _exec() {
    const table = this.store.table(this.table);

    if (this._op === 'insert') {
      const inserted = this._insertRows.map((r) => ({
        id: this.store.nextId(this.table),
        created_at: new Date().toISOString(),
        ...r,
      }));
      table.push(...inserted);
      if (this._single) return { data: inserted[0], error: null };
      return { data: inserted, error: null };
    }

    if (this._op === 'update') {
      const matched = this._rows();
      for (const row of matched) Object.assign(row, this._updatePatch);
      if (this._single) return { data: matched[0] || null, error: matched.length ? null : { message: 'no rows' } };
      return { data: matched, error: null };
    }

    if (this._op === 'delete') {
      const matched = this._rows();
      const ids = new Set(matched.map((r) => r.id));
      this.store.tables[this.table] = table.filter((r) => !ids.has(r.id));
      return { data: matched, error: null };
    }

    // select
    let rows = this._rows();
    if (this._order) rows = matchOrder(rows, this._order);
    if (this._limit != null) rows = rows.slice(0, this._limit);

    if (this._count) {
      return { data: this._head ? null : rows, error: null, count: rows.length };
    }
    if (this._single) {
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows found' } };
    }
    if (this._maybeSingle) {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }

  then(resolve, reject) {
    return this._exec().then(resolve, reject);
  }
}

class FakeStore {
  constructor(seed = {}) {
    this.tables = {};
    this._ids = {};
    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((r) => ({ ...r }));
      this._ids[table] = Math.max(0, ...rows.map((r) => Number(r.id) || 0));
    }
  }
  table(name) {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }
  nextId(name) {
    this._ids[name] = (this._ids[name] || 0) + 1;
    return this._ids[name];
  }
}

/**
 * @param {Record<string, object[]>} seed initial rows per table
 * @param {{ authUser?: { id: string, email: string } | null }} [opts]
 */
export function createFakeSupabase(seed = {}, opts = {}) {
  let store = new FakeStore(seed);
  let authUser = opts.authUser || null;
  const uploaded = [];

  const client = {
    get _store() {
      return store;
    },
    _uploaded: uploaded,
    /** Replace all table data (used between tests instead of recreating the client). */
    reset(newSeed = {}) {
      store = new FakeStore(newSeed);
      uploaded.length = 0;
    },
    setAuthUser(user) {
      authUser = user;
    },
    from(table) {
      return new FakeQueryBuilder(table, store);
    },
    auth: {
      async getUser(token) {
        if (!token || !authUser) {
          return { data: { user: null }, error: { message: 'invalid token' } };
        }
        return { data: { user: authUser }, error: null };
      },
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, _buffer, _options) {
            uploaded.push({ bucket, path });
            return { data: { path }, error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://fake-storage.local/${bucket}/${path}` } };
          },
          async remove(paths) {
            for (const p of paths) {
              const idx = uploaded.findIndex((u) => u.bucket === bucket && u.path === p);
              if (idx >= 0) uploaded.splice(idx, 1);
            }
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return client;
}
