# Shared dictionary community service

This is an optional, privacy-minimal community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Data model

- A vote is scoped to the normalized selected surface word and a canonical source entry.
- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- No selected sentence, page text, account name, email, or device identifier is sent. The client creates a random per-install voter token; the service stores only its SHA-256 hash.
- Each installation has one active vote per selected surface word and can change its choice. Votes are not transferable between different surface words.
- A community result is promoted only after at least 3 votes and at least 65% of votes for that candidate. Alternatives remain available.
- Original dictionary records and definitions are never modified.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. Run **Actions → Deploy dictionary community API → Run workflow**. The workflow creates/reuses the D1 database, applies migrations, generates and imports exact unique Jastrow/Krupnik cross-links, and deploys the Worker.
3. Copy the Worker URL from the workflow output. Set it in both plugins' `community-config.js` files, then add its exact host to each plugin manifest network allowlist and CSP `connect-src`.
4. Run the plugin validation workflows. Community lookup remains disabled until the URL and network permissions are configured.


No Worker is deployed and no votes are collected until a Cloudflare database and Worker URL are configured. The API has no paid dependency, but Cloudflare account limits and pricing apply.
