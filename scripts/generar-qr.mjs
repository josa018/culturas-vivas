import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) throw new Error('Uso: node scripts/generar-qr.mjs <URL>');
const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
writeFileSync('public/assets/qr-culturas-vivas.svg', svg);
console.log('QR generado para', url);