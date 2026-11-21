import importlib.util, json, tempfile, unittest, zipfile
from pathlib import Path

MODULE = Path(__file__).with_name("build_sefaria_bavli_hebrew_corpus.py")
spec = importlib.util.spec_from_file_location("hebrew_corpus", MODULE)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class HebrewCorpusBuilderTests(unittest.TestCase):
    def setUp(self):
        cats = ["Talmud", "Bavli", "Commentary"]
        self.index = {"books": [
            {"title":"Berakhot","language":"English","versionTitle":builder.ENGLISH_EDITION,"categories":["Talmud","Bavli"],"json_url":"english.json"},
            {"title":"Steinsaltz on Berakhot","language":"Hebrew","versionTitle":builder.EDITION,"categories":cats,"json_url":"hebrew.json"},
            {"title":"Steinsaltz on Berakhot","language":"English","versionTitle":builder.EDITION,"categories":cats,"json_url":"wrong-language.json"},
            {"title":"Steinsaltz on Shabbat","language":"Hebrew","versionTitle":builder.EDITION,"categories":cats,"json_url":"extra.json"},
        ]}
    def test_selects_only_matching_hebrew_edition(self):
        selected, expected = builder.selected_entries(self.index["books"])
        self.assertEqual(expected, {"Berakhot"})
        self.assertEqual([x["tractateTitle"] for x in selected], ["Berakhot"])
    def test_archive_contains_hebrew_and_attribution(self):
        data = {"versionTitle":builder.EDITION,"language":"he","license":"CC-BY-NC",
                "heTitle":"ברכות","text":[["הגמרא המתורגמת"],["עמוד ב"]]}
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/"hebrew.zip"
            manifest=builder.build_archive(self.index,output,lambda url:data)
            self.assertEqual(manifest["language"],"Hebrew")
            self.assertEqual(manifest["edition"],builder.EDITION)
            self.assertEqual(manifest["tractateCount"],1)
            with zipfile.ZipFile(output) as archive:
                self.assertIn("William Davidson Edition - Hebrew",archive.read("ATTRIBUTION.txt").decode())
                text_file=archive.read("texts/berakhot.js").decode()
                self.assertIn("הגמרא המתורגמת",text_file)
                self.assertNotIn("English Edition",text_file)
    def test_refuses_unlicensed_hebrew_text(self):
        data={"versionTitle":builder.EDITION,"language":"he","license":"unknown","text":[["טקסט"]]}
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError,"not cleared"):
                builder.build_archive(self.index,Path(temp)/"bad.zip",lambda url:data)

if __name__=="__main__": unittest.main()
