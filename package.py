from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root=Path(__file__).parent
manifest=json.loads((root/'plugin/manifest.json').read_text())
output=root.parent/('Jastrow-'+manifest['version']+'.otzplugin')
with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted((root/'plugin').rglob('*')):
        if p.is_file():z.write(p,p.relative_to(root/'plugin'))
print(output)
