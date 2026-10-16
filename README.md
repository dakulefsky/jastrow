## 1.3.1

Removed the suggested-word starter section. Source attribution remains in the visible footer, help panel, bundled data/provenance.json and source archive LICENSE. Plugin author remains separately identified in manifest.json.

# Student reading update — 1.3.0

- Match lists show up to two verbatim Jastrow phrase previews, with separate labels for headwords, indexed forms, source-attested forms and spelling suggestions. Preview text may be visually clipped; full accessible text is retained.
- A selected-word → headword panel explains what the match means. It does not claim a root analysis or choose a meaning for the Gemara sentence.
- Numbered meaning cards quote the existing conservative phrase extractor in source order. Six appear initially; additional phrases can be expanded. Jastrow’s form and section labels remain visible when supplied by the source.
- Each card can expand the complete corresponding source sense, including examples and parenthetical qualifications. The full academic entry remains in its dropdown.
- “Your word in Jastrow’s text” offers up to three original excerpts around literal Hebrew tokens matching the lookup after vowel normalization. Ellipses mark truncation. No prefix stripping or inferred translations are used.
- Optional local recent lookups (12 maximum, clearable), six reading sizes from 90% to 140%, / to focus search, arrow-key match navigation and a clear-search button.
- Back/Forward restore the original lookup word as well as the entry, keeping match labels and lists consistent. Loading failures show an in-place retry action.

No dictionary entries or imported form mappings were changed. All 32,512 entries are still bundled offline. The extracted phrases are a reading aid and may omit additional meanings; they are not contextual translation decisions. Actual Otzaria host testing remains outstanding; connector behavior is covered by mocked browser tests.

Validation: `python3 package.py`, then `node test_search.cjs`, `node test_context.cjs`, `node test_ui.cjs`, `node test_reading.cjs`, `node test_student.cjs`, and `node audit_reading.cjs`. `test_student.cjs` checks source-exact previews/context, word-form explanations, history, recent lookups, keyboard access, sizing, collapsed long entries, selected-word excerpts, narrow layouts and denied storage.

## Version 1.2.1

“Read in context” now opens the exact originating sense when a definition phrase repeats under different verb forms. The displayed wording remains verbatim Jastrow. Run `node test_reading.cjs` for the repeated-phrase regression.

# Jastrow for Otzaria — offline dictionary

## Version 1.2.0

The standalone preview runs the packaged application with all dictionary chunks embedded. Quick meanings remain verbatim source phrases; each has a “Read in context” control opening the complete scholarly entry. Academic detail stays in its dropdown. This extraction is a reading aid, not a new translation or a claim that an isolated phrase explains every sense.

Two source-attested supplemental form links, תניא and תנן, carry Jastrow’s exact explanatory note and are validated at build time. They do not alter the 64,410 imported base-index forms or introduce new English definitions. Entry history and reloadable entry links are included. Failed or empty chunk loads can be retried. Invalid mixed-script queries are rejected consistently by lookup and the context-menu availability check. The theme now controls definition colors and typography.

Run `node test_search.cjs`, `node test_context.cjs`, and `node test_ui.cjs` after `python3 package.py`. Browser tests require Playwright and Chromium; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if needed. `node audit_reading.cjs` checks all extracted phrases against their source entry and classifies dictionary cross-reference resolution; it does not certify semantic interpretation.

## Install

1. Download `Jastrow-1.3.1.otzplugin`.
2. In Otzaria open **כלים → תוספים → התקן תוסף חדש** (Tools → Plugins → Install new plugin).
3. Select the downloaded file and approve the reader/context-menu permissions.
4. Open **Jastrow** from the tools panel, or select a word in a text sefer and choose **Jastrow — English** from its context menu.

Requires Otzaria 0.9.97 or newer with plugin support. If your browser renames the package `.zip`, restore the `.otzplugin` extension before installing.

## Features and limits

- All 32,512 Jastrow entries from Sefaria's October 13, 2026 database snapshot.
- Offline lookup of headwords, alternate spellings, plurals, and 64,410 normalized indexed word forms.
- Search ignores vowels and cantillation. It retains distinctions between consonants.
- Multiple matches are offered for selection, not interpreted as a context-specific translation.
- No exact match: offers headwords beginning with the entered spelling. It does not invent roots or definitions.
- Original English definitions, grammatical labels, abbreviations, and examples are preserved.
- Dictionary cross-references work offline. Text-source citations display as text; they do not open passages.
- Not every inflected form is present in the source index. For example, איתמר is not indexed in this snapshot. תניא and תנן now have two explicitly documented supplemental links to Jastrow’s תְּנֵי entry, where he discusses them verbatim. Try the dictionary root/headword when necessary.
- Context-menu lookup is for selectable text books. Scanned PDFs need text selection/OCR support from Otzaria and are not included in this integration.
- No network calls, API keys, accounts, or AI translation services. No external fonts.

## Validation

The package passes Otzaria's official plugin validator against its live SDK specification. Search, loading, cross-reference navigation, mobile layout, and simulated Otzaria SDK events are tested locally. Actual installation in the native Otzaria application remains to be confirmed on your device. Version 1.2.0 is marked beta for that reason.

## Data and licensing

Marcus Jastrow, *A Dictionary of the Targumim, the Talmud Babli and Yerushalmi, and the Midrashic Literature*, London, Luzac, 1903. Digitized by Sefaria. Sefaria identifies this edition as Public Domain:
https://www.sefaria.org/Jastrow

Only Jastrow dictionary content is extracted; other lexicons from Sefaria's database are excluded. Source and SHA-256 hashes of the three input BSON collections are in `plugin/data/provenance.json`.

The plugin source code is licensed under MIT; this does not change the status of the dictionary data.

## Rebuild

Extract `lexicon.bson`, `lexicon_entry.bson`, and `word_form.bson` from Sefaria's database backup into one directory. Install `pymongo`, then run:

```sh
python build_data.py /path/to/bson-directory
python package.py
```

The source archive contains the generated offline data, so normal use and repackaging do not require a database download.

## Conditional right-click lookup (1.0.1)

Enable background execution and selection-event access in Otzaria’s plugin permissions. Select one word, then right-click: Jastrow — English is registered only for an actual headword or indexed word-form match, including words with nekudos. Suggestions do not qualify. The same action supports both text reader layouts. English controls and definitions are retained.

Otzaria delivers selection events asynchronously. Opening the menu immediately after selecting a word, especially while the background engine is starting, may precede registration; close and reopen it. Its host filter uses substring matching, so a stale item may briefly appear for a larger selection containing the previous matched word until the latest selection event is processed. The plugin cannot guarantee synchronous exact-match filtering at menu construction with the current SDK. Native testing is still required.

## Reading view (1.0.2)

Explicit italicized definition phrases are shown first, with associated verb-form labels where available. This is a conservative, incomplete excerpt, not an AI summary or a complete inventory of senses. The unmodified entry remains in an expandable section. Entries without extractable phrases open the full entry automatically.

## Reading desk (1.1.0)

The refreshed interface puts one-word search, right-click guidance, matching headwords, and the selected definition into a clearer reading layout. The offline dictionary data and exact-match policy are unchanged. Context-menu lookup is verified against Otzaria's current SDK contract and simulated selection events; final confirmation still requires installing it in the native app.
