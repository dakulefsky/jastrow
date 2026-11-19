#!/usr/bin/env python3
"""Train a compact Aramaic-to-English lexical alignment model from paired Bavli segments.

This is a statistical alignment aid, not a generated dictionary or a guarantee
that every source word has a one-to-one English equivalent. It uses only
same-index source/translation segments whose segment counts match.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

HEBREW_FINALS = str.maketrans("ךםןףץ", "כמנפצ")
HEBREW_TOKEN = re.compile(r"[\u05d0-\u05ea\u0591-\u05c7]+")
ENGLISH_TOKEN = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*")
NULL_TOKEN = "__NULL__"


def normalize_source_word(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    letters = "".join(
        char for char in decomposed
        if "\u05d0" <= char <= "\u05ea"
    )
    return letters.translate(HEBREW_FINALS)


def tokenize_source(text: str) -> list[str]:
    return [token for raw in HEBREW_TOKEN.findall(text or "") if (token := normalize_source_word(raw))]


def tokenize_english(text: str) -> list[str]:
    return [token.casefold().replace("’", "'").replace("–", "-") for token in ENGLISH_TOKEN.findall(text or "")]


def parse_tractate_js(path: Path) -> tuple[dict, dict]:
    """Read the paired JSON objects from the generated JS asset without eval."""
    source = path.read_text(encoding="utf-8")
    slug = path.stem
    decoder = json.JSONDecoder()
    translation_marker = f"root.SefariaOfflineTranslationData[{json.dumps(slug)}]="
    source_marker = f"root.SefariaOfflineSourceData[{json.dumps(slug)}]="
    translation_at = source.find(translation_marker)
    source_at = source.find(source_marker)
    if translation_at < 0 or source_at < 0:
        raise ValueError(f"{path.name}: missing paired translation/source assignments")
    translation_start = translation_at + len(translation_marker)
    source_start = source_at + len(source_marker)
    translation, _ = decoder.raw_decode(source[translation_start:])
    aramaic, _ = decoder.raw_decode(source[source_start:])
    return translation, aramaic


def side_slots(data: dict, index: int) -> list[str]:
    text = data.get("text", [])
    side = text[index] if isinstance(text, list) and index < len(text) else None
    if isinstance(side, list):
        return [value if isinstance(value, str) else "" for value in side]
    return [side] if isinstance(side, str) else []


def iter_parallel_segments(corpus: Path) -> Iterable[tuple[list[str], list[str]]]:
    for path in sorted((corpus / "texts").glob("*.js")):
        translation, source = parse_tractate_js(path)
        en_pages = translation.get("text", [])
        ar_pages = source.get("text", [])
        for page_index in range(max(len(en_pages), len(ar_pages))):
            en_slots = side_slots(translation, page_index)
            ar_slots = side_slots(source, page_index)
            if len(en_slots) != len(ar_slots):
                continue
            for aramaic, english in zip(ar_slots, en_slots):
                source_tokens = tokenize_source(aramaic)
                target_tokens = tokenize_english(english)
                if source_tokens and target_tokens:
                    yield source_tokens, target_tokens


def train_model(
    pairs: Iterable[tuple[list[str], list[str]]],
    *,
    iterations: int = 4,
    min_source_count: int = 3,
    top_k: int = 16,
) -> dict:
    sentences = []
    source_frequency: Counter[str] = Counter()
    english_frequency: Counter[str] = Counter()
    cooccurrence: dict[str, set[str]] = defaultdict(set)
    pair_count = 0

    for source_tokens, target_tokens in pairs:
        source_counts = Counter(source_tokens)
        source_counts[NULL_TOKEN] = 1
        target_counts = Counter(target_tokens)
        if not source_tokens or not target_tokens:
            continue
        sentences.append((source_counts, target_counts))
        source_frequency.update(source_tokens)
        english_frequency.update(target_tokens)
        for source_word in source_counts:
            cooccurrence[source_word].update(target_counts.keys())
        pair_count += 1

    if not sentences:
        raise ValueError("No same-index Aramaic/English segment pairs were available")

    # IBM Model 1: p(English token | Aramaic token), with a NULL source token.
    probabilities = {
        source_word: {target_word: 1.0 / max(1, len(target_words))
                      for target_word in sorted(target_words)}
        for source_word, target_words in sorted(cooccurrence.items())
    }

    for _ in range(max(1, iterations)):
        expected: dict[str, Counter[str]] = defaultdict(Counter)
        totals: Counter[str] = Counter()
        for source_counts, target_counts in sentences:
            for target_word, target_count in target_counts.items():
                denominator = sum(
                    probabilities.get(source_word, {}).get(target_word, 0.0) * count
                    for source_word, count in source_counts.items()
                )
                if denominator <= 0:
                    continue
                for source_word, source_count in source_counts.items():
                    probability = probabilities.get(source_word, {}).get(target_word, 0.0)
                    if probability <= 0:
                        continue
                    contribution = target_count * probability * source_count / denominator
                    expected[source_word][target_word] += contribution
                    totals[source_word] += contribution
        probabilities = {
            source_word: {
                target_word: count / totals[source_word]
                for target_word, count in counts.items()
            }
            for source_word, counts in expected.items()
            if totals[source_word] > 0
        }

    links = {}
    for source_word, translations in probabilities.items():
        if source_word == NULL_TOKEN or source_frequency[source_word] < min_source_count:
            continue
        ranked = sorted(translations.items(), key=lambda item: item[1], reverse=True)[:top_k]
        if ranked:
            links[source_word] = [
                {"word": target_word, "probability": round(probability, 6)}
                for target_word, probability in ranked
            ]

    null_links = [
        {"word": target_word, "probability": round(probability, 6)}
        for target_word, probability in sorted(
            probabilities.get(NULL_TOKEN, {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )[:top_k]
    ]
    return {
        "formatVersion": 1,
        "method": "IBM Model 1 lexical alignment; same-index segment pairs only",
        "license": "CC-BY-NC",
        "attribution": "William Davidson Edition - English, translated by Rabbi Adin Even-Israel Steinsaltz, and William Davidson Edition Aramaic source texts; Koren Publishers; accessed through Sefaria. Non-commercial use only.",
        "iterations": max(1, iterations),
        "trainingPairs": pair_count,
        "sourceVocabulary": len(source_frequency),
        "englishVocabulary": len(english_frequency),
        "sourceWords": len(links),
        "nullLinks": null_links,
        "links": links,
    }


def write_model(model: dict, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(model, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    output.write_text(
        "(function(root){root.SefariaOfflineWordAlignment=" + payload
        + ";})(typeof window==='undefined'?globalThis:window);\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--iterations", type=int, default=4)
    parser.add_argument("--min-source-count", type=int, default=3)
    parser.add_argument("--top-k", type=int, default=16)
    args = parser.parse_args()
    model = train_model(
        iter_parallel_segments(args.corpus),
        iterations=args.iterations,
        min_source_count=args.min_source_count,
        top_k=args.top_k,
    )
    write_model(model, args.output)
    print(
        "Trained lexical alignment model: "
        f"{model['trainingPairs']:,} segment pairs, "
        f"{model['sourceWords']:,} Aramaic word forms, "
        f"{model['englishVocabulary']:,} English tokens, "
        f"{args.iterations} iterations, {args.output.stat().st_size:,} bytes."
    )


if __name__ == "__main__":
    main()
