"""Build an offline Jastrow bundle from Sefaria's lexicon BSON collections.
Usage: python build_data.py /path/to/extracted/bson-directory
Requires pymongo. Does not query or scrape the live Sefaria API.
"""
import sys, json, re, unicodedata, hashlib
from pathlib import Path
from collections import defaultdict, Counter
from html import escape
from html.parser import HTMLParser
from bson import decode_file_iter

ROOT = Path(__file__).parent / 'plugin'
DATA = ROOT / 'data'
DATA.mkdir(parents=True, exist_ok=True)

def norm(s):
    return re.sub(r'[^א-ת]', '', unicodedata.normalize('NFKD', s))

class SafeHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out=[]; self.stack=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); emitted=None
        if tag in ('i','b','em','strong','sup','sub','br','span'):
            emitted=tag
            self.out.append('<'+tag+(' dir="rtl"' if a.get('dir')=='rtl' else '')+'>')
        elif tag=='a':
            ref=a.get('data-ref','')
            if ref.startswith('Jastrow, '):
                head=re.sub(r'\s+\d+$','',ref[len('Jastrow, '):])
                emitted='a'; self.out.append('<a href="#" data-headword="'+escape(head,quote=True)+'">')
            else:
                emitted='span'; self.out.append('<span class="citation">')
        if tag!='br': self.stack.append((tag,emitted))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:
                for _, emitted in reversed(self.stack[i:]):
                    if emitted:self.out.append('</'+emitted+'>')
                del self.stack[i:];break
    def handle_data(self,s):self.out.append(escape(s))
    def finish(self):
        for _,tag in reversed(self.stack):
            if tag:self.out.append('</'+tag+'>')
        return ''.join(self.out)

def safe(s):
    p=SafeHTML();p.feed(str(s));return p.finish()

def senses(items):
    out=[]
    for s in items:
        grammar=s.get('grammar',{})
        label=' '.join(str(x) for x in [s.get('number',''),grammar.get('verbal_stem',''),*grammar.get('binyan_form',[])] if x)
        out.append('<div class="sense">'+('<b>'+escape(label)+'</b> ' if label else '')+safe(s.get('definition',''))+senses(s.get('senses',[]))+'</div>')
    return ''.join(out)

def docs(name):
    with open(Path(sys.argv[1])/name,'rb') as f:yield from decode_file_iter(f)

entries=[];by_hw=defaultdict(list);by_rid={};direct=defaultdict(set)
for d in docs('lexicon_entry.bson'):
    if d.get('parent_lexicon')!='Jastrow Dictionary':continue
    idx=len(entries);h=d['headword'];content=d['content']
    body=('<p class="morphology">'+escape(str(content['morphology']))+'</p>' if content.get('morphology') else '')+senses(content['senses'])
    entries.append({'h':h,'r':d['rid'],'html':body,'alt':d.get('alt_headwords',[])})
    by_hw[h].append(idx);by_rid[d['rid']]=idx
    for word in [h,*d.get('alt_headwords',[]),*d.get('plural_form',[])]:
        if norm(word):direct[norm(word)].add(idx)

forms=defaultdict(set);unmatched=0
for d in docs('word_form.bson'):
    ids=set()
    for lookup in d.get('lookups',[]):
        if lookup.get('parent_lexicon')!='Jastrow Dictionary':continue
        found=by_hw.get(lookup.get('headword',''),[])
        if lookup.get('rid') in by_rid:found=[by_rid[lookup['rid']]]
        ids.update(found)
        if not found:unmatched+=1
    if ids:
        for w in [d.get('form',''),d.get('c_form','')]:
            if norm(w):forms[norm(w)].update(ids)

def write_js(path, prefix, obj):
    path.write_text(prefix+json.dumps(obj,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')

# Keep the search index light; load definitions only for the chosen chunk.
chunk_size=400
meta=[{'h':e['h'],'r':e['r'],'b':i//chunk_size} for i,e in enumerate(entries)]
write_js(DATA/'index.js','window.JASTROW_INDEX=',{'entries':meta,'direct':{k:sorted(v) for k,v in direct.items()},'forms':{k:sorted(v) for k,v in forms.items()}})
for start in range(0,len(entries),chunk_size):
    write_js(DATA/f'chunk-{start//chunk_size}.js',f'window.JASTROW_CHUNKS[{start//chunk_size}]=', {str(i):entries[i] for i in range(start,min(start+chunk_size,len(entries)))})
provenance={'dictionary':'Jastrow','author':'Marcus Jastrow','edition':'London, Luzac, 1903','digitization':'Sefaria','license':'Public Domain (Sefaria version metadata)','source':'https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz','source_date':'2026-10-13','entries':len(entries),'headword_keys':len(direct),'word_form_keys':len(forms),'unmatched_form_lookups':unmatched,'source_sha256':{n:hashlib.sha256((Path(sys.argv[1])/n).read_bytes()).hexdigest() for n in ['lexicon.bson','lexicon_entry.bson','word_form.bson']}}
(DATA/'provenance.json').write_text(json.dumps(provenance,indent=2),encoding='utf-8')
print(json.dumps(provenance,indent=2))
