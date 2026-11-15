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
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (!["/v1/suggestions", "/v1/vote", "/health"].includes(url.pathname))
      return json({ error: "not_found" }, 404);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "dictionary-community", version: 1 });
    if (url.pathname === "/v1/suggestions" && request.method === "GET") {
      const word = normalizeWord(url.searchParams.get("word"));
      const ids = (url.searchParams.get("ids") || "").split(",").filter(validId).slice(0, 40);
      if (!word || !ids.length) return json({ word, suggestions: [] });
      const canonical = await canonicalize(env.DB, ids);
      const keys = [...new Set([...canonical.values()])];
      const marks = keys.map(() => "?").join(",");
      const rows = await env.DB.prepare(`SELECT canonical_id, COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id IN (${marks}) GROUP BY canonical_id`).bind(word, ...keys).all();
      const counts = new Map((rows.results || []).map(row => [row.canonical_id, Number(row.votes)]));
      const suggestions = ids.map(id => ({ entryId: id, canonicalId: canonical.get(id), votes: counts.get(canonical.get(id)) || 0 }))
        .sort((a,b) => b.votes - a.votes);
      const total = suggestions.reduce((n,x) => n + x.votes, 0);
      const winner = suggestions[0];
      const confident = !!winner && winner.votes >= 3 && winner.votes / Math.max(total, 1) >= 0.65;
      return json({ word, suggestions, preferredEntryId: confident ? winner.entryId : null, totalVotes: total });
    }
    if (url.pathname === "/v1/vote" && request.method === "POST") {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 2048) return json({ error: "payload_too_large" }, 413);
      let body;
      try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
      const word = normalizeWord(body.word), entryId = body.entryId, voterId = body.voterId;
      if (!word || !validId(entryId) || typeof voterId !== "string" || !/^[A-Za-z0-9-]{20,80}$/.test(voterId))
        return json({ error: "invalid_vote" }, 400);
      const canonical = (await canonicalize(env.DB, [entryId])).get(entryId);
      const voterHash = await hashVoter(voterId);
      const result = await env.DB.prepare("INSERT OR IGNORE INTO votes (surface_word, canonical_id, voter_hash) VALUES (?, ?, ?)")
        .bind(word, canonical, voterHash).run();
      const count = await env.DB.prepare("SELECT COUNT(*) AS votes FROM votes WHERE surface_word = ? AND canonical_id = ?")
        .bind(word, canonical).first();
      return json({ accepted: (result.meta?.changes || 0) > 0, votes: Number(count?.votes || 0) });
    }
    return json({ error: "method_not_allowed" }, 405);
  }
};
