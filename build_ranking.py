"""Use entry length as a transparent heuristic, never as measured frequency."""
from pathlib import Path
from html.parser import HTMLParser
import re,json,hashlib
ROOT=Path(__file__).parent
class PlainText(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_data(self,text):self.parts.append(text)
def build():
 lengths={};digest=hashlib.sha256()
 for path in sorted((ROOT/'plugin/data').glob('chunk-*.js')):
  data=json.loads(path.read_text().split('=',1)[1].rstrip(';\n'))
  for id,entry in data.items():
   parser=PlainText();parser.feed(entry['html']);text=re.sub(r'\s+',' ',''.join(parser.parts)).strip();lengths[int(id)]=len(text)
   digest.update((id+'\0'+entry['html']+'\n').encode())
 assert len(lengths)==32512
 array=[lengths[i] for i in range(len(lengths))]
 (ROOT/'plugin/data/ranking.js').write_text('window.JASTROW_INDEX.entryLengths='+json.dumps(array,separators=(',',':'))+';\n')
 (ROOT/'plugin/data/ranking-provenance.json').write_text(json.dumps({'metric':'Length of plain source text in each bundled Jastrow entry, in Unicode code points after collapsing whitespace','notFrequency':True,'notSenseProbability':True,'sourceSha256':digest.hexdigest(),'entries':len(array)},ensure_ascii=False,indent=2)+'\n')
 return array
if __name__=='__main__':build()
