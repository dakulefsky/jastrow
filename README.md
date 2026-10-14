# Jastrow for Otzaria — offline dictionary

## Install

1. Download `Jastrow-1.1.0.otzplugin`.
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
- Not every inflected form is present in the source index. For example, תניא and איתמר are not indexed in this snapshot. Try the dictionary root/headword when necessary.
- Context-menu lookup is for selectable text books. Scanned PDFs need text selection/OCR support from Otzaria and are not included in this integration.
- No network calls, API keys, accounts, or AI translation services. No external fonts.

## Validation

The package passes Otzaria's official plugin validator against its live SDK specification. Search, loading, cross-reference navigation, mobile layout, and simulated Otzaria SDK events are tested locally. Actual installation in the native Otzaria application remains to be confirmed on your device. Version 1.0.0 is marked beta for that reason.

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
