#!/usr/bin/env python3
"""Build the offline Hebrew William Davidson / Steinsaltz Bavli corpus.

Only the Hebrew edition is selected. Every tractate must explicitly declare
CC-BY-NC, match the requested version, contain text, and correspond to an
English-edition Bavli tractate. No English translation is packaged here.
"""
from __future__ import annotations
import argparse, hashlib, json, re, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

INDEX_URL = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json"
EDITION = "William Davidson Edition - Hebrew"
ENGLISH_EDITION = "William Davidson Edition - English"
ALLOWED_LICENSES = {"CC-BY-NC", "CC BY-NC"}
PREFIX = "Steinsaltz on "
NON_TRACTATE_TITLES = {"Introductions to the Babylonian Talmud"}
ATTRIBUTION = (
    "William Davidson Edition - Hebrew, the Hebrew translation and explanation "
    "of the Talmud Bavli by Rabbi Adin Even-Israel Steinsaltz; Koren Publishers; "
    "digital text accessed through Sefaria. Licensed CC BY-NC. Non-commercial "
    "use only. Preserve this attribution and source/version license with every "
    "redistributed copy."
)

def norm_license(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).upper()

def has_text(value: Any) -> bool:
    if isinstance(value, str): return bool(value.strip())
    if isinstance(value, list): return any(has_text(x) for x in value)
    if isinstance(value, dict): return any(has_text(x) for x in value.values())
    return False

def fetch_json(url: str) -> dict[str, Any]:
    req=urllib.request.Request(url,headers={"User-Agent":"DanTheMan-Otzaria-Hebrew-Dictionary/1.0"})
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def safe_slug(value: str) -> str:
    slug=re.sub(r"[^a-z0-9]+","-",value.casefold()).strip("-")
    if not slug: raise ValueError(f"Cannot create safe filename for {value!r}")
    return slug

def bavli_category(item: dict[str, Any]) -> bool:
    cats={str(x).strip().casefold() for x in item.get("categories",[])}
    return "talmud" in cats and "bavli" in cats

def selected_entries(entries: list[dict[str, Any]]) -> tuple[list[dict[str, Any]],set[str]]:
    expected={
        str(x.get("title","")).strip()
        for x in entries
        if str(x.get("language","")).casefold() in {"english","en"}
        and str(x.get("versionTitle","")).strip()==ENGLISH_EDITION
        and bavli_category(x) and str(x.get("title","")).strip() not in NON_TRACTATE_TITLES and x.get("json_url")
    }
    selected=[]
    for item in entries:
        title=str(item.get("title","")).strip()
        if (str(item.get("language","")).casefold() in {"hebrew","he"}
            and str(item.get("versionTitle","")).strip()==EDITION
            and title.startswith(PREFIX) and bavli_category(item) and item.get("json_url")):
            base=title[len(PREFIX):].strip()
            if base in expected:
                selected.append((base,item))
    selected.sort(key=lambda pair:pair[0].casefold())
    return [{"tractateTitle":base,**item} for base,item in selected],expected

def build_archive(index: dict[str,Any], output: Path, fetcher=fetch_json) -> dict[str,Any]:
    entries,expected=selected_entries(index.get("books",[]))
    if not entries: raise RuntimeError("No William Davidson Edition - Hebrew Steinsaltz Bavli texts were found.")
    found=set(); texts=[]; failures=[]
    for item in entries:
        title=str(item["tractateTitle"]).strip()
        if title in found:
            failures.append(f"{title}: duplicate Hebrew Steinsaltz tractate"); continue
        found.add(title)
        try:
            data=fetcher(str(item["json_url"]))
            license_name=norm_license(data.get("license"))
            if license_name not in ALLOWED_LICENSES:
                failures.append(f"{title}: unsupported or missing Hebrew edition license {data.get('license')!r}"); continue
            if str(data.get("versionTitle","")).strip()!=EDITION:
                failures.append(f"{title}: downloaded version title does not match Hebrew Steinsaltz edition"); continue
            language=str(data.get("language","")).casefold()
            if language not in {"he","hebrew"}:
                failures.append(f"{title}: downloaded corpus is not Hebrew (language={language!r})"); continue
            if not isinstance(data.get("text"),list) or not has_text(data.get("text")):
                failures.append(f"{title}: Hebrew translation text is empty or not daf-structured"); continue
            slug=safe_slug(title)
            payload_obj={**data,"title":title,"heTitle":str(data.get("heTitle",""))}
            payload=json.dumps(payload_obj,ensure_ascii=False,separators=(",",":")).replace("\u2028","\\u2028").replace("\u2029","\\u2029")
            js=("((root)=>{root.SefariaOfflineTranslationData=root.SefariaOfflineTranslationData||{};"
                +"root.SefariaOfflineTranslationData["+json.dumps(slug)+"]="+payload+";"
                +"})(typeof window==='undefined'?globalThis:window);").encode("utf-8")
            metadata={"title":title,"heTitle":str(data.get("heTitle","")),"slug":slug,
                "file":f"texts/{slug}.js","categories":item.get("categories",[]),
                "versionTitle":EDITION,"language":"Hebrew","license":license_name,
                "sourceTitle":item.get("title"),"sourceUrl":item["json_url"],
                "sha256":hashlib.sha256(js).hexdigest(),"bytes":len(js)}
            texts.append((f"texts/{slug}.js",js,metadata))
        except Exception as error:
            failures.append(f"{title}: {type(error).__name__}: {error}")
    missing=sorted(expected-found,key=str.casefold)
    if missing: failures.append("Missing Hebrew Steinsaltz tractates: "+", ".join(missing))
    if failures:
        raise RuntimeError("Hebrew Steinsaltz corpus is incomplete or not cleared for redistribution:\n- "+"\n- ".join(failures))
    manifest={"formatVersion":1,"edition":EDITION,"language":"Hebrew","scope":"Talmud / Bavli",
        "generatedAt":datetime.now(timezone.utc).isoformat(),"sourceIndex":INDEX_URL,
        "attribution":ATTRIBUTION,"licensePolicy":"Every Hebrew tractate must explicitly declare CC-BY-NC.",
        "tractateCount":len(texts),"tractates":[m for _,_,m in texts]}
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        archive.writestr("manifest.js","(function(root){root.SefariaOfflineTranslationManifest="+json.dumps(manifest,ensure_ascii=False,separators=(",",":"))+";})(typeof window==='undefined'?globalThis:window);")
        archive.writestr("ATTRIBUTION.txt",ATTRIBUTION+"\n")
        for name,payload,_ in texts: archive.writestr(name,payload)
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,default=Path("sefaria-bavli-hebrew.zip"))
    args=parser.parse_args()
    manifest=build_archive(fetch_json(INDEX_URL),args.output)
    print(f"Built {args.output} with {manifest['tractateCount']} Hebrew Steinsaltz tractates.")
    print(f"Edition: {EDITION}; license: CC-BY-NC; attribution included.")

if __name__=="__main__": main()
