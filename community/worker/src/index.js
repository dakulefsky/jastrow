const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
const normalizeWord = value => String(value || "").normalize("NFKD")
  .replace(/[\u0591-\u05C7]/g, "").replace(/[^א-ת]/g, "").slice(0, 100);
const validId = value => typeof value === "string" && /^(?:krupnik|jastrow):[A-Za-z0-9._-]{1,80}$/.test(value);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const featureWeights = { exact: 5, pair: 4, left2right1: 3, left1right2: 3, left2: 2, right2: 2, left1: 1, right1: 1 };
function parseFeatures(value) {
  if (!value) return [];
  try {
    const items = JSON.parse(value);
    if (!Array.isArray(items) || items.length > 8) return [];
    const unique = new Map();
    for (const item of items) {
      if (!item || typeof item !== "object" || !Object.hasOwn(featureWeights, item.type) || !validHash(item.hash)) return [];
      unique.set(item.type + ":" + item.hash, { type: item.type, hash: item.hash });
    }
    return [...unique.values()];
  } catch { return []; }
}
function validVoteFeatures(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return [];
  const unique = new Map();
  for (const item of value) {
    if (!item || typeof item !== "object" || !Object.hasOwn(featureWeights, item.type) || !validHash(item.hash)) return [];
    unique.set(item.type + ":" + item.hash, { type: item.type, hash: item.hash });
  }
  return [...unique.values()];
}
async function hashVoter(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function canonicalize(db, ids) {
  const result = new Map(ids.map(id => [id, id]));
  if (!ids.length) return result;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.prepare("SELECT alias_id, canonical_id FROM entry_links WHERE confidence IN ('exact','reviewed') AND alias_id IN (" + placeholders + ")").bind(...ids).all();
  for (const row of rows.results || []) result.set(row.alias_id, row.canonical_id);
  return result;
}
async function generalRanking(db, word, ids, canonical) {
  const rows = await db.prepare("SELECT canonical_id, COUNT(*) AS votes FROM general_votes WHERE surface_word = ? GROUP BY canonical_id").bind(word).all();
  const counts = new Map((rows.results || []).map(row => [row.canonical_id, Number(row.votes)]));
  const suggestions = ids.map(id => ({ entryId: id, canonicalId: canonical.get(id), votes: counts.get(canonical.get(id)) || 0 }))
    .sort((a, b) => b.votes - a.votes);
  const total = [...counts.values()].reduce((n, count) => n + count, 0);
  const winner = suggestions[0];
  const confident = !!winner && winner.votes >= 3 && winner.votes / Math.max(total, 1) >= 0.65;
  return { preferredEntryId: confident ? winner.entryId : null, suggestions, totalVotes: total };
}
async function contextualRanking(db, word, ids, canonical, features) {
  if (!features.length) return { preferredEntryId: null, suggestions: [], totalVotes: 0, supporters: 0, confidence: 0 };
  const clauses = features.map(() => "(f.feature_type = ? AND f.feature_hash = ?)").join(" OR ");
  const params = [word, ...features.flatMap(item => [item.type, item.hash])];
  const rows = await db.prepare(
    "SELECT canonical_id, voter_hash, MAX(weight) AS weight FROM (" +
      "SELECT v.canonical_id, v.voter_hash, v.context_key, " +
      "MAX(CASE f.feature_type " +
      "WHEN 'exact' THEN 5 WHEN 'pair' THEN 4 " +
      "WHEN 'left2right1' THEN 3 WHEN 'left1right2' THEN 3 " +
      "WHEN 'left2' THEN 2 WHEN 'right2' THEN 2 ELSE 1 END) AS weight " +
      "FROM context_votes v JOIN context_vote_features f " +
      "ON f.surface_word = v.surface_word AND f.context_key = v.context_key " +
      "WHERE v.surface_word = ? AND (" + clauses + ") " +
      "GROUP BY v.canonical_id, v.voter_hash, v.context_key" +
    ") matched GROUP BY canonical_id, voter_hash"
  ).bind(...params).all();
  const scores = new Map();
  for (const row of rows.results || []) {
    const id = row.canonical_id, weight = Number(row.weight) || 0, item = scores.get(id) || { score: 0, supporters: 0, strongSupporters: 0 };
    item.score += weight;
    item.supporters += 1;
    if (weight >= 2) item.strongSupporters += 1;
    scores.set(id, item);
  }
  const totalScore = [...scores.values()].reduce((sum, item) => sum + item.score, 0);
  const suggestions = ids.map(id => {
    const item = scores.get(canonical.get(id)) || { score: 0, supporters: 0, strongSupporters: 0 };
    return { entryId: id, canonicalId: canonical.get(id), score: item.score, supporters: item.supporters, strongSupporters: item.strongSupporters };
  }).sort((a, b) => b.score - a.score);
  const winner = suggestions[0];
  const confidence = winner && totalScore ? winner.score / totalScore : 0;
  const confident = !!winner && winner.supporters >= 2 && winner.strongSupporters >= 2 && confidence >= 0.65;
  return { preferredEntryId: confident ? winner.entryId : null, suggestions, totalVotes: [...scores.values()].reduce((n, item) => n + item.supporters, 0), supporters: winner?.supporters || 0, strongSupporters: winner?.strongSupporters || 0, confidence };
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (!["/v1/suggestions", "/v1/vote", "/health"].includes(url.pathname))
      return json({ error: "not_found" }, 404);
    if (url.pathname === "/health" && request.method === "GET")
      return json({ ok: true, service: "dictionary-community", version: 2 });
    if (url.pathname === "/v1/suggestions" && request.method === "GET") {
      const word = normalizeWord(url.searchParams.get("word"));
      const ids = (url.searchParams.get("ids") || "").split(",").filter(validId).slice(0, 40);
      const features = parseFeatures(url.searchParams.get("features"));
      const scope = url.searchParams.get("scope") === "context" ? "context" : "general";
      if (!word || !ids.length) return json({ word, scope, suggestions: [], preferredEntryId: null });
      const canonical = await canonicalize(env.DB, ids);
      const ranking = scope === "context"
        ? await contextualRanking(env.DB, word, ids, canonical, features)
        : await generalRanking(env.DB, word, ids, canonical);
      return json({ word, scope, ...ranking });
    }
    if (url.pathname === "/v1/vote" && request.method === "POST") {
      const declaredLength = Number(request.headers.get("Content-Length") || 0);
      if (declaredLength > 4096) return json({ error: "payload_too_large" }, 413);
      let raw;
      try { raw = await request.text(); } catch { return json({ error: "invalid_json" }, 400); }
      if (new TextEncoder().encode(raw).byteLength > 4096) return json({ error: "payload_too_large" }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_vote" }, 400);
      const word = normalizeWord(body.word), entryId = body.entryId, voterId = body.voterId;
      const scope = body.scope === undefined ? "legacy" : body.scope;
      if (!word || !validId(entryId) || typeof voterId !== "string" || !/^[A-Za-z0-9-]{20,80}$/.test(voterId) ||
          !["legacy", "general", "context"].includes(scope))
        return json({ error: "invalid_vote" }, 400);
      let features = [], contextKey = "";
      if (scope === "context") {
        features = validVoteFeatures(body.features);
        contextKey = body.contextKey;
        if (!features.length) return json({ error: "invalid_context_features" }, 400);
        if (!validHash(contextKey)) return json({ error: "invalid_context_key" }, 400);
      }
      const canonical = (await canonicalize(env.DB, [entryId])).get(entryId);
      const voterHash = await hashVoter(voterId);
      let prior = null, count = 0;
      if (scope === "context") {
        prior = await env.DB.prepare("SELECT canonical_id FROM context_votes WHERE surface_word = ? AND context_key = ? AND voter_hash = ?")
          .bind(word, contextKey, voterHash).first();
        if (prior?.canonical_id === canonical) {
          const tally = await env.DB.prepare("SELECT COUNT(DISTINCT voter_hash) AS votes FROM context_votes WHERE surface_word = ? AND context_key = ? AND canonical_id = ?")
            .bind(word, contextKey, canonical).first();
          return json({ accepted: false, duplicate: true, scope, votes: Number(tally?.votes || 0) });
        }
        for (const feature of features) {
          await env.DB.prepare("INSERT OR IGNORE INTO context_vote_features (surface_word, context_key, feature_type, feature_hash) VALUES (?, ?, ?, ?)")
            .bind(word, contextKey, feature.type, feature.hash).run();
        }
        await env.DB.prepare("INSERT INTO context_votes (surface_word, context_key, canonical_id, voter_hash) VALUES (?, ?, ?, ?) ON CONFLICT(surface_word, context_key, voter_hash) DO UPDATE SET canonical_id = excluded.canonical_id, created_at = CURRENT_TIMESTAMP")
          .bind(word, contextKey, canonical, voterHash).run();
        const tally = await env.DB.prepare("SELECT COUNT(DISTINCT voter_hash) AS votes FROM context_votes WHERE surface_word = ? AND context_key = ? AND canonical_id = ?")
          .bind(word, contextKey, canonical).first();
        count = Number(tally?.votes || 0);
      } else if (scope === "general") {
        prior = await env.DB.prepare("SELECT canonical_id FROM general_votes WHERE surface_word = ? AND voter_hash = ?")
          .bind(word, voterHash).first();
        if (prior?.canonical_id === canonical) {
          const tally = await env.DB.prepare("SELECT COUNT(*) AS votes FROM general_votes WHERE surface_word = ? AND canonical_id = ?")
            .bind(word, canonical).first();
          return json({ accepted: false, duplicate: true, scope, votes: Number(tally?.votes || 0) });
        }
        await env.DB.prepare("INSERT INTO general_votes (surface_word, canonical_id, voter_hash) VALUES (?, ?, ?) ON CONFLICT(surface_word, voter_hash) DO UPDATE SET canonical_id = excluded.canonical_id, created_at = CURRENT_TIMESTAMP")
          .bind(word, canonical, voterHash).run();
        const tally = await env.DB.prepare("SELECT COUNT(*) AS votes FROM general_votes WHERE surface_word = ? AND canonical_id = ?")
          .bind(word, canonical).first();
        count = Number(tally?.votes || 0);
      } else {
        // Votes from older clients are retained as legacy evidence, but they
        // are no longer allowed to influence either general or contextual ranking.
        prior = await env.DB.prepare("SELECT canonical_id FROM votes WHERE surface_word = ? AND voter_hash = ?")
          .bind(word, voterHash).first();
        if (prior?.canonical_id === canonical) {
          const tally = await env.DB.prepare("SELECT COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id = ?")
            .bind(word, canonical).first();
          return json({ accepted: false, duplicate: true, scope, votes: Number(tally?.votes || 0) });
        }
        await env.DB.prepare("INSERT INTO votes (surface_word, canonical_id, voter_hash) VALUES (?, ?, ?) ON CONFLICT(surface_word, voter_hash) DO UPDATE SET canonical_id = excluded.canonical_id, created_at = CURRENT_TIMESTAMP")
          .bind(word, canonical, voterHash).run();
        const tally = await env.DB.prepare("SELECT COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id = ?")
          .bind(word, canonical).first();
        count = Number(tally?.votes || 0);
      }
      return json({ accepted: true, updated: !!prior, scope, votes: count });
    }
    return json({ error: "method_not_allowed" }, 405);
  }
};