import Ajv from 'ajv';
import { readFileSync } from 'node:fs';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const validar = new Ajv({ allErrors: true }).compile(leer('public/data/encuesta.schema.json'));

for (const archivo of ['encuesta-valida', 'encuesta-invalida']) {
  const ok = validar(leer(`public/data/ejemplos/${archivo}.json`));
  console.log(`${archivo}: ${ok ? 'VÁLIDO' : 'RECHAZADO'}`);
  if (!ok) validar.errors.forEach((e) => console.log('  -', e.instancePath || '/', e.message));
}