"""Build conservative, exact Jastrow -> Krupnik cross-links from source indexes.

Run after build_data.py and build_krupnik.py. Only unique normalized exact
headword/alternate-headword collisions are emitted. Similar spellings,
translations, and fuzzy matches are intentionally excluded.
"""
import json, re, unicodedata
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def norm(s):
    return re.sub(r"[^א-ת]", "", unicodedata.normalize("NFKD", str(s)))
def read_js(path, marker):
    raw = path.read_text(encoding="utf-8").strip()
    if not raw.startswith(marker):
        raise ValueError(f"Unexpected generated file: {path}")
    payload = raw[len(marker):].split(";\n", 1)[0].rstrip(";")
    return json.loads(payload)
def main():
    j = read_js(ROOT/"plugin/data/index.js", "window.JASTROW_INDEX=")
    k = read_js(ROOT/"plugin/data/krupnik-index.js", "window.KRUPNIK_DATA=")
    krupnik = {}
    for item in k["entries"]:
        for word in [item["h"], *item.get("alt", [])]:
            key = norm(word)
            if key: krupnik.setdefault(key, set()).add(item["r"])
    matched = []
    reverse = {}
    for item in j["entries"]:
        matches = set()
        for word in [item["h"], *item.get("alt", [])]:
            matches.update(krupnik.get(norm(word), set()))
        matched.append((item, matches))
        if len(matches) == 1:
            rid = next(iter(matches))
            reverse.setdefault(rid, set()).add(item["r"])
    links = []
    ambiguous = 0
    for item, matches in matched:
        if len(matches) == 1:
            rid = next(iter(matches))
            # Require a one-to-one match in both directions. A Jastrow
            # homonym must not silently merge with a different Krupnik sense.
            if len(reverse.get(rid, set())) == 1:
                links.append({"alias_id": "jastrow:"+item["r"], "canonical_id": "krupnik:"+rid, "confidence": "exact"})
            else:
                ambiguous += 1
        elif matches:
            ambiguous += 1
    output = ROOT/"community"/"entry-links.sql"
    # Replace the generated mapping set on every deployment so links that
    # become ambiguous or disappear from source data cannot remain stale.
    statements = ["DELETE FROM entry_links;", "-- Exact, unique Jastrow/Krupnik headword links only."]
    for link in links:
        alias = link["alias_id"].replace("'", "''")
        canonical = link["canonical_id"].replace("'", "''")
        statements.append("INSERT OR REPLACE INTO entry_links (alias_id, canonical_id, confidence) VALUES ('"+alias+"', '"+canonical+"', 'exact');")
    output.write_text("\n".join(statements)+"\n", encoding="utf-8")
    print(f"Wrote {len(links)} exact unique links; skipped {ambiguous} ambiguous Jastrow entries. SQL: {output}")
if __name__ == "__main__": main()
