import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

if (process.platform === 'win32') {
  const winDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const cscCandidates = [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  const cscPath = cscCandidates.find(p => fs.existsSync(p));
  const src = path.resolve('resources/TrimMemory.cs');
  const out = path.resolve('resources/trim_memory.exe');

  if (fs.existsSync(src) && cscPath) {
    try {
      console.log(`Compiling resources/TrimMemory.cs using ${cscPath} -> resources/trim_memory.exe...`);
      execSync(`"${cscPath}" /nologo /target:winexe /optimize+ /out:"${out}" "${src}"`);
      console.log('Successfully compiled native trim_memory.exe');
    } catch (err) {
      console.warn('Warning: Failed to compile native trim_memory.exe:', err.message);
    }
  } else if (!cscPath) {
    console.warn('Warning: csc.exe (.NET Framework C# compiler) not found in system root. Skipping native compilation.');
  }
}
