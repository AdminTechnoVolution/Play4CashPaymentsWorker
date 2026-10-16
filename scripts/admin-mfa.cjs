// Run manually by the operator on a trusted terminal. Never run in CI/log streams.
const { randomBytes } = require('node:crypto');
const id = process.argv[2];
if (!/^[a-f0-9]{24}$/.test(id || '')) {
  console.error('Uso: npm run admin:mfa -- ID_ADMIN_MONGODB (24 caracteres hexadecimales)');
  process.exit(1);
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let buffer = 0, bits = 0, seed = '';
for (const byte of randomBytes(20)) {
  buffer = (buffer << 8) | byte;
  bits += 8;
  while (bits >= 5) { bits -= 5; seed += alphabet[(buffer >>> bits) & 31]; }
}
console.log('SECRETO: ejecutar solo en terminal privada. No pegar en chats, Git ni logs de CI.');
console.log('Autenticador -> añadir clave manual: TOTP / SHA1 / 6 dígitos / 30 segundos.');
console.log('Semilla para el autenticador:', seed);
console.log('Valor de FINANCE_ADMIN_TOTP_SECRETS en API:');
console.log(JSON.stringify({ [id]: seed }));
console.log('No se modificó Azure ni la base. Si ya hay otros admins, conservar sus entradas en el JSON.');
