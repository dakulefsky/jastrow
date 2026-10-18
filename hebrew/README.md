# מילון ארמי־עברי — 1.0.1

Separate offline Otzaria release candidate; author DanTheMan. Does not replace the English dictionary and contains no Jastrow data.

20,177 Krupnik–Silbermann source records from the Sefaria export already used in the English project. Original source.json is included. The build removes only explicitly marked multilingual spans; Hebrew wording is retained. A concise answer is the original prefix before the first multilingual span. Otherwise the full Hebrew sense is displayed. Original examples and references remain in a closed dropdown. Exact identical senses are combined within a headword and grammatical label. Distinct senses remain separate.

Supports original headwords, supplied aliases and exact multiword headwords, with pointed matches ranked first. No generated translations, inferred inflections, sentence translation or semantic guessing. Some original entries refer elsewhere or provide discussion rather than a short definition. This edition has not yet had an entry-by-entry editorial audit.

Build: python3 build.py. Tests: node test.cjs; node test_host.cjs. Browser tests: npm install; npx playwright install chromium; node test_browser.cjs. Otzaria context menu and theme integration still require testing in the host app; this package is not published to the store.

Digitization: Sefaria. Source edition: Krupnik & Silbermann, A Dictionary of the Talmud, the Midrash and the Targum, London 1927. Public domain provenance retained in plugin/provenance.json. Extracted Hebrew is not a new translation.

Release checks completed: data assertions and simulated interface/host tests passed. JavaScript syntax passed. Browser installation failed in the build environment; visual and real Otzaria integration validation remain open. Version 1.0.1 labels the packaged candidate and is not a claim those checks passed.

The source contains 20,177 records, including abbreviations, Hebrew words, names and cross-references; this is not a claim of 20,177 distinct Aramaic translations. Partial pointing is compared letter by letter; source order remains deterministic for unpointed ambiguity. No frequency estimates are claimed.

1.0.1: Reused English dictionary stylesheet and component structure for masthead, help dropdown, search panel, offline indicator, numbered meaning cards and reading-size controls. Hebrew RTL adaptations and host theme tokens retained. Font-size preference persists locally. Hebrew source-only content unchanged. Simulated UI checks cover font size and help controls.

Quick lookup: right-click now requests a host-native clickable message containing the first two distinct meanings; tap opens the full dictionary through ui.messageClicked and its dictionaryWord payload. Separate direct-open menu remains available. Requires ui.feedback permission and background execution. Uses documented ui.showMessage/tapOpenPlugin API (Otzaria >=0.9.97). Host owns placement and six-second default timeout; this is not a custom reader popover and does not implement Escape/outside-click dismissal. Verified against dev API_REFERENCE.md and lib/core/ui_snack.dart on 2026-10-18; actual host visual validation remains pending. No automatic store publication performed for this change.
