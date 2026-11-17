from pathlib import Path
from html.parser import HTMLParser
import json,re,unicodedata,hashlib,zipfile

ROOT=Path(__file__).parent

class Hebrew(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True)
  self.skip=0
  self.english_depth=0
  self.parts=[]
  self.lead=[]
  self.english=[]
  self.seen=False

 def handle_starttag(self,t,a):
  if t=='span':
   classes=dict(a).get('class','')
   if self.skip or 'englishWithinHebrew' in classes:
    self.skip+=1
    if self.english_depth or 'englishWithinHebrew' in classes:
     self.english_depth+=1
    if 'englishWithinHebrew' in classes:
     self.seen=True
  if not self.skip and t in ('br','p'):
   self.parts.append('\n')

 def handle_endtag(self,t):
  if t=='span' and self.skip:
   self.skip-=1
   if self.english_depth:
    self.english_depth-=1

 def handle_data(self,s):
  if self.english_depth:
   self.english.append(s)
  elif not self.skip:
   self.parts.append(s)
   if not self.seen:
    self.lead.append(s)

def clean(s):
 return re.sub(r'\s+',' ',s).strip()

def norm(s):
 return re.sub('[^א-ת]','',unicodedata.normalize('NFKD',s))

def senses(n,label=''):
 if isinstance(n,str):
  yield n,label
 elif isinstance(n,list):
  current=label
  for v in n:
   if isinstance(v,dict):
    current=' '.join([label,*[str(v[k]) for k in ('binyan-name','binyan-form') if k in v]]).strip() or current
   yield from senses(v,current)
 elif isinstance(n,dict):
  label=' '.join([label,str(n.get('number',''))]).strip()
  if 'definition' in n or 'notes' in n:
   yield ' '.join(str(n.get(k,'')) for k in ('definition','notes')),label
  for k,v in n.items():
   if isinstance(v,(list,dict)):
    yield from senses(v,label)

def build():
 source=ROOT/'source.json'
 docs=json.loads(source.read_text())
 entries=[]
 index={}
 for d in docs:
  parts=[]
  for raw,label in senses(d['content']):
   p=Hebrew()
   p.feed(raw)
   full=clean(''.join(p.parts))
   lead=clean(''.join(p.lead))
   english=clean(''.join(p.english))
   if full:
    part={'label':label,'meaning':lead if p.seen else '', 'text':full}
    if english:
     part['english']=english
    parts.append(part)
  if not parts:
   continue
  e={'word':d['headword'],'rid':d['rid'],'parts':parts,'alt':[a['word'] if isinstance(a,dict) else a for a in d.get('alt_headwords',[])]}
  i=len(entries)
  entries.append(e)
  for word in [e['word'],*e['alt']]:
   key=' '.join(norm(w) for w in word.split())
   if key:
    index.setdefault(key,[]).append(i)
 (ROOT/'plugin/data.js').write_text('window.HEBREW_DICTIONARY='+json.dumps({'entries':entries,'index':index},ensure_ascii=False,separators=(',',':'))+';\n')
 provenance={'source':'Sefaria Krupnik Dictionary','edition':'London, 1927','authors':['Baruch Krupnik','A. M. Silbermann'],'license':'Public Domain','sourceRecords':len(docs),'includedRecords':len(entries),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'extraction':'Hebrew explanations are preserved verbatim outside explicitly marked englishWithinHebrew spans; the original English gloss inside each such span is retained separately as hidden lookup metadata. Concise Hebrew text is only the prefix preceding the first multilingual span; no translated or generated definitions.'}
 (ROOT/'plugin/provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
 print(len(entries),'entries')

if __name__=='__main__':
 build()
