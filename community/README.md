# Shared dictionary community service

This is an optional, privacy-minimal community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Data model

- A vote is scoped to the normalized selected surface word and a canonical source entry.
- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- No selected sentence, page text, account name, email, or device identifier is sent. The client creates a random per-install voter token; the service stores only its SHA-256 hash.
- One installation can vote once for a given word/entry pair. Votes are not transferable between different surface words.
- A community result is promoted only after at least 3 votes and at least 65% of votes for that candidate. Alternatives remain available.
- Original dictionary records and definitions are never modified.

## Deploy

1. Create a Cloudflare D1 database named `otzaria-dictionary-community`.
2. Put its database ID in `worker/wrangler.toml`.
3. From `community/worker`, run `npx wrangler d1 migrations apply otzaria-dictionary-community --remote`.
4. Deploy with `npx wrangler deploy`.
5. Set the resulting Worker URL in each plugin's `community-config.js`, and add that exact host to the plugin manifest network allowlist and CSP `connect-src`.
6. Generate the cross-dictionary link seed using `python3 build_entry_links.py`, then import the generated SQL/CSV into D1. Review generated links before import; only exact unique headword/alternate-headword matches are emitted.

No Worker is deployed and no votes are collected until a Cloudflare database and Worker URL are configured. The API has no paid dependency, but Cloudflare account limits and pricing apply.
