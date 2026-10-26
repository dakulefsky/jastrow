"""Package the actual plugin and generate its matching self-contained preview."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,hashlib,base64,sys
from build_attested import build as build_attested
build_attested()
from build_ranking import build as build_ranking
build_ranking()
from build_phrases import build as build_phrases
build_phrases()
from build_inflections import build as build_inflections
build_inflections()
root=Path(__file__).parent
manifest=json.loads((root/'plugin/manifest.json').read_text())
stem='Aramaic-to-English-Dictionary-'+manifest['version'];output=root.parent
with ZipFile(output/(stem+'.otzplugin'),'w',ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted((root/'plugin').rglob('*')):
  if p.is_file():z.write(p,p.relative_to(root/'plugin'))
if '--preview' in sys.argv:
 html=(root/'plugin/index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(root/'plugin/style.css').read_text()+'</style>')
 hashes=[]
 for name in ['search.js','data/index.js','data/attested-forms.js','data/ranking.js','data/krupnik-index.js','data/phrases.js','data/inflections.js','context-menu.js','reading-view.js','unified-view.js','quick-lookup.js','app.js','reveal.js']:
  code=(root/'plugin'/name).read_text()
  if name=='app.js':
   # Same application code; only the offline chunks are preloaded in the preview.
   preload='window.JASTROW_CHUNKS=window.JASTROW_CHUNKS||{};\n'+''.join(p.read_text()+'\n' for p in sorted([*(root/'plugin/data').glob('chunk-*.js'),*(root/'plugin/data').glob('krupnik-1*.js')]))
   code=preload+code
  assert '</script' not in code.lower(),name
  hashes.append("'sha256-"+base64.b64encode(hashlib.sha256(code.encode()).digest()).decode()+"'")
  html=html.replace('<script src="'+name+'"></script>','<script>'+code+'</script>')
 html=html.replace("script-src 'self'",'script-src '+' '.join(hashes))
 (output/'Jastrow-Preview.html').write_text(html)
with ZipFile(output/(stem+'-source.zip'),'w',ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file() and not any(x in p.parts for x in ['.git','__pycache__','node_modules']) and not (p.parent==root and p.suffix=='.png' and p.name.startswith(('preview','review'))):z.write(p,p.relative_to(root))
print('Built '+stem+', source archive (preview only with --preview)')
