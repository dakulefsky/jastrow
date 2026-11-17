#!/usr/bin/env python3
"""Build a compact offline corpus of the William Davidson English Bavli.

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
ALLOWED_LICENSES = {"CC-BY-NC", "CC BY-NC"}
ATTRIBUTION = (
    "William Davidson Edition - English, translated by Rabbi Adin Even-Israel "
    "Steinsaltz; Koren Publishers; digital text accessed through Sefaria. "
    "Licensed CC BY-NC. Non-commercial use only. Preserve this attribution "
    "and the source/version license with every redistributed copy."
)


def selected_bavli_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected = []
    for item in entries:
        categories = {str(value).strip().casefold() for value in item.get("categories", [])}
        if (
            str(item.get("language", "")).casefold() == "english"
            and str(item.get("versionTitle", "")).strip() == EDITION
            and "talmud" in categories
            and "bavli" in categories
            and item.get("json_url")
        ):
            selected.append(item)
    return sorted(selected, key=lambda item: str(item.get("title", "")).casefold())


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
    entries = selected_bavli_entries(index.get("books", []))
    if not entries:
        raise RuntimeError("No William Davidson Edition - English Bavli texts were found in books.json.")

    texts: list[tuple[str, bytes, dict[str, Any]]] = []
    seen_titles: set[str] = set()
    failures: list[str] = []
    for item in entries:
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
            slug = safe_slug(title)
            json_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            json_text = json_text.replace("\\u2028", "\\\\u2028").replace("\\u2029", "\\\\u2029")
            payload = (
                "(function(root){root.SefariaOfflineTranslationData=root.SefariaOfflineTranslationData||{};"
                + "root.SefariaOfflineTranslationData[" + json.dumps(slug) + "]=" + json_text + ";"
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
                "sourceUrl": item["json_url"],
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
        "scope": "Talmud / Bavli",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceIndex": INDEX_URL,
        "attribution": ATTRIBUTION,
        "licensePolicy": "Every included tractate must explicitly declare CC-BY-NC.",
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
