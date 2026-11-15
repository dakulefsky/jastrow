import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../plugin/community.js', import.meta.url), 'utf8');

async function load({ health = true, voteStatus = 200 } = {}) {
  const events = [], calls = [], values = new Map();
  const root = {
    DICTIONARY_COMMUNITY_API: 'https://community.example',
    dispatchEvent: event => events.push(event.type)
  };
  const context = {
    window: root, globalThis: root, URL, Event, AbortSignal, TextEncoder,
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
    fetch: async (input, init = {}) => {
      const url = String(input); calls.push({ url, method: init.method || 'GET' });
      if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: health }), { status: 200 });
      if (url.endsWith('/v1/vote')) return new Response(
        JSON.stringify(voteStatus === 200 ? { accepted: true, votes: 1 } : { error: 'unavailable' }),
        { status: voteStatus }
      );
      throw new Error('Unexpected community request: ' + url);
    }
  };
  vm.runInNewContext(source, context);
  await root.DictionaryCommunity.ready;
  return { api: root.DictionaryCommunity, events, calls };
}

const denied = await load({ health: false });
assert.equal(denied.api.enabled, false);
assert.equal((await denied.api.vote('נפקא', 'krupnik:KRU1')).reason, 'offline');
assert.equal(denied.calls.length, 1, 'denied/unavailable service must not receive vote requests');
assert.deepEqual(denied.events, []);

const failing = await load({ health: true, voteStatus: 503 });
assert.equal(failing.api.enabled, true);
assert.equal(failing.api.idFor({ source: 'jastrow', r: 'A03220' }), 'jastrow:A03220');
assert.equal(failing.api.idFor({ source: 'krupnik', r: 'KRU02095' }), 'krupnik:KRU02095');
assert.equal(failing.api.idFor({ rid: 'KRU02095' }), 'krupnik:KRU02095');
const failedVote = await failing.api.vote('נפקא', { rid: 'KRU02095' });
assert.equal(failedVote.ok, false);
assert.equal(failing.api.enabled, false);
assert.deepEqual(failing.events, ['dictionary-community-disabled']);
const before = failing.calls.length;
await failing.api.rank('נפקא', [{ rid: 'KRU02095' }]);
assert.equal(failing.calls.length, before, 'after failure the client must remain offline and silent');

console.log('PASS: offline denial, shared entry IDs, silent fail-closed transition, and no repeat requests after service failure.');
