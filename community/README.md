# Shared dictionary community service

The optional service is shared by the English Jastrow/Krupnik and Hebrew Krupnik plugins. It keeps original source entries and definitions unchanged.

## Three voting scopes

- **General preference:** an explicit endorsement that a dictionary entry is the generally better meaning for a word. These votes retain the existing conservative promotion rule: at least 3 votes and 65% of all general votes for that normalized word.
- **Contextual preference:** the default action from a reader right-click. It means “this entry fits this use,” not “this is always the meaning.” The client derives a small set of nearby-word features from the reader's text anchor and hashes them locally. Only those hashes and their weights are sent to the Worker; the selected sentence, full passage, book title, daf, reference, and page are not sent.
- **Passage-specific correction:** not used to change shared ranking in this first implementation. When the reader cannot provide enough nearby context, the contextual vote is not sent. The user can still make an explicit general choice in the dictionary panel.

Context features represent one adjacent word, a two-word phrase on either side, and the nearest words on both sides. Two-word and around-the-word matches carry more weight than a single neighboring word. The Worker only considers a contextual match when at least two features overlap and their weighted similarity is strong enough. A contextual preference is promoted only with at least two distinct installations supporting the same candidate and a 65% share of the matching contextual evidence. A single vote is stored but does not reorder results.

Contextual votes can help other passages with similar local language patterns; they are not tied to a daf. A different context keeps its own evidence and can favor a different dictionary meaning. When contextual evidence is insufficient, the general dictionary preference remains the fallback. The system does not claim to understand the whole sugya or determine halachic meaning.

## Shared identity and privacy

- Krupnik records use `krupnik:KRU…`; Jastrow records use `jastrow:<source rid>`.
- `entry_links` maps only high-confidence exact Jastrow-to-Krupnik links to a Krupnik canonical ID, so votes on the same shared source can contribute across both plugins.
- General votes are keyed by normalized surface word and canonical entry. Contextual votes are keyed by normalized word, a hash of the contextual feature set, and the installation's anonymous voter hash.
- The client stores a random per-install voter token. The service stores only its SHA-256 hash; it does not receive an account name, email, hardware ID, selected sentence, book identifier, daf or page.
- Context feature hashes are produced on-device from nearby Aramaic/Hebrew words. They are opaque to the service; no raw context words are uploaded.
- Votes are an anonymous community signal, not scholarly verification or an abuse-proof poll. There is no login or robust identity/rate-limit layer; a determined person can reset the per-install token and vote again.
- Votes made while offline are stored locally with their scope and opaque context features, then synchronized after connectivity returns. The queue retains a vote until the Worker acknowledges it. Older queued votes without a scope are treated as general for backward compatibility.
- If the user has not granted Otzaria's `network.access` permission, community controls stay hidden and nothing is sent or queued. Revoking permission removes the community UI.

## Database compatibility

The existing `votes` table remains the general-preference store. All votes created before contextual voting was introduced remain in that table and continue to count as general votes; no historical votes are discarded or silently reclassified. Contextual votes use separate `context_votes` and `context_vote_features` tables created by migration `0002_contextual_votes.sql`.

## Deploy

1. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. The Worker deploys automatically when backend or cross-link source files change on `main`. The deployment workflow applies all D1 migrations before deploying the Worker, rebuilds the exact unique Jastrow/Krupnik cross-links, deploys, and verifies its health endpoint.
3. The current endpoint is `https://otzaria-dictionary-community.dakulefsky.workers.dev`. Both plugin builds allowlist this host.
4. The store release workflow validates, builds, and publishes both plugin packages when changes reach `main`. Users must install the updated builds and grant the optional network permission before community features become available.

The Worker and D1 database are deployed. The plugin integration is optional and degrades to ordinary offline dictionary lookup when network permission is not granted or the service is unavailable. Cloudflare account limits and pricing apply.
