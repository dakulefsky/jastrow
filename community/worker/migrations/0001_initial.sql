CREATE TABLE IF NOT EXISTS entry_links (
  alias_id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('exact', 'reviewed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS entry_links_canonical ON entry_links(canonical_id);
CREATE TABLE IF NOT EXISTS votes (
  surface_word TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (surface_word, canonical_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS votes_word ON votes(surface_word, canonical_id);
