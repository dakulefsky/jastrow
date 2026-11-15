# Shared dictionary community service

This is an optional, privacy-minimal community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Data model

- A vote is scoped to the normalized selected surface word and a canonical source entry.
- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- No selected sentence, page text, account name, email, hardware ID, or account identifier is sent. The client sends a random per-install voter token with each vote; the service stores only its SHA-256 hash. The token is a resettable anonymous installation key, not a hardware ID or account identity.
- Each installation has one active vote per selected surface word and can change its choice. Votes are not transferable between different surface words.
- A community result is promoted only after at least 3 votes and at least 65% of **all** votes for that normalized word. Votes for candidates omitted from the current lookup still count in the denominator. Alternatives remain available.
- Original dictionary records and definitions are never modified.
- Votes are an anonymous community signal, not scholarly verification or an abuse-proof poll. There is no login or robust identity/rate-limit layer; a determined person can reset the per-install token and vote again.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The Worker deploys automatically when backend or cross-link source files change on `main`. You can also run **Actions → Deploy dictionary community API → Run workflow** manually. The workflow creates/reuses the D1 database, applies migrations, generates and imports exact unique Jastrow/Krupnik cross-links, deploys the Worker, and verifies its health endpoint.
3. The current deployed endpoint is `https://otzaria-dictionary-community.dakulefsky.workers.dev`. The merged integration configures this endpoint in both plugin builds, uses the full HTTPS URL in each manifest network allowlist, and restricts the browser CSP to this host.
4. The store release workflow validates, builds, and publishes both plugin packages when the changes reach `main`. Users must install the updated packages and grant the optional network permission before community features become available.


The Worker and D1 database are deployed, and the Worker health check passes. The plugin integration is merged; the manifest URL-format hotfix is being validated before the updated packages can publish. Existing installed plugin versions remain offline-only until users install the updated builds and grant the optional network permission. The API has no paid dependency, but Cloudflare account limits and pricing apply.
