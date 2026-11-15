# Shared dictionary community service

This is an optional, privacy-minimized community ranking service for the English Jastrow/Krupnik and Hebrew Krupnik plugins.

## Vote scopes

The service deliberately separates two active kinds of feedback:

- **General meaning** — selected from inside the dictionary. One active general vote per installation and normalized word. This can influence the general dictionary preference.
- **Contextual meaning** — selected from the reader's right-click menu. One vote per installation, normalized word, and exact local context fingerprint. These votes can help other occurrences with overlapping linguistic context features, without creating one database row per daf or passage.

A right-click choice is contextual by default. The in-dictionary voting panel explicitly records a general endorsement. Contextual ranking never falls back to general votes when it has no reliable matching context evidence; in that case, the original dictionary order is preserved.

Context matching uses a narrow local window: up to two Hebrew/Aramaic tokens before and after the selected text. The client derives deterministic SHA-256 fingerprints on-device for the exact window and reusable left/right token patterns. It sends only feature types and hashes—not the neighboring words, selected sentence, book title, daf/page reference, line number, or selection offsets. Hashes are fingerprints, not encryption: a determined observer could potentially guess common short contexts, so this is data minimization rather than a cryptographic anonymity guarantee.

- General preferences are promoted only after at least 3 distinct installations and at least 65% of all explicit general votes for the word.
- Contextual preferences are promoted only after at least 2 distinct installations support the candidate and its weighted share of all matching contextual evidence is at least 65%. Exact-window matches carry more weight than one-sided token matches.
- Each installation contributes at most once per candidate to a contextual ranking, even if several of its saved context votes match.
- Votes from the old unscoped system remain in the original `votes` table for historical continuity, but are deliberately excluded from both new ranking scopes. Their original context cannot be reconstructed safely, so they are never silently reclassified as general endorsements.
- Passage-only corrections are not yet exposed in the UI. They will be a separate, explicit layer and will not be mixed into general or contextual ranking.

## Data model

- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence Jastrow-to-Krupnik links to the Krupnik canonical ID.
- `general_votes` stores explicit general preferences.
- `context_votes` stores a contextual choice by normalized word, hashed context fingerprint, and anonymous installation hash.
- `context_vote_features` associates a context fingerprint with its hashed reusable context features.
- The original `votes` table is retained for old unscoped submissions only and is not used for ranking.
- No account name, email, hardware ID, account identifier, raw selected sentence, book title, daf/page reference, or passage offset is sent. The client sends a random per-install voter token; the service stores only its SHA-256 hash.
- Votes made while offline are stored in a local persistent queue and automatically retried after connectivity returns. General and contextual queued votes have separate keys so one cannot overwrite the other. The queue is retained until the Worker acknowledges the vote (including an already-recorded duplicate).
- If the user has never granted network access, community controls remain hidden and nothing is queued.
- Original dictionary records and definitions are never modified.
- Votes are community signals, not scholarly verification or an abuse-proof poll. There is no login or robust identity/rate-limit layer; a determined person can reset the per-install token and vote again.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The Worker deploys automatically when backend or cross-link source files change on `main`. It applies ordered D1 migrations, generates and imports exact unique Jastrow/Krupnik cross-links, deploys the Worker, and verifies its health endpoint.
3. The current deployed endpoint is `https://otzaria-dictionary-community.dakulefsky.workers.dev`. Both plugin builds configure this endpoint, use the full HTTPS URL in each manifest network allowlist, and restrict the browser CSP to this host.
4. The store release workflow validates, builds, and publishes both plugin packages when the changes reach `main`. Users must install the updated packages and grant the optional network permission before community features become available.

The Worker and D1 database are deployed. The API has no paid dependency, but Cloudflare account limits and pricing apply.
