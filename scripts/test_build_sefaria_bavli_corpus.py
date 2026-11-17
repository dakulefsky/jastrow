import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from build_sefaria_bavli_corpus import (
    EDITION,
    build_archive,
    normalize_license,
    selected_bavli_entries,
)


class BavliCorpusBuilderTests(unittest.TestCase):
    def setUp(self):
        self.match = {
            "title": "Shabbat",
            "language": "English",
            "versionTitle": EDITION,
            "categories": ["Talmud", "Bavli", "Seder Moed"],
            "json_url": "https://example.test/shabbat.json",
        }

    def test_selects_only_english_william_davidson_bavli(self):
        entries = [
            self.match,
            {**self.match, "title": "Mishnah Shabbat", "categories": ["Mishnah"]},
            {**self.match, "title": "Hebrew Shabbat", "language": "Hebrew"},
            {**self.match, "title": "Other edition", "versionTitle": "Other"},
        ]
        self.assertEqual([x["title"] for x in selected_bavli_entries(entries)], ["Shabbat"])

    def test_license_normalization(self):
        self.assertEqual(normalize_license("  CC-BY-NC  "), "CC-BY-NC")
        self.assertEqual(normalize_license("CC   BY-NC"), "CC BY-NC")

    def test_builds_archive_with_attribution_and_source_metadata(self):
        data = {
            "title": "Shabbat",
            "versionTitle": EDITION,
            "language": "en",
            "license": "CC-BY-NC",
            "text": [["The discussion continues."], ["Another passage."]],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "corpus.zip"
            manifest = build_archive({"books": [self.match]}, output, lambda url: data)
            self.assertEqual(manifest["tractateCount"], 1)
            self.assertEqual(manifest["tractates"][0]["license"], "CC-BY-NC")
            self.assertEqual(manifest["tractates"][0]["slug"], "shabbat")
            self.assertEqual(manifest["tractates"][0]["file"], "texts/shabbat.js")
            with zipfile.ZipFile(output) as archive:
                self.assertIn("ATTRIBUTION.txt", archive.namelist())
                self.assertIn("manifest.js", archive.namelist())
                self.assertIn("texts/shabbat.js", archive.namelist())
                stored = archive.read("texts/shabbat.js").decode("utf-8")
                self.assertIn('SefariaOfflineTranslationData["shabbat"]', stored)
                self.assertIn('"The discussion continues."', stored)

    def test_refuses_unknown_license_or_incomplete_corpus(self):
        data = {
            "versionTitle": EDITION,
            "license": "unknown",
            "text": [["Some text"]],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "corpus.zip"
            with self.assertRaisesRegex(RuntimeError, "unsupported or missing license"):
                build_archive({"books": [self.match]}, output, lambda url: data)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
