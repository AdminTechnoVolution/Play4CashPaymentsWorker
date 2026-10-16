// Packages only compiled code + production dependencies. No .env or source credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'p4c-worker-package-'));
const output = path.join(root, 'deployment.zip');
try {
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, file), path.join(staging, file));
  fs.cpSync(path.join(root, 'dist'), path.join(staging, 'dist'), { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staging, stdio: 'inherit' });
  fs.rmSync(output, { force: true });
  // Run on Linux/macOS (Azure Cloud Shell is an option for Windows users).
  execFileSync('zip', ['-q', '-r', output, 'dist', 'node_modules', 'package.json', 'package-lock.json'], { cwd: staging, stdio: 'inherit' });
  console.log(`Paquete listo: ${output}. No contiene .env. No se ha desplegado nada en Azure.`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
