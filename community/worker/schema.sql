CREATE TABLE IF NOT EXISTS entry_links (
  alias_id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('exact', 'reviewed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS entry_links_canonical ON entry_links(canonical_id);

-- Original unscoped votes remain here as legacy evidence only. The new Worker
-- deliberately excludes them from ranking because their original context is unknown.
CREATE TABLE IF NOT EXISTS votes (
  surface_word TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (surface_word, voter_hash)
);
CREATE INDEX IF NOT EXISTS votes_word ON votes(surface_word, canonical_id);

CREATE TABLE IF NOT EXISTS general_votes (
  surface_word TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (surface_word, voter_hash)
);
CREATE INDEX IF NOT EXISTS general_votes_word ON general_votes(surface_word, canonical_id);

CREATE TABLE IF NOT EXISTS context_votes (
  surface_word TEXT NOT NULL,
  context_key TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (surface_word, context_key, voter_hash)
);
CREATE INDEX IF NOT EXISTS context_votes_word ON context_votes(surface_word, canonical_id);

CREATE TABLE IF NOT EXISTS context_vote_features (
  surface_word TEXT NOT NULL,
  context_key TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  PRIMARY KEY (surface_word, context_key, feature_type, feature_hash)
);
CREATE INDEX IF NOT EXISTS context_features_lookup ON context_vote_features(surface_word, feature_type, feature_hash);
