import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const destDir = join(root, '..', 'extension', 'src', 'public', 'companion');
mkdirSync(destDir, { recursive: true });

const pySrc = join(root, '..', 'native-helper', 'src', 'namaw_helper.py');
copyFileSync(pySrc, join(destDir, 'namaw_helper.py'));
console.log('[copy-companion] bundled namaw_helper.py');

const exeSrc = join(root, '..', 'native-helper', 'bin', 'namaw_helper.exe');
if (existsSync(exeSrc)) {
  copyFileSync(exeSrc, join(destDir, 'namaw_helper.exe'));
  console.log('[copy-companion] bundled namaw_helper.exe (self-contained native host)');
} else {
  console.log('[copy-companion] NOTE: namaw_helper.exe not found - run scripts/build-helper.ps1 to enable the 1-click companion installer.');
}
