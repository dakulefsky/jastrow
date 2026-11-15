# Shared dictionary community service

This is an optional, privacy-minimal community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Data model

- A vote is scoped to the normalized selected surface word and a canonical source entry.
- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- No selected sentence, page text, account name, email, hardware ID, or account identifier is sent. The client sends a random per-install voter token with each vote; the service stores only its SHA-256 hash. The token is a resettable anonymous installation key, not a hardware ID or account identity.
- Each installation has one active vote per selected surface word and can change its choice. Votes are not transferable between different surface words.
- A community result is promoted only after at least 3 votes and at least 65% of votes for that candidate. Alternatives remain available.
- Original dictionary records and definitions are never modified.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The Worker deploys automatically when backend or cross-link source files change on `main`. You can also run **Actions → Deploy dictionary community API → Run workflow** manually. The workflow creates/reuses the D1 database, applies migrations, generates and imports exact unique Jastrow/Krupnik cross-links, deploys the Worker, and verifies its health endpoint.
3. The current deployed endpoint is `https://otzaria-dictionary-community.dakulefsky.workers.dev`. The open integration PR configures this endpoint in both plugin builds, restricts the manifest allowlist, and narrows the browser CSP to this host.
4. Merge only after the English and Hebrew validation workflows pass. Existing installed plugin versions do not begin using the API until users install the updated builds and grant the optional network permission.


The Worker and D1 database have been deployed. The current `main` plugin builds remain offline-only until the integration PR is merged and published. The API has no paid dependency, but Cloudflare account limits and pricing apply.
