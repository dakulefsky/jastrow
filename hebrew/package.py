from pathlib import Path
import json,zipfile
root=Path(__file__).parent
version=json.loads((root/'plugin/manifest.json').read_text())['version']
output=root/f'Aramaic-Hebrew-{version}.otzplugin'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((root/'plugin').rglob('*')):
  if p.is_file():z.write(p,p.relative_to(root/'plugin'))
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 assert json.loads(z.read('manifest.json'))['id']=='com.kulefsky.aramaic-hebrew'
print(output)
