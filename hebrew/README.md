# מילון ארמי־עברי — 1.2.5 (מועמד לעדכון)

Separate offline Otzaria release candidate; author DanTheMan. Does not replace the English dictionary and contains no Jastrow data.

20,177 Krupnik–Silbermann source records from the Sefaria export already used in the English project. Original source.json is included. The build removes only explicitly marked multilingual spans; Hebrew wording is retained. A concise answer is the original prefix before the first multilingual span. Otherwise the full Hebrew sense is displayed. Original examples and references remain in a closed dropdown. Exact identical senses are combined within a headword and grammatical label. Distinct senses remain separate.

Supports original headwords, supplied aliases and exact multiword headwords, with pointed matches ranked first. A conservative lookup fallback can recognize selected attached prefixes and endings when the full form is not indexed; it points back to the original dictionary entry and labels the possible base form. It does not add dictionary entries or generated meanings. No generated translations, sentence translation or semantic guessing. Some original entries refer elsewhere or provide discussion rather than a short definition. This edition has not yet had an entry-by-entry editorial audit.

Build: python3 build.py. Tests: node test.cjs; node test_host.cjs. Browser tests: npm install; npx playwright install chromium; node test_browser.cjs. Otzaria context menu and theme integration still require testing in the host app; this package is not published to the store.

Digitization: Sefaria. Source edition: Krupnik & Silbermann, A Dictionary of the Talmud, the Midrash and the Targum, London 1927. Public domain provenance retained in plugin/provenance.json. Extracted Hebrew is not a new translation.

Store status: version 1.2.3 was published and approved in Otzaria on 15 November 2026. Version 1.2.5 is the candidate in PR #12 and is not in the Store yet. The latest PR validation runs the source-data, host-simulation and Chromium browser suites; the actual native Otzaria menu and permission screens still need confirmation in the installed app.

The source contains 20,177 records, including abbreviations, Hebrew words, names and cross-references; this is not a claim of 20,177 distinct Aramaic translations. Partial pointing is compared letter by letter; source order remains deterministic for unpointed ambiguity. No frequency estimates are claimed.

1.2.x: Hebrew RTL layout, source details, search history, reading-size controls, and right-click quick lookup are maintained separately from the English dictionary. Optional community voting is shown only while the host grants network access; if access is denied, the plugin remains a normal offline dictionary with no community controls. During temporary outages, votes remain queued locally and are retried when the connection returns. The shared service does not add or rewrite Hebrew dictionary content.

Quick lookup: right-click now requests a host-native clickable message containing the first two distinct meanings; tap opens the full dictionary through ui.messageClicked and its dictionaryWord payload. Separate direct-open menu remains available. Requires ui.feedback permission and background execution. Uses documented ui.showMessage/tapOpenPlugin API (Otzaria >=0.9.97). Host owns placement and six-second default timeout; this is not a custom reader popover and does not implement Escape/outside-click dismissal. Verified against dev API_REFERENCE.md and lib/core/ui_snack.dart on 2026-10-18; actual host visual validation remains pending. No automatic store publication performed for this change.
