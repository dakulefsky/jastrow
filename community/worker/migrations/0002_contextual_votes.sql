CREATE TABLE IF NOT EXISTS context_votes (
  vote_id INTEGER PRIMARY KEY AUTOINCREMENT,
  surface_word TEXT NOT NULL,
  context_key TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(surface_word, context_key, voter_hash)
);
CREATE INDEX IF NOT EXISTS context_votes_word ON context_votes(surface_word, canonical_id);
CREATE TABLE IF NOT EXISTS context_vote_features (
  vote_id INTEGER NOT NULL,
  feature_hash TEXT NOT NULL,
  PRIMARY KEY (vote_id, feature_hash)
);
CREATE INDEX IF NOT EXISTS context_vote_features_hash ON context_vote_features(feature_hash, vote_id);
