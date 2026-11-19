import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from build_sefaria_bavli_corpus import (
    EDITION,
    SOURCE_EDITION,
    build_archive,
    normalize_license,
    selected_bavli_entries,
    selected_bavli_pairs,
)


class BavliCorpusBuilderTests(unittest.TestCase):
    def setUp(self):
        self.match = {
            "title": "Shabbat",
            "language": "English",
            "versionTitle": EDITION,
            "categories": ["Talmud", "Bavli", "Seder Moed"],
            "json_url": "https://example.test/shabbat-en.json",
        }
        self.source = {
            "title": "Shabbat",
            "language": "Hebrew",
            "versionTitle": SOURCE_EDITION,
            "categories": ["Talmud", "Bavli", "Seder Moed"],
            "json_url": "https://example.test/shabbat-he.json",
        }

    def test_selects_and_pairs_matching_william_davidson_editions(self):
        entries = [
            self.match,
            {**self.match, "title": "Introductions to the Babylonian Talmud"},
            {**self.match, "title": "Mishnah Shabbat", "categories": ["Mishnah"]},
            self.source,
            {**self.match, "title": "Other edition", "versionTitle": "Other"},
        ]
        self.assertEqual([x["title"] for x in selected_bavli_entries(entries)], ["Shabbat"])
        self.assertEqual(selected_bavli_pairs(entries), [(self.match, self.source)])

    def test_license_normalization(self):
        self.assertEqual(normalize_license("  CC-BY-NC  "), "CC-BY-NC")
        self.assertEqual(normalize_license("CC   BY-NC"), "CC BY-NC")

    def test_builds_archive_with_attribution_and_both_languages(self):
        english = {
            "title": "Shabbat",
            "versionTitle": EDITION,
            "language": "en",
            "license": "CC-BY-NC",
            "text": [["The discussion continues."], ["Another passage."]],
        }
        aramaic = {
            "title": "Shabbat",
            "versionTitle": SOURCE_EDITION,
            "language": "he",
            "license": "CC-BY-NC",
            "text": [["הדיון נמשך."], ["סוגיה אחרת."]],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "corpus.zip"
            manifest = build_archive(
                {"books": [self.match, self.source]},
                output,
                lambda url: english if url.endswith("-en.json") else aramaic,
            )
            self.assertEqual(manifest["tractateCount"], 1)
            self.assertEqual(manifest["tractates"][0]["license"], "CC-BY-NC")
            self.assertEqual(manifest["tractates"][0]["sourceLicense"], "CC-BY-NC")
            self.assertEqual(manifest["tractates"][0]["sourceVersionTitle"], SOURCE_EDITION)
            self.assertEqual(manifest["tractates"][0]["slug"], "shabbat")
            self.assertEqual(manifest["tractates"][0]["file"], "texts/shabbat.js")
            with zipfile.ZipFile(output) as archive:
                self.assertIn("ATTRIBUTION.txt", archive.namelist())
                self.assertIn("manifest.js", archive.namelist())
                self.assertIn("texts/shabbat.js", archive.namelist())
                stored = archive.read("texts/shabbat.js").decode("utf-8")
                self.assertIn('SefariaOfflineTranslationData["shabbat"]', stored)
                self.assertIn('SefariaOfflineSourceData["shabbat"]', stored)
                self.assertIn('"The discussion continues."', stored)
                self.assertIn("הדיון נמשך", stored)
                self.assertIn("CC BY-NC", archive.read("ATTRIBUTION.txt").decode("utf-8"))

    def test_refuses_unlicensed_aramaic_source(self):
        english = {"versionTitle": EDITION, "license": "CC-BY-NC", "text": [["Some text"]]}
        aramaic = {"versionTitle": SOURCE_EDITION, "license": "unknown", "text": [["טקסט"]]}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "corpus.zip"
            with self.assertRaisesRegex(RuntimeError, "unsupported or missing Aramaic source license"):
                build_archive(
                    {"books": [self.match, self.source]},
                    output,
                    lambda url: english if url.endswith("-en.json") else aramaic,
                )
            self.assertFalse(output.exists())

    def test_refuses_unpaired_tractate(self):
        with self.assertRaisesRegex(RuntimeError, "matching .* source text is missing"):
            selected_bavli_pairs([self.match])


if __name__ == "__main__":
    unittest.main()
