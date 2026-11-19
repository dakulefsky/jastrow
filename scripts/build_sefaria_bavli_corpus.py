#!/usr/bin/env python3
"""Build a compact paired offline corpus of the William Davidson Bavli.

The source export licenses each version separately. This builder refuses to
package the corpus unless every selected tractate explicitly declares CC-BY-NC.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

INDEX_URL = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json"
EDITION = "William Davidson Edition - English"
SOURCE_EDITION = "William Davidson Edition - Vocalized Aramaic"
ALTERNATE_SOURCE_EDITION = "William Davidson Edition - Aramaic"
SOURCE_LANGUAGE = "Hebrew"
SOURCE_EDITION_OVERRIDES = {"Chullin": ALTERNATE_SOURCE_EDITION, "Menachot": ALTERNATE_SOURCE_EDITION}
ALLOWED_LICENSES = {"CC-BY-NC", "CC BY-NC"}
NON_TRACTATE_TITLES = {"Introductions to the Babylonian Talmud"}
ATTRIBUTION = (
    "William Davidson Edition - English, translated by Rabbi Adin Even-Israel "
    "Steinsaltz; and the William Davidson Edition Aramaic source texts, "
    "Koren Publishers; digital texts accessed through Sefaria. The Vocalized "
    "Aramaic edition is used where its license is CC BY-NC; Chullin and Menachot "
    "use the separately licensed William Davidson Edition - Aramaic. Both "
    "versions are included only after independent CC BY-NC verification. "
    "Non-commercial use only. Preserve this attribution and each source/version "
    "license with every redistributed copy."
)


def selected_bavli_entries(
    entries: list[dict[str, Any]],
    language: str = "English",
    version_title: str = EDITION,
) -> list[dict[str, Any]]:
    selected = []
    for item in entries:
        categories = {str(value).strip().casefold() for value in item.get("categories", [])}
        if (
            str(item.get("language", "")).casefold() == language.casefold()
            and str(item.get("versionTitle", "")).strip() == version_title
            and "talmud" in categories
            and "bavli" in categories
            and str(item.get("title", "")).strip() not in NON_TRACTATE_TITLES
            and item.get("json_url")
        ):
            selected.append(item)
    return sorted(selected, key=lambda item: str(item.get("title", "")).casefold())


def selected_bavli_pairs(entries: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair English translations with the matching William Davidson Aramaic text."""
    english = selected_bavli_entries(entries)
    preferred = selected_bavli_entries(entries, SOURCE_LANGUAGE, SOURCE_EDITION)
    alternate = selected_bavli_entries(entries, SOURCE_LANGUAGE, ALTERNATE_SOURCE_EDITION)
    preferred_by_title = {str(item.get("title", "")).strip().casefold(): item for item in preferred}
    alternate_by_title = {str(item.get("title", "")).strip().casefold(): item for item in alternate}
    pairs = []
    failures = []
    for translated in english:
        title = str(translated.get("title", "")).strip()
        expected_edition = SOURCE_EDITION_OVERRIDES.get(title, SOURCE_EDITION)
        source_map = alternate_by_title if expected_edition == ALTERNATE_SOURCE_EDITION else preferred_by_title
        source = source_map.get(title.casefold())
        if source is None:
            failures.append(f"{title}: matching {expected_edition} source text is missing")
            continue
        if tuple(translated.get("categories", [])) != tuple(source.get("categories", [])):
            failures.append(f"{title}: English and Aramaic category paths do not match")
            continue
        pairs.append((translated, source))
    if failures:
        raise RuntimeError("The bilingual Bavli corpus is incomplete: " + "; ".join(failures))
    return pairs


def normalize_license(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).upper()


def has_text(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(has_text(part) for part in value)
    if isinstance(value, dict):
        return any(has_text(part) for part in value.values())
    return False


def side_slots(data: dict[str, Any], index: int) -> list[str]:
    text = data.get("text", [])
    side = text[index] if isinstance(text, list) and index < len(text) else None
    if isinstance(side, list):
        return [value if isinstance(value, str) else "" for value in side]
    return [side] if isinstance(side, str) else []


def parallel_segment_stats(english: dict[str, Any], aramaic: dict[str, Any]) -> dict[str, int | float]:
    """Measure safe same-index paragraph pairing without assuming every side aligns."""
    english_pages = english.get("text", [])
    aramaic_pages = aramaic.get("text", [])
    page_count = max(len(english_pages), len(aramaic_pages))
    total_sides = aligned_sides = candidate_slots = aligned_slots = 0
    for page_index in range(page_count):
        en = side_slots(english, page_index)
        he = side_slots(aramaic, page_index)
        if not en and not he:
            continue
        total_sides += 1
        candidate_slots += max(len(en), len(he))
        if len(en) != len(he):
            continue
        aligned_sides += 1
        aligned_slots += sum(
            1 for source_text, translation_text in zip(he, en)
            if source_text.strip() and translation_text.strip()
        )
    return {
        "totalSides": total_sides,
        "alignedSides": aligned_sides,
        "candidateSlots": candidate_slots,
        "alignedSlots": aligned_slots,
        "coverage": round(aligned_slots / candidate_slots, 4) if candidate_slots else 0.0,
    }


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "DanTheMan-Otzaria-Dictionary/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if not slug:
        raise ValueError(f"Cannot create a safe filename for title: {value!r}")
    return slug


def build_archive(index: dict[str, Any], output: Path, fetcher=fetch_json) -> dict[str, Any]:
    pairs = selected_bavli_pairs(index.get("books", []))
    if not pairs:
        raise RuntimeError("No paired William Davidson English and Aramaic Bavli texts were found in books.json.")

    texts: list[tuple[str, bytes, dict[str, Any]]] = []
    seen_titles: set[str] = set()
    failures: list[str] = []
    for item, source_item in pairs:
        title = str(item.get("title", "")).strip()
        if not title or title.casefold() in seen_titles:
            failures.append(f"{title or '(untitled)'}: missing or duplicate title")
            continue
        seen_titles.add(title.casefold())
        try:
            data = fetcher(str(item["json_url"]))
            license_name = normalize_license(data.get("license"))
            if license_name not in ALLOWED_LICENSES:
                failures.append(f"{title}: unsupported or missing license {data.get('license')!r}")
                continue
            if str(data.get("versionTitle", "")).strip() != EDITION:
                failures.append(f"{title}: downloaded version title does not match the requested edition")
                continue
            if not has_text(data.get("text")):
                failures.append(f"{title}: translation text is empty")
                continue
            source_data = fetcher(str(source_item["json_url"]))
            source_license = normalize_license(source_data.get("license"))
            if source_license not in ALLOWED_LICENSES:
                failures.append(f"{title}: unsupported or missing Aramaic source license {source_data.get('license')!r}")
                continue
            expected_source_edition = str(source_item.get("versionTitle", "")).strip()
            if str(source_data.get("versionTitle", "")).strip() != expected_source_edition:
                failures.append(f"{title}: downloaded Aramaic source version does not match {expected_source_edition}")
                continue
            if not has_text(source_data.get("text")):
                failures.append(f"{title}: Aramaic source text is empty")
                continue
            parallel_stats = parallel_segment_stats(data, source_data)
            slug = safe_slug(title)
            json_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            json_text = json_text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
            source_json_text = json.dumps(source_data, ensure_ascii=False, separators=(",", ":"))
            source_json_text = source_json_text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
            payload = (
                "(function(root){root.SefariaOfflineTranslationData=root.SefariaOfflineTranslationData||{};"
                + "root.SefariaOfflineSourceData=root.SefariaOfflineSourceData||{};"
                + "root.SefariaOfflineTranslationData[" + json.dumps(slug) + "]=" + json_text + ";"
                + "root.SefariaOfflineSourceData[" + json.dumps(slug) + "]=" + source_json_text + ";"
                + "})(typeof window==='undefined'?globalThis:window);"
            ).encode("utf-8")
            metadata = {
                "title": title,
                "heTitle": str(data.get("heTitle", "")),
                "slug": slug,
                "file": f"texts/{slug}.js",
                "categories": item.get("categories", []),
                "versionTitle": EDITION,
                "language": "English",
                "license": license_name,
                "translationUrl": item["json_url"],
                "sourceVersionTitle": expected_source_edition,
                "sourceLanguage": SOURCE_LANGUAGE,
                "sourceLicense": source_license,
                "sourceUrl": source_item["json_url"],
                "parallelSegmentStats": parallel_stats,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
            }
            texts.append((f"texts/{slug}.js", payload, metadata))
        except Exception as error:  # report all missing/blocked tractates together
            failures.append(f"{title}: {type(error).__name__}: {error}")

    if failures:
        raise RuntimeError("The offline Bavli corpus is incomplete or not cleared for redistribution:\n- " + "\n- ".join(failures))

    manifest = {
        "formatVersion": 1,
        "edition": EDITION,
        "language": "English",
        "sourceEdition": SOURCE_EDITION,
        "alternateSourceEdition": ALTERNATE_SOURCE_EDITION,
        "sourceLanguage": SOURCE_LANGUAGE,
        "scope": "Talmud / Bavli",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceIndex": INDEX_URL,
        "attribution": ATTRIBUTION,
        "licensePolicy": "Both English translation and selected Aramaic source edition for every tractate must independently declare CC-BY-NC.",
        "tractateCount": len(texts),
        "tractates": [metadata for _, _, metadata in texts],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        manifest_json = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
        manifest_js = "(function(root){root.SefariaOfflineTranslationManifest=" + manifest_json + ";})(typeof window==='undefined'?globalThis:window);"
        archive.writestr("manifest.js", manifest_js)
        archive.writestr("ATTRIBUTION.txt", ATTRIBUTION + "\n")
        for name, payload, _ in texts:
            archive.writestr(name, payload)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("sefaria-bavli-english.zip"))
    args = parser.parse_args()
    manifest = build_archive(fetch_json(INDEX_URL), args.output)
    print(f"Built {args.output} with {manifest['tractateCount']} tractates.")
    print(f"Edition: {EDITION}; license: CC-BY-NC; attribution included.")


if __name__ == "__main__":
    main()
