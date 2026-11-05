import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogPaths, digest, validateRows } from './update-divipola.mjs';

const copies = await Promise.all(catalogPaths.map(path => readFile(path, 'utf8')));
const catalog = JSON.parse(copies[0]);
test('catálogos locales completos e idénticos, metadatos y SHA-256', () => {
  assert.equal(copies[0], copies[1]);
  assert.equal(validateRows(catalog.municipios), 33);
  assert.equal(catalog.municipios.length, catalog.metadata.registros);
  assert.equal(digest(catalog.municipios), catalog.metadata.sha256);
  assert.match(catalog.metadata.version, /^gdxc-w37w-/);
});
test('rechaza duplicados, códigos sin ceros iniciales y relaciones inválidas', () => {
  const rows = catalog.municipios;
  assert.throws(() => validateRows([...rows, rows[0]]), /duplicado/);
  assert.throws(() => validateRows([{ ...rows[0], cod_mpio: '5001' }, ...rows.slice(1)]), /Código/);
  assert.throws(() => validateRows([{ ...rows[0], cod_dpto: '86' }, ...rows.slice(1)]), /Código/);
  assert.throws(() => validateRows(rows.slice(0, 1000)), /incompleto/);
});
