import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./worker/src/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const weights = { exact: 5, pair: 4, left2right1: 3, left1right2: 3, left2: 2, right2: 2, left1: 1, right1: 1 };
class MockDB {
  constructor() {
    this.links = new Map([['jastrow:JAS1', 'krupnik:KRU1']]);
    this.legacy = new Map();
    this.general = new Map();
    this.context = new Map();
    this.features = new Map();
  }
  prepare(sql) {
    return { bind: (...args) => ({
      all: async () => {
        if (sql.includes('FROM entry_links')) {
          return { results: args.filter(x => this.links.has(x)).map(alias_id => ({ alias_id, canonical_id: this.links.get(alias_id) })) };
        }
        if (sql.includes('FROM general_votes')) {
          const [word] = args, counts = new Map();
          for (const vote of this.general.values()) if (vote.word === word) counts.set(vote.id, (counts.get(vote.id) || 0) + 1);
          return { results: [...counts].map(([canonical_id, votes]) => ({ canonical_id, votes })) };
        }
        if (sql.includes('FROM context_votes v JOIN context_vote_features f')) {
          const [word, ...rest] = args, wanted = new Map();
          for (let i = 0; i < rest.length; i += 2) wanted.set(rest[i] + ':' + rest[i + 1], weights[rest[i]]);
          const byVoter = new Map();
          for (const vote of this.context.values()) {
            if (vote.word !== word) continue;
            let weight = 0;
            for (const feature of this.features.values()) {
              if (feature.word !== word || feature.contextKey !== vote.contextKey) continue;
              weight = Math.max(weight, wanted.get(feature.type + ':' + feature.hash) || 0);
            }
            if (!weight) continue;
            const key = vote.id + '|' + vote.voter;
            byVoter.set(key, Math.max(byVoter.get(key) || 0, weight));
          }
          return { results: [...byVoter].map(([key, weight]) => {
            const split = key.lastIndexOf('|');
            return { canonical_id: key.slice(0, split), voter_hash: key.slice(split + 1), weight };
          }) };
        }
        throw new Error('Unexpected all SQL: ' + sql);
      },
      first: async () => {
        if (sql.includes('SELECT canonical_id FROM context_votes')) {
          const [word, contextKey, voter] = args, row = this.context.get(word + '|' + contextKey + '|' + voter);
          return row ? { canonical_id: row.id } : null;
        }
        if (sql.includes('SELECT canonical_id FROM general_votes')) {
          const [word, voter] = args, row = this.general.get(word + '|' + voter);
          return row ? { canonical_id: row.id } : null;
        }
        if (sql.includes('SELECT canonical_id FROM votes')) {
          const [word, voter] = args, row = this.legacy.get(word + '|' + voter);
          return row ? { canonical_id: row.id } : null;
        }
        if (sql.includes('COUNT(DISTINCT voter_hash)')) {
          const [word, contextKey, id] = args;
          return { votes: [...this.context.values()].filter(v => v.word === word && v.contextKey === contextKey && v.id === id).length };
        }
        if (sql.includes('COUNT(*) AS votes')) {
          const [word, id] = args;
          const store = sql.includes('FROM general_votes') ? this.general : this.legacy;
          return { votes: [...store.values()].filter(v => v.word === word && v.id === id).length };
        }
        throw new Error('Unexpected first SQL: ' + sql);
      },
      run: async () => {
        if (sql.includes('INSERT OR IGNORE INTO context_vote_features')) {
          const [word, contextKey, type, hash] = args, key = word + '|' + contextKey + '|' + type + '|' + hash;
          if (!this.features.has(key)) this.features.set(key, { word, contextKey, type, hash });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO context_votes')) {
          const [word, contextKey, id, voter] = args, key = word + '|' + contextKey + '|' + voter;
          this.context.set(key, { word, contextKey, id, voter });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO general_votes')) {
          const [word, id, voter] = args;
          this.general.set(word + '|' + voter, { word, id, voter });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO votes')) {
          const [word, id, voter] = args;
          this.legacy.set(word + '|' + voter, { word, id, voter });
          return { meta: { changes: 1 } };
        }
        throw new Error('Unexpected run SQL: ' + sql);
      }
    })};
  }
}
const DB = new MockDB(), env = { DB };
const call = async (path, init = {}) => worker.fetch(new Request('https://test.example' + path, init), env);
const token = n => 'voter-token-' + n + '-abcdefghijklmnop';
const hex = n => String(n).repeat(64);
const feature = (type, n) => ({ type, hash: hex(n) });
async function vote(word, entryId, n, scope = 'general', extra = {}) {
  return call('/v1/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, entryId, voterId: token(n), scope, ...extra }) });
}
async function suggestions(word, ids, scope = 'general', features = []) {
  const params = new URLSearchParams({ word, ids: ids.join(','), scope, features: JSON.stringify(features) });
  return (await call('/v1/suggestions?' + params)).json();
}
assert.equal((await (await call('/health')).json()).version, 2);

// Explicit general votes still share reviewed/exact Jastrow↔Krupnik IDs.
for (let i = 1; i <= 2; i++) assert.equal((await (await vote('נפקא', 'jastrow:JAS1', i)).json()).accepted, true);
let result = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2']);
assert.equal(result.preferredEntryId, null, 'two general votes must not establish consensus');
await vote('נפקא', 'krupnik:KRU1', 3);
result = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2']);
assert.equal(result.preferredEntryId, 'jastrow:JAS1', 'Jastrow alias must share the Krupnik general-vote pool');

// Legacy votes are retained but cannot silently become general endorsements.
await vote('נפקא', 'krupnik:KRU2', 4, 'legacy');
result = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2']);
assert.equal(result.preferredEntryId, 'jastrow:JAS1', 'legacy votes must not distort scoped general ranking');

// Context votes generalize through overlapping hashed features, but stay separate
// from general votes and from unrelated contexts.
const contextA = [feature('exact', 'a'), feature('pair', 'b'), feature('left1', 'c'), feature('right1', 'd')];
const contextB = [feature('exact', 'e'), feature('pair', 'f'), feature('left1', 'c'), feature('right1', 'g')];
const contextC = [feature('exact', 'h'), feature('pair', 'i'), feature('left1', 'j'), feature('right1', 'k')];
const keyA = hex('1'), keyB = hex('2'), keyC = hex('3');
for (const [n, key, features] of [[5,keyA,contextA],[6,keyB,contextB]]) {
  const r = await (await vote('נפקא', 'krupnik:KRU2', n, 'context', { contextKey: key, features })).json();
  assert.equal(r.accepted, true);
}
let contextual = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2'], 'context', contextA);
assert.equal(contextual.preferredEntryId, 'krupnik:KRU2', 'a similar context should learn from both neighboring usage patterns');
assert.equal(contextual.supporters, 2, 'the same installation must contribute at most once per candidate');
result = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2'], 'general');
assert.equal(result.preferredEntryId, 'jastrow:JAS1', 'context votes must not change the general dictionary preference');
contextual = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2'], 'context', contextC);
assert.equal(contextual.preferredEntryId, null, 'unrelated contexts must not inherit votes');

// One installation changing a vote in the same exact context updates its choice.
await vote('נפקא', 'krupnik:KRU1', 5, 'context', { contextKey: keyA, features: contextA });
contextual = await suggestions('נפקא', ['jastrow:JAS1', 'krupnik:KRU2'], 'context', contextA);
assert.equal(contextual.preferredEntryId, null, 'a single contextual supporter is not enough to promote a result');

// Votes for candidates outside the current candidate list still count against
// general consensus, so a truncated list cannot manufacture a winner.
for (let i = 7; i <= 8; i++) await vote('בדיקה', 'krupnik:KRU1', i);
for (let i = 9; i <= 10; i++) await vote('בדיקה', 'krupnik:KRU2', i);
await vote('בדיקה', 'krupnik:KRU1', 11);
const partial = await suggestions('בדיקה', ['krupnik:KRU1']);
assert.equal(partial.preferredEntryId, null, 'votes for omitted candidates must count against consensus');

// Input validation and payload limits remain enforced.
const invalidFeature = await call('/v1/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ word: 'נפקא', entryId: 'krupnik:KRU1', voterId: token(12), scope: 'context', contextKey: keyA, features: [{ type: 'exact', hash: 'not-a-hash' }] }) });
assert.equal((await invalidFeature.json()).error, 'invalid_context');
const oversized = await call('/v1/vote', { method: 'POST', body: JSON.stringify({ word: 'נפקא', entryId: 'krupnik:KRU1', voterId: token(13), padding: 'x'.repeat(5000) }) });
assert.equal(oversized.status, 413, 'request body limit must apply even without Content-Length');
const nullBody = await call('/v1/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
assert.equal(nullBody.status, 400, 'null JSON must be rejected as an invalid vote');
console.log('PASS: scoped general/context ranking, cross-dictionary canonical IDs, conservative context matching, legacy isolation, and validation.');
