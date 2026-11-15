# Shared dictionary community service

This is an optional, privacy-minimal community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Data model

- A vote is scoped to the normalized selected surface word and a canonical source entry.
- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- No selected sentence, page text, account name, email, hardware ID, or account identifier is sent. The client sends a random per-install voter token with each vote; the service stores only its SHA-256 hash. The token is a resettable anonymous installation key, not a hardware ID or account identity.
- Each installation has one active vote per selected surface word and can change its choice. Votes are not transferable between different surface words.\n- Votes made while offline are stored in a local persistent queue and automatically retried after connectivity returns. The queue is retained until the Worker acknowledges the vote (including an already-recorded duplicate); the server's one-vote-per-installation-per-word upsert makes retries safe. If the user has never granted network access, community controls remain hidden and nothing is queued.
- A community result is promoted only after at least 3 votes and at least 65% of **all** votes for that normalized word. Votes for candidates omitted from the current lookup still count in the denominator. Alternatives remain available.
- Original dictionary records and definitions are never modified.
- Votes are an anonymous community signal, not scholarly verification or an abuse-proof poll. There is no login or robust identity/rate-limit layer; a determined person can reset the per-install token and vote again.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The Worker deploys automatically when backend or cross-link source files change on `main`. You can also run **Actions → Deploy dictionary community API → Run workflow** manually. The workflow creates/reuses the D1 database, applies migrations, generates and imports exact unique Jastrow/Krupnik cross-links, deploys the Worker, and verifies its health endpoint.
3. The current deployed endpoint is `https://otzaria-dictionary-community.dakulefsky.workers.dev`. The merged integration configures this endpoint in both plugin builds, uses the full HTTPS URL in each manifest network allowlist, and restricts the browser CSP to this host.
4. The store release workflow validates, builds, and publishes both plugin packages when the changes reach `main`. Users must install the updated packages and grant the optional network permission before community features become available.


The Worker and D1 database are deployed, and the Worker health check passes. The plugin integration is merged; the manifest URL-format hotfix is being validated before the updated packages can publish. Existing installed plugin versions remain offline-only until users install the updated builds and grant the optional network permission. The API has no paid dependency, but Cloudflare account limits and pricing apply.
\n\n## Offline vote queue\n\nBoth plugin clients keep pending votes in local storage, scoped by normalized word and the installation voter token. A later choice for the same word replaces that installation's queued choice, matching the server's one-active-vote model. On the browser `online` event, focus, and a periodic retry, the client checks the service and flushes the queue. It removes an item only after a valid server acknowledgement; network errors leave it pending. A previously successful health check is remembered locally so an already-authorized user can continue voting while the device is offline. On reconnect, a failed health check disables the optional UI; pending data is preserved. Fresh installs must first connect and grant network access once before offline voting can be enabled.\n