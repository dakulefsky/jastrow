# Unreleased — unified meanings draft

All lookup paths now render the same numbered meaning cards. Exact duplicate glosses and nested synonym lists with at least two shared English terms are consolidated only when the matched Hebrew spellings have compatible vowels and their stem labels agree. Every original gloss and full dictionary entry is retained under the card's numbered source links. Sharing one ambiguous English term alone does not merge different definitions.

Vowel ranking checks explicit alternate headwords as well as primary headings, accepts partially supplied pointing and ignores cantillation. Matching readings appear first; other readings remain available in a collapsed alternatives section. For אַרְעָא, the Krupnik alternate spelling and Jastrow headword agree and their overlapping land/ground lists form one card. The accident reading remains separate. The Hebrew spelling is preserved on each card.

This draft is held for further user additions. The student-unified-results branch runs source and browser tests only; packaging and publication are restricted to main.

# 1.8.1 — Dictionary expressions first

Full multiword headwords and explicit alternate headwords from both bundled dictionaries are indexed with their word boundaries intact: 919 unique phrase spellings (906 Krupnik and 19 Jastrow phrase-to-entry links). This includes technical terms, expressions and names; the count is not a claim that every item is an Aramaic idiom. Abbreviated headwords and grammatical headings are excluded; source references without a safe primary English gloss stay in the original dictionary view. Abbreviated source headwords are not guessed or expanded. Expressions mentioned only inside example prose are not automatically indexed.

Run `python3 build_phrases.py` before `node test_phrases.cjs`; packaging also rebuilds the phrase index and its source audit.

Known expressions take priority over component-word lookup. Within a longer selection, the longest matching expression is grouped before lookup continues with the remaining words. Unlisted combinations retain the word-by-word fallback. The right-click menu label is shortened to Aramaic → Eng.

For a Krupnik phrase entry, the short definition uses the original English spans before a new subentry or verbal-stem block. The complete entry remains in More detail. Thus נפקא מינה displays “the practical difference is”; the following אפק/אתפק definitions do not become meanings of that phrase. The phrase audit preserves exact source spellings and primary source HTML. Four reviewed digitization faults have explicit notes: stray German “sagen”, the misplaced English tag around “hip-joint”, damaged italic markup before “fasces”, and a missing separator before the German rendering of “one after the other”. Original source text is retained in the details. No sentence translations are generated.

# 1.7.0 — Several-word lookup and matching vowels

Paste up to twelve Hebrew/Aramaic words to see a separate dictionary lookup for each. Punctuation and Hebrew maqaf are handled at word boundaries. Unknown tokens remain explicitly unmatched; no sentence translation is generated. Right-click selection is offered for a phrase only when every word has an indexed match. Results, sources and alternatives remain available offline, with per-word expansion.

Pointed queries now prefer an exact pointed headword within the same match tier, before source preference and source-entry length. This is spelling evidence, not a claim about sense frequency or sentence meaning. Unpointed searches keep the existing deterministic order and expose other possible meanings.

# 1.6.2 — Consistent student lookup and store card image

The same typed, selected, recent or reopened word now uses the same default candidate order. Recent words reopen the complete lookup instead of one previously selected entry. A match in the concise dictionary no longer suppresses Jastrow candidates with additional meanings. Exact indexed headwords and explicit alternate headwords remain ahead of linked forms; source preference and entry length break ties, without a frequency claim.

Student headings show the matching Hebrew spelling and remove dictionary Roman/superscript entry numbers. Original headwords, full source text and attribution remain in collapsed details. For צפרא, regression tests check both the morning and bird entries, along with distinct same-spelling entries and repeated/vowelled lookups. The unpointed spelling alone cannot select a meaning for the learner's sentence.

The release workflow now runs the lookup regression in Chromium before publishing. It separately uploads the supplied logo to the store's card-image field; the screenshot gallery and in-plugin logo are different assets. No dictionary source texts were rewritten.

# Aramaic to English Dictionary

The context menu is filtered to single indexed words again. A separate background entrypoint checks selections; it starts on app startup and is kept alive so the next selection does not need to cold-start a WebView. Otzaria must grant background execution, background keep-alive, reader selection events and context-menu access. The visible dictionary identifies missing grants. No always-visible fallback menu item is registered. Rendered/source variants are checked to accommodate reader vowel settings; late responses cannot override newer selection events. Native menu visibility still depends on event delivery completing before a menu snapshot is taken.

Matching entries default to longer original source entries first within match-strength tiers (headwords, source-attested forms, then indexed forms). “Dictionary order” remains available. Plain entry-text length is deterministic and documented in data/ranking-provenance.json. This is a heuristic, not measured word frequency, a commonness probability or a claim about which meaning fits the sentence. No dictionary wording was changed.

## 1.3.4 — reliable selected-word context menu

Jastrow’s context-menu action is now a declarative `contributes.startup.contextMenuItems` item, available without running plugin JavaScript or granting background execution. It supports both normal and page-shape reader selections and opens the plugin on click. The background-registration script and its background/selection-event permissions were removed. Unknown or multiword selections are handled by the existing explicit no-match/single-word messages rather than hiding the menu asynchronously.

Click and manual-selection lookup accept canonical nested selection payloads and legacy text fields. No root inference or new translations were added. The context-menu tests emulate the host’s documented cold-open/boot delivery; actual Otzaria device testing is still needed.

## 1.3.3 — plain dictionary interface

Removed the header tagline, reader-companion slogan and promotional welcome text. The start view contains only dictionary lookup instructions. Added current-theme fallbacks for older Otzaria palettes. Theme-change events use the host’s automatic grant. Preview generation is opt-in with `python3 package.py --preview`; default builds only create plugin/source archives.

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

1. Download `Jastrow-1.3.3.otzplugin`.
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

## 1.5.0 — Krupnik & Silbermann

Adds 15,407 entries with explicitly marked English glosses from Sefaria’s digitization of *A Dictionary of the Talmud*, London, 1927 (Baruch Krupnik and A. M. Silbermann; public-domain edition). Of 20,177 source records, 4,770 without marked English glosses are excluded from this English lookup. English is copied verbatim from the marked column, not machine translated. Binyan labels and sense numbers are retained. Full source wording, including Hebrew, German, examples and qualifications, remains expandable.

Exact headword matches precede linked forms. Within each match type the concise source comes first, followed by Jastrow’s length ordering. No cross-dictionary sense equivalence or new inflection mapping is inferred. Both foreground and background load the supplementary index so the right-click menu also recognizes Krupnik-only headwords.

Rebuild import: `python build_krupnik.py /path/to/lexicon_entry.bson` (requires pymongo). Bundled provenance records the SHA-256 of the original extracted records. Source/reuse statement: https://www.sefaria.org/digitized-by-sefaria. The app remains fully offline; original Jastrow data is unchanged.

## 1.5.1 — Translation first

Removes German from displayed Krupnik source text. English glosses stay verbatim. Main reading view shows translations with brief source labels; match explanations, passage excerpts and per-phrase academic controls are removed. One collapsed “More detail” section retains examples and qualifications. Sorting controls are under Options.

When Krupnik has an exact headword/alternate-headword entry, only that source is shown initially. Check Jastrow explicitly expands the search. Otherwise normal Jastrow form lookup remains available. No inflected form is assigned to Krupnik by guesswork.

## 1.5.2 — Plugin name

Renamed the store name, tool tab, page heading, browser title, context-menu item and instructions to Aramaic to English Dictionary. Existing plugin ID, selection item ID and preferences stay stable so updates retain compatibility. Dictionary authors remain credited as sources.

Otzaria enforces a 14-character plugin/tab name. The store/tab label is Aramaic → Eng.; the full title Aramaic to English Dictionary appears in the page and context menu.

## 1.6.0 — One translation flow

Confirmed lookups show meanings directly, including ambiguous headwords, without choosing a dictionary or entry. Krupnik exact matches are preferred and Jastrow remains the fallback. Sources move into expandable details; no source chooser or dictionary browsing controls in the reading view. Multiple possible meanings remain explicitly labeled, with headword/form context preserved. Spelling suggestions still require an explicit choice and are never presented as confirmed translations.
## 1.6.1 — Dictionary emblem

Adds the supplied gold translation emblem to the lookup header and store artwork. Removes the descriptive eyebrow line; the plugin and page keep the concise name “Aramaic to English Dictionary.” The Otzaria tab retains its short supported label. Lookup data and dictionary attribution are unchanged.
