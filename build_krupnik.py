"""Import marked English glosses verbatim from Sefaria's Krupnik BSON.

Usage: python build_krupnik.py /path/to/lexicon_entry.bson
Only entries with explicit English spans enter the English lookup index.
No generated translations, inferred word forms, or cross-dictionary equivalences.
"""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import json, re, sys, hashlib, unicodedata
from bson import decode_file_iter
ROOT=Path(__file__).parent
DATA=ROOT/'plugin/data'
class English(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.depth=0;self.parts=[];self.current=[];self.glosses=[];self.german=False
 def handle_starttag(self,tag,attrs):
  if self.depth and tag=='span':self.depth+=1
  elif tag=='span' and 'englishWithinHebrew' in dict(attrs).get('class','').split():self.depth=1;self.current=[];self.german=False
 def handle_endtag(self,tag):
  if self.depth and tag=='span':
   self.depth-=1
   if not self.depth:
    # The source separates its English and German columns with a literal bar.
    text=''.join(self.current).split('|',1)[0].strip()
    if text:self.glosses.append(text)
 def handle_data(self,text):
  if self.depth:
   self.current.append(text)
   if not self.german:
    self.parts.append(text.split('|',1)[0])
    if '|' in text:self.german=True
  else:self.parts.append(text)
def norm(s):return re.sub('[^א-ת]','',unicodedata.normalize('NFKD',s))
def walk(node,label=''):
 if isinstance(node,list):
  current=label
  for item in node:
   if isinstance(item,dict) and ('binyan-name' in item or 'binyan-form' in item):
    current=' '.join([current,*[str(v) for k,v in item.items() if k in ('binyan-name','binyan-form')]]).strip()
   yield from walk(item,current)
 elif isinstance(node,dict):
  own=' '.join([label,str(node.get('number',''))]).strip()
  if 'definition' in node or 'notes' in node:yield node,own
  for key,value in node.items():
   if isinstance(value,(dict,list)):yield from walk(value,own)
 elif isinstance(node,str) and 'englishWithinHebrew' in node:yield {'definition':node},label
def main(path):
 with open(path,'rb') as f:docs=[{k:v for k,v in d.items() if k!='_id'} for d in decode_file_iter(f) if d.get('parent_lexicon')=='Krupnik Dictionary']
 docs.sort(key=lambda d:int(d['rid'][3:]))
 assert len(docs)==20177 and len({d['rid'] for d in docs})==len(docs)
 entries=[];direct={};meta=[]
 for doc in docs:
  glosses=[];original=[]
  for sense,label in walk(doc['content']):
   html=' '.join(str(sense.get(k,'')) for k in ['definition','notes'])
   parser=English();parser.feed(html);glosses.extend({'text':g,'label':label} for g in parser.glosses)
   # Original wording retained as plain text; imported HTML cannot execute.
   original.append((label+' ' if label else '')+''.join(parser.parts))
  if not glosses:continue
  id=32512+len(entries);block=1000+len(entries)//400
  entry={'h':doc['headword'],'r':doc['rid'],'alt':[a['word'] if isinstance(a,dict) else a for a in doc.get('alt_headwords',[])],'source':'krupnik','glosses':glosses,'html':'<p>'+escape('\n'.join(original))+'</p>'}
  entry['notation']=[]
  if doc.get('pos_list'):entry['notation'].append(' '.join(doc['pos_list']))
  for key,label in [('used_in','Used in'),('equals','Equivalent spelling'),('emendation','Source emendation')]:
   if doc.get(key):entry['notation'].append(label+': '+(' · '.join(doc[key]) if isinstance(doc[key],list) else str(doc[key])))
  if doc.get('biblical'):entry['notation'].append('Marked biblical in source')
  if doc.get('no_binyan_kal'):entry['notation'].append('Source marks no qal form')
  entries.append((id,entry));meta.append({'h':entry['h'],'r':entry['r'],'b':block,'source':'krupnik'})
  for word in [entry['h'],*entry['alt']]:
   key=norm(word)
   if key:direct.setdefault(key,[]).append(id)
 chunks={}
 for id,entry in entries:chunks.setdefault(1000+(id-32512)//400,{})[id]=entry
 for block,chunk in chunks.items():(DATA/f'krupnik-{block}.js').write_text('window.JASTROW_CHUNKS['+str(block)+']='+json.dumps(chunk,ensure_ascii=False,separators=(',',':'))+';\n')
 supplement={'entries':meta,'direct':direct,'lengths':[len(re.sub('<[^>]*>','',e['html'])) for _,e in entries]}
 code='window.KRUPNIK_DATA='+json.dumps(supplement,ensure_ascii=False,separators=(',',':'))+';\n'
 code+='(function(i,k){i.entries.push(...k.entries);for(const [word,ids] of Object.entries(k.direct))i.direct[word]=[...(i.direct[word]||[]),...ids];if(i.entryLengths)i.entryLengths.push(...k.lengths);})(window.JASTROW_INDEX,window.KRUPNIK_DATA);\n'
 (DATA/'krupnik-index.js').write_text(code)
 source=json.dumps(docs,ensure_ascii=False,separators=(',',':'))
 (ROOT/'krupnik-source.json').write_text(source+'\n')
 (DATA/'krupnik-provenance.json').write_text(json.dumps({'title':'A Dictionary of the Talmud, the Midrash and the Targum','authors':['Baruch Krupnik','A. M. Silbermann'],'edition':'London, 1927','digitization':'Sefaria','license':'Public Domain','licenseEvidence':'https://www.sefaria.org/digitized-by-sefaria','source':'https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz','retrieved':'2026-10-16','sourceEntries':len(docs),'englishEntries':len(entries),'sourceRecordsSha256':hashlib.sha256(source.encode()).hexdigest(),'extraction':'Verbatim text of englishWithinHebrew spans before the English/German separator. Only headwords and explicitly supplied alternate headwords indexed; no inferred forms.'},ensure_ascii=False,indent=2)+'\n')
 print(f'Imported {len(entries)} English-bearing entries out of {len(docs)} source records')
if __name__=='__main__':main(sys.argv[1])
