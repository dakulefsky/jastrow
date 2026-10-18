"""Index complete dictionary headwords/aliases, preserving word boundaries.

No expressions are inferred from example sentences or abbreviated headwords.
English phrase glosses stop before a new bold subentry or verbal-stem block.
"""
from pathlib import Path
from html.parser import HTMLParser
import gzip,hashlib,json,re,unicodedata
ROOT=Path(__file__).parent

def norm(word):
 return re.sub('[^א-ת]','',unicodedata.normalize('NFKD',word))

def phrase(word):
 word=re.sub(r'\s+[IVXLCDM]+$','',word).strip('*() ')
 # Full spellings only. Single-letter abbreviations are not expanded by guessing.
 if not re.fullmatch(r'[א-ת\u0591-\u05c7 ]+',word):return None
 words=word.replace('\u05be',' ').split()
 if not 2<=len(words)<=12 or any(len(norm(w))<2 for w in words):return None
 return ' '.join(norm(w) for w in words)

class English(HTMLParser):
 def __init__(self):super().__init__();self.depth=0;self.current=[];self.values=[]
 def handle_starttag(self,tag,attrs):
  if tag=='span':
   if self.depth:self.depth+=1
   elif 'englishWithinHebrew' in dict(attrs).get('class','').split():self.depth=1;self.current=[]
 def handle_endtag(self,tag):
  if tag=='span' and self.depth:
   self.depth-=1
   if not self.depth:
    value=''.join(self.current).split('|',1)[0].strip()
    if value:self.values.append(value)
 def handle_data(self,text):
  if self.depth:self.current.append(text)

def primary(node,label=''):
 if isinstance(node,str):yield node.split('<b>',1)[0],label
 elif isinstance(node,list):
  for item in node:
   if isinstance(item,dict) and any(k in item for k in ['binyan-name','binyan-form']):break
   yield from primary(item,label)
 elif isinstance(node,dict):
  if any(k in node for k in ['binyan-name','binyan-form']):return
  own=' '.join(filter(None,[label,str(node.get('number',''))]))
  text=' '.join(str(node.get(k,'')) for k in ['definition','notes'])
  if text.strip():yield text.split('<b>',1)[0],own
  if 'senses' in node:yield from primary(node['senses'],own)

def build():
 source_records=gzip.decompress((ROOT/'phrase-source.json.gz').read_bytes())
 docs={d['rid']:d for d in json.loads(source_records)}
 phrases={};glosses={};notes={};counts={'jastrow':0,'krupnik':0};evidence=[]
 for path in sorted((ROOT/'plugin/data').glob('*.js')):
  if not re.fullmatch(r'(chunk-\d+|krupnik-1\d+)\.js',path.name):continue
  entries=json.loads(path.read_text().split('=',1)[1].rstrip(';\n'))
  for id,entry in entries.items():
   candidates=[(w,phrase(w)) for w in [entry['h'],*entry.get('alt',[])]]
   candidates=[(w,key) for w,key in candidates if key]
   if not candidates:continue
   source=entry.get('source','jastrow')
   primary_text=[]
   if source=='krupnik':
    values=[]
    for raw,label in primary(docs[entry['r']]['content']):
     primary_text.append(raw);parser=English();parser.feed(raw)
     values.extend({'text':v,'label':label} for v in parser.values)
    # Reviewed digitization faults; exact raw wording stays in More detail.
    if entry['r']=='KRU00798':
     assert values[0]['text']=='some say sagen'
     values[0]['text']='some say'
     notes[id]='The digitized English field reads “some say sagen”. The stray German word is omitted in the short translation; original wording is preserved below.'
    if entry['r']=='KRU16176':
     assert 'hip-joint' in ' '.join(primary_text)
     values=[{'text':'hip-joint','label':''}]
     notes[id]='The digitization misplaces “hip-joint” outside its English tag. The short translation uses that exact source phrase.'
    if entry['r']=='KRU15089':
     assert values[0]['text']=='i>( fasces'
     values=[{'text':'fasces','label':''}]
     notes[id]='The English span contains damaged italic markup. The short translation retains the exact source term “fasces”; original wording is below.'
    if entry['r']=='KRU17879':
     assert values[0]['text']=='one after the other einer nach dem anderen'
     values=[{'text':'one after the other','label':''}]
     notes[id]='The digitization omits the separator before the italic German translation. The short translation uses the English words before it.'
    glosses[id]=values
   for spelling,key in candidates:
    ids=phrases.setdefault(key,[])
    if int(id) in ids:continue
    ids.append(int(id));counts[source]+=1
    evidence.append({'key':key,'spelling':spelling,'entryId':int(id),'rid':entry['r'],'source':source,'primarySourceHtml':primary_text,'glosses':glosses.get(id),'note':notes.get(id)})
 for ids in phrases.values():ids.sort(key=lambda id:(id<32512,id))
 code='window.JASTROW_INDEX.phrases='+json.dumps(phrases,ensure_ascii=False,separators=(',',':'))+';\n'
 code+='window.JASTROW_INDEX.phraseGlosses='+json.dumps(glosses,ensure_ascii=False,separators=(',',':'))+';\n'
 code+='window.JASTROW_INDEX.phraseNotes='+json.dumps(notes,ensure_ascii=False,separators=(',',':'))+';\n'
 (ROOT/'plugin/data/phrases.js').write_text(code)
 audit={'method':__doc__,'counts':counts,'uniquePhrases':len(phrases),'sourceRecordsSha256':hashlib.sha256(source_records).hexdigest(),'entries':evidence}
 (ROOT/'plugin/data/phrase-provenance.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
 print('Indexed phrase headwords:',counts,'unique phrases:',len(phrases))
if __name__=='__main__':build()
