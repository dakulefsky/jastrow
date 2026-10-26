"""Build lexical eligibility for bounded, explicitly tentative inflection lookup.

Source definitions and imported word-form mappings are never modified. Only
headwords/aliases with an explicit noun label or an explicit verbal infinitive
gloss are eligible. Abbreviations, phrases and proper-name-only labels are not.
"""
import gzip,hashlib,json,re,unicodedata
from pathlib import Path
from html import unescape
ROOT=Path(__file__).resolve().parent
DATA=ROOT/'plugin/data'
FINAL=str.maketrans('ךםןףץ','כמנפצ')
def norm(s):return ''.join(c for c in unicodedata.normalize('NFKD',s) if '\u05d0'<=c<='\u05ea')
def build():
    stems={};evidence={};inputs={}
    for path in sorted(DATA.iterdir()):
        if not re.fullmatch(r'(?:chunk-|krupnik-)\d+\.js',path.name):continue
        inputs[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
        entries=json.loads(path.read_text().split('=',1)[1].rstrip(';\n'))
        for key,e in entries.items():
            marker=re.match(r'<p class="morphology">(.*?)</p>',e['html'])
            if marker and 'pr. n.' in marker[1]:continue
            noun=marker and marker[1] in ['m.','f.','m. pl.','f. pl.']
            notation=e.get('notation',[])
            if any(v in ['שם איש','שם מקום'] for v in notation):continue
            noun=noun or any(v in ['ז׳','נ׳','ז״ר','נ״ר'] for v in notation)
            if e.get('source')=='krupnik':
                verb_marker=e.get('glosses',[{}])[0].get('text','')
                verb=bool(re.match(r'^to [a-z]',verb_marker)) and 'Source marks no qal form' not in notation
            else:
                m=re.search(r'<i>([^<]*)</i>',e['html'])
                verb_marker=unescape(m[1]) if m else None
                verb=bool(verb_marker and re.match(r'^to [a-z]',verb_marker)) and not noun
            families=[]
            if noun:families.append('noun')
            if verb and not noun:families.append('verb')
            if not families:continue
            spellings=[]
            for raw in [e['h'],*e.get('alt',[])]:
                raw=re.sub(r'\s+[IVXLCDM]+$','',raw).lstrip('*')
                # Roman/superscript entry numbers are edition metadata, not letters.
                raw=re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+$','',raw).strip()
                if re.search(r'[\s״׳"\'\u05be]',raw):continue
                word=norm(raw)
                if not 2<=len(word)<=24:continue
                spellings.append(word)
                for family in families:
                    variants={word.translate(FINAL)}
                    if family=='noun' and word.endswith('א') and len(word)>2:variants.add(word[:-1].translate(FINAL))
                    for stem in sorted(variants):
                        item={'id':int(key),'family':family,'base':word}
                        if item not in stems.setdefault(stem,[]):stems[stem].append(item)
            if spellings:evidence[key]={'sourceRef':e['r'],'headword':e['h'],'families':families,'nounMarker':marker[1] if marker and noun else [v for v in notation if v in ['ז׳','נ׳','ז״ר','נ״ר']],'verbMarker':verb_marker,'spellings':spellings,'sourceHtmlSha256':hashlib.sha256(e['html'].encode()).hexdigest()}
    out={'stems':stems,'verbalPrefixes':['א','נ','י','ת','ל'],'imperfectEndings':['ון','ין','י',''],'rules':[
        {'family':'noun','endings':['ייהון','ייהו','ייכון','ייכו','יהון','יהו','הון','הו','כון','כו','ייא','יא','ין','ון','אי','ן','יה','יך','יכ','י','ך','כ','ה','א'],'label':'possible noun ending'},
        {'family':'verb','endings':['ינן','יתון','יתו','יתנא','תון','נא','נן','ין','ון','ית','ת','ו','י'],'label':'possible verb ending'}]}
    (DATA/'inflections.js').write_text('window.JASTROW_INDEX.inflections='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
    audit=ROOT/'audit';audit.mkdir(exist_ok=True)
    provenance={'purpose':'Lexical eligibility for tentative candidate lookup, not attestation of generated inflections','inputSha256':inputs,'entryEvidence':evidence,'rules':out['rules'],'verbalPrefixes':out['verbalPrefixes'],'imperfectEndings':out['imperfectEndings'],'grammar':{'author':'Michael Sokoloff','title':'Jewish Babylonian Aramaic, The Semitic Languages (2011)','sections':'6.1–6.3, pp. 663–667','url':'https://joverfelt.net/wp-content/uploads/2021/09/the-semitic-languages-an-international-handbook-handbucc88cher-zur-sprach-und-kommunikationswissenschaft-by-stefan-weninger-geoffrey-khan-michael-p.-streck-janet-c.-e.-watson-.pdf','accessed':'2026-10-26','scope':'Rules cover selected consonant-preserving forms only; dialect, irregular stem changes and person/number interpretation are not resolved.'}}
    (audit/'inflection-provenance.json.gz').write_bytes(gzip.compress(json.dumps(provenance,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    print('Inflection eligibility:',len(evidence),'entries,',len(stems),'stems')
    return out
if __name__=='__main__':build()
