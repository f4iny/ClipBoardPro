import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

if (process.platform === 'win32') {
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  const src = path.resolve('resources/TrimMemory.cs');
  const out = path.resolve('resources/trim_memory.exe');

  if (fs.existsSync(src) && fs.existsSync(cscPath)) {
    try {
      console.log('Compiling resources/TrimMemory.cs -> resources/trim_memory.exe...');
      execSync(`"${cscPath}" /nologo /target:winexe /optimize+ /out:"${out}" "${src}"`);
      console.log('Successfully compiled native trim_memory.exe');
    } catch (err) {
      console.warn('Warning: Failed to compile native trim_memory.exe:', err.message);
    }
  }
}
