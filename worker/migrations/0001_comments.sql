-- ADR 0005 §3：评论线程与评论，只追加。长度、枚举由 Worker 校验（不写 CHECK，以后放宽或加枚举值不需要重建表）。
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  lang TEXT NOT NULL,
  quote TEXT NOT NULL,
  prefix TEXT NOT NULL,
  suffix TEXT NOT NULL,
  heading TEXT,
  rev TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_kind TEXT NOT NULL,
  status_changed_at TEXT,
  status_changed_by TEXT,
  status_changed_by_kind TEXT
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  author_kind TEXT NOT NULL,
  author_name TEXT NOT NULL,
  agent_runtime TEXT,
  agent_session TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX threads_slug_lang_status ON threads (slug, lang, status);
CREATE INDEX threads_status_created_at ON threads (status, created_at);
CREATE INDEX comments_thread_created_at ON comments (thread_id, created_at);
