D1 `research-hub-comments` 的迁移（ADR 0005 §2）：`NNNN_<name>.sql`，只做加法（新表、新列、新索引；不删除、不改名、不改类型），部署私有 Worker 之前由 `wrangler d1 migrations apply research-hub-comments --remote` 执行。
