"""Two explicit Jastrow form references absent from the imported form index.

No root guessing or new definition: Jastrow explicitly contrasts these forms
in the cited entry. Packaging fails if that exact attestation is absent.
"""
from pathlib import Path
from html.parser import HTMLParser
import hashlib,json
ROOT=Path(__file__).parent
class Plain(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.parts=[]
 def handle_data(self,text):self.parts.append(text)
def build():
 data=json.loads((ROOT/'plugin/data/chunk-80.js').read_text().split('=',1)[1].rstrip(';\n'))
 entry=data['32133'];parser=Plain();parser.feed(entry['html']);text=''.join(parser.parts)
 quote='In Talm. Babli תנן refers to Mishnah, תניא to Boraitha.'
 assert entry['h']=='תְּנֵי' and quote in text
 forms={form:[dict(id=32133,headword=entry['h'],sourceRef=entry['r'],quote=quote,sourceTextSha256=hashlib.sha256(text.encode()).hexdigest())] for form in ['תנן','תניא']}
 (ROOT/'plugin/data/attested-forms.js').write_text('window.JASTROW_INDEX.attestedForms='+json.dumps(forms,ensure_ascii=False,separators=(',',':'))+';\n')
 return forms
if __name__=='__main__':build()
