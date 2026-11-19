import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sefaria_word_alignment import (
    iter_parallel_segments,
    normalize_source_word,
    tokenize_english,
    tokenize_source,
    train_model,
    write_model,
)


class WordAlignmentTests(unittest.TestCase):
    def test_normalizes_vocalized_and_final_letters(self):
        self.assertEqual(normalize_source_word("אָמַר"), "אמר")
        self.assertEqual(normalize_source_word("מַלְכָּה"), "מלכה")
        self.assertEqual(tokenize_source("אָמַר רַב"), ["אמר", "רב"])
        self.assertEqual(tokenize_english("He said, “Rav’s law.”"), ["he", "said", "rav's", "law"])

    def test_reads_paired_generated_tractate_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = Path(directory)
            (corpus / "texts").mkdir()
            en = {"text": [[], ["Rav said the law."]]}
            he = {"text": [[], ["אָמַר רַב דִּינָא"]]}
            slug = "berakhot"
            asset = (
                "(function(root){"
                "root.SefariaOfflineTranslationData=root.SefariaOfflineTranslationData||{};"
                "root.SefariaOfflineSourceData=root.SefariaOfflineSourceData||{};"
                + f"root.SefariaOfflineTranslationData[{json.dumps(slug)}]=" + json.dumps(en, ensure_ascii=False) + ";"
                + f"root.SefariaOfflineSourceData[{json.dumps(slug)}]=" + json.dumps(he, ensure_ascii=False) + ";"
                + "})(typeof window==='undefined'?globalThis:window);"
            )
            (corpus / "texts" / "berakhot.js").write_text(asset, encoding="utf-8")
            pairs = list(iter_parallel_segments(corpus))
            self.assertEqual(len(pairs), 1)
            self.assertEqual(pairs[0][0], "berakhot")
            self.assertIn("אמר", pairs[0][1])
            self.assertIn("said", pairs[0][2])

    def test_stratified_sampling_caps_each_tractate(self):
        pairs = []
        for tractate in ("a", "b", "c", "d"):
            for index in range(10):
                pairs.append((tractate, ["אמר", tractate], ["said", tractate]))
        model = train_model(
            pairs,
            iterations=2,
            min_source_count=1,
            max_training_pairs=8,
            tractate_count=4,
        )
        self.assertEqual(model["candidatePairs"], 40)
        self.assertEqual(model["trainingPairs"], 8)
        self.assertEqual(model["sampledTractates"], 4)
        self.assertEqual(model["maxPairsPerTractate"], 2)

    def test_trains_probabilities_and_writes_offline_asset(self):
        pairs = []
        examples = [
            (["אמר", "רב"], ["rav", "said"]),
            (["אמר", "רבי"], ["rabbi", "said"]),
            (["פתח", "רב"], ["rav", "opened"]),
            (["שמע", "רב"], ["rav", "heard"]),
        ]
        for _ in range(8):
            pairs.extend(examples)
        model = train_model(pairs, iterations=6, min_source_count=1, top_k=8)
        self.assertEqual(model["trainingPairs"], 32)
        self.assertIn("אמר", model["links"])
        translations = {item["word"]: item["probability"] for item in model["links"]["אמר"]}
        self.assertIn("said", translations)
        self.assertGreater(translations["said"], translations.get("opened", 0))
        self.assertTrue(model["nullLinks"])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "word-alignments.js"
            write_model(model, output)
            content = output.read_text(encoding="utf-8")
            self.assertIn("SefariaOfflineWordAlignment", content)
            self.assertIn('"said"', content)


if __name__ == "__main__":
    unittest.main()
