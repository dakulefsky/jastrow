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
  .replace(/\p{M}/gu, "").replace(/[^א-ת]/g, "").slice(0, 100);
const validId = value => typeof value === "string" && /^(?:krupnik|jastrow):[A-Za-z0-9._-]{1,80}$/.test(value);
const validFeatures = value => Array.isArray(value) && value.length > 0 && value.length <= 6 &&
  value.every(item => item && typeof item.hash === "string" && /^[a-f0-9]{64}$/.test(item.hash) &&
    [1, 3, 4].includes(item.weight)) &&
  new Set(value.map(item => item.hash)).size === value.length;
function parseFeatures(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return validFeatures(parsed) ? parsed : []; }
  catch { return []; }
}
function contextKey(features) {
  return features.map(item => item.hash + ":" + item.weight).sort().join(".");
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
  const rows = await db.prepare(`SELECT alias_id, canonical_id FROM entry_links WHERE confidence IN ('exact','reviewed') AND alias_id IN (${placeholders})`).bind(...ids).all();
  for (const row of rows.results || []) result.set(row.alias_id, row.canonical_id);
  return result;
}
async function contextualPreference(db, word, ids, canonical, features) {
  if (!features.length || !ids.length) return { entryId: null, votes: 0 };
  const weights = new Map(features.map(item => [item.hash, item.weight]));
  const totalWeight = features.reduce((sum, item) => sum + item.weight, 0);
  const placeholders = features.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT cv.vote_id, cv.canonical_id, cv.voter_hash,
      GROUP_CONCAT(cvf.feature_hash) AS matched_features
    FROM context_votes cv
    JOIN context_vote_features cvf ON cvf.vote_id = cv.vote_id
    WHERE cv.surface_word = ? AND cvf.feature_hash IN (${placeholders})
    GROUP BY cv.vote_id
    LIMIT 1000`).bind(word, ...features.map(item => item.hash)).all();
  const candidateCanonical = new Set([...canonical.values()]);
  const matchesByVoter = new Map();
  for (const row of rows.results || []) {
    if (!candidateCanonical.has(row.canonical_id)) continue;
    const matched = String(row.matched_features || "").split(",").filter(Boolean);
    const matchedWeight = [...new Set(matched)].reduce((sum, feature) => sum + (weights.get(feature) || 0), 0);
    const similarity = matchedWeight / Math.max(totalWeight, 1);
    // One weak neighboring word is not enough to alter a dictionary result.
    if (matched.length < 2 || similarity < 0.35) continue;
    if (!matchesByVoter.has(row.voter_hash)) matchesByVoter.set(row.voter_hash, new Map());
    const byMeaning = matchesByVoter.get(row.voter_hash);
    byMeaning.set(row.canonical_id, Math.max(byMeaning.get(row.canonical_id) || 0, similarity));
  }
  const grouped = new Map();
  for (const [voterHash, byMeaning] of matchesByVoter) {
    const rankedMatches = [...byMeaning.entries()].sort((a, b) => b[1] - a[1]);
    if (!rankedMatches.length) continue;
    const strongest = rankedMatches[0][1];
    // If one installation's nearby passages support two different meanings
    // almost equally, that installation is ambiguous for this lookup. Do not
    // let row order or an arbitrary tie-break turn it into a vote for either.
    const plausible = rankedMatches.filter(([, similarity]) => strongest - similarity <= 0.05);
    if (plausible.length !== 1) continue;
    const [canonicalId, similarity] = plausible[0];
    if (!grouped.has(canonicalId)) grouped.set(canonicalId, { score: 0, voters: new Set() });
    const group = grouped.get(canonicalId);
    group.score += similarity;
    group.voters.add(voterHash);
  }
  const totalScore = [...grouped.values()].reduce((sum, group) => sum + group.score, 0);
  const ranked = [...grouped.entries()].sort((a, b) => b[1].score - a[1].score);
  const winner = ranked[0];
  if (!winner) return { entryId: null, votes: 0 };
  const [canonicalId, group] = winner;
  const share = group.score / Math.max(totalScore, 0.000001);
  if (group.voters.size < 2 || group.score < 1.4 || share < 0.65)
    return { entryId: null, votes: group.voters.size };
  return {
    entryId: ids.find(id => canonical.get(id) === canonicalId) || null,
    votes: group.voters.size
  };
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
      const features = parseFeatures(url.searchParams.get("context"));
      if (!word || !ids.length) return json({ word, suggestions: [], preferredEntryId: null, preferenceScope: null });
      const canonical = await canonicalize(env.DB, ids);
      // General votes remain the baseline and retain the existing conservative threshold.
      const rows = await env.DB.prepare(`SELECT canonical_id, COUNT(*) AS votes FROM votes
        WHERE surface_word = ? GROUP BY canonical_id`).bind(word).all();
      const counts = new Map((rows.results || []).map(row => [row.canonical_id, Number(row.votes)]));
      const suggestions = ids.map(id => ({ entryId: id, canonicalId: canonical.get(id), votes: counts.get(canonical.get(id)) || 0 }))
        .sort((a,b) => b.votes - a.votes);
      const total = [...counts.values()].reduce((n,count) => n + count, 0);
      const winner = suggestions[0];
      const generalPreferred = !!winner && winner.votes >= 3 && winner.votes / Math.max(total, 1) >= 0.65
        ? winner.entryId : null;
      const contextual = await contextualPreference(env.DB, word, ids, canonical, features);
      const preferredEntryId = contextual.entryId || generalPreferred;
      return json({
        word, suggestions, totalVotes: total,
        generalPreferredEntryId: generalPreferred,
        contextualPreferredEntryId: contextual.entryId,
        contextualVotes: contextual.votes,
        preferredEntryId,
        preferenceScope: contextual.entryId ? "contextual" : generalPreferred ? "general" : null
      });
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
      const scope = body.scope || "general"; // Older installed clients remain general-vote compatible.
      if (!word || !validId(entryId) || typeof voterId !== "string" ||
          !/^[A-Za-z0-9-]{20,80}$/.test(voterId) || !["general", "contextual"].includes(scope))
        return json({ error: "invalid_vote" }, 400);
      const features = scope === "contextual" ? body.contextFeatures : [];
      if (scope === "contextual" && !validFeatures(features))
        return json({ error: "invalid_context" }, 400);
      const canonical = (await canonicalize(env.DB, [entryId])).get(entryId);
      const voterHash = await hashVoter(voterId);
      if (scope === "general") {
        const prior = await env.DB.prepare("SELECT canonical_id FROM votes WHERE surface_word = ? AND voter_hash = ?")
          .bind(word, voterHash).first();
        if (prior?.canonical_id === canonical) {
          const count = await env.DB.prepare("SELECT COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id = ?")
            .bind(word, canonical).first();
          return json({ accepted: false, duplicate: true, votes: Number(count?.votes || 0), scope });
        }
        await env.DB.prepare("INSERT INTO votes (surface_word, canonical_id, voter_hash) VALUES (?, ?, ?) ON CONFLICT(surface_word, voter_hash) DO UPDATE SET canonical_id = excluded.canonical_id, created_at = CURRENT_TIMESTAMP")
          .bind(word, canonical, voterHash).run();
        const count = await env.DB.prepare("SELECT COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id = ?")
          .bind(word, canonical).first();
        return json({ accepted: true, updated: !!prior, votes: Number(count?.votes || 0), scope });
      }
      const key = contextKey(features);
      const prior = await env.DB.prepare(`SELECT vote_id, canonical_id FROM context_votes
        WHERE surface_word = ? AND context_key = ? AND voter_hash = ?`).bind(word, key, voterHash).first();
      if (prior?.canonical_id === canonical) {
        // Complete any feature rows left incomplete by an interrupted earlier request.
        for (const feature of features) {
          await env.DB.prepare("INSERT OR IGNORE INTO context_vote_features (vote_id, feature_hash) VALUES (?, ?)")
            .bind(prior.vote_id, feature.hash).run();
        }
        const count = await env.DB.prepare(`SELECT COUNT(*) AS votes FROM context_votes
          WHERE surface_word = ? AND context_key = ? AND canonical_id = ?`).bind(word, key, canonical).first();
        return json({ accepted: false, duplicate: true, votes: Number(count?.votes || 0), scope });
      }
      await env.DB.prepare(`INSERT INTO context_votes
        (surface_word, context_key, canonical_id, voter_hash)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(surface_word, context_key, voter_hash)
        DO UPDATE SET canonical_id = excluded.canonical_id, created_at = CURRENT_TIMESTAMP`)
        .bind(word, key, canonical, voterHash).run();
      const saved = await env.DB.prepare(`SELECT vote_id FROM context_votes
        WHERE surface_word = ? AND context_key = ? AND voter_hash = ?`).bind(word, key, voterHash).first();
      if (!saved?.vote_id) return json({ error: "vote_not_saved" }, 500);
      for (const feature of features) {
        await env.DB.prepare("INSERT OR IGNORE INTO context_vote_features (vote_id, feature_hash) VALUES (?, ?)")
          .bind(saved.vote_id, feature.hash).run();
      }
      const count = await env.DB.prepare(`SELECT COUNT(*) AS votes FROM context_votes
        WHERE surface_word = ? AND context_key = ? AND canonical_id = ?`).bind(word, key, canonical).first();
      return json({ accepted: true, updated: !!prior, votes: Number(count?.votes || 0), scope });
    }
    return json({ error: "method_not_allowed" }, 405);
  }
};