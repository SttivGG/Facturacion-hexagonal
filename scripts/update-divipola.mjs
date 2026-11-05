import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const catalogPaths = [
  new URL('../backend/src/main/resources/catalogos/divipola.json', import.meta.url),
  new URL('../frontend/src/data/divipola.json', import.meta.url),
];
const source = 'https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w';
const api = 'https://www.datos.gov.co/resource/gdxc-w37w.json';
const fields = ['cod_dpto', 'dpto', 'cod_mpio', 'nom_mpio', 'tipo_municipio'];

export function validateRows(rows) {
  const codes = new Set();
  const departments = new Map();
  if (!Array.isArray(rows) || rows.length < 1100) throw Error('Catálogo incompleto');
  for (const row of rows) {
    if (fields.some(key => typeof row[key] !== 'string' || !row[key].trim())) throw Error('Columna ausente');
    if (!/^\d{2}$/.test(row.cod_dpto) || !/^\d{5}$/.test(row.cod_mpio)
      || !row.cod_mpio.startsWith(row.cod_dpto)) throw Error('Código DIVIPOLA inválido');
    if (codes.has(row.cod_mpio)) throw Error(`Municipio duplicado: ${row.cod_mpio}`);
    if (departments.has(row.cod_dpto) && departments.get(row.cod_dpto) !== row.dpto) throw Error('Departamento inconsistente');
    codes.add(row.cod_mpio);
    departments.set(row.cod_dpto, row.dpto);
  }
  if (departments.size !== 33) throw Error('Se esperaban 32 departamentos y Bogotá D.C.');
  return departments.size;
}

export function digest(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.json();
}

if (process.argv.includes('--check')) {
  const copies = await Promise.all(catalogPaths.map(path => readFile(path, 'utf8')));
  if (copies[0] !== copies[1]) throw Error('Los catálogos frontend/backend difieren');
  const catalog = JSON.parse(copies[0]);
  validateRows(catalog.municipios);
  if (catalog.metadata.registros !== catalog.municipios.length || catalog.metadata.sha256 !== digest(catalog.municipios)) throw Error('Metadatos inválidos');
  console.log(`DIVIPOLA ${catalog.metadata.version}: ${catalog.municipios.length} registros; copias idénticas; SHA-256 verificado.`);
} else if (process.argv.includes('--update')) {
  const metadata = await json('https://www.datos.gov.co/api/views/gdxc-w37w.json');
  const columns = metadata.columns.map(column => column.fieldName);
  if (fields.some(field => !columns.includes(field))) throw Error('Cambió el esquema de la fuente');
  const count = Number((await json(`${api}?$select=count(*)`))[0].count);
  // El límite explícito evita la página de 1000 filas por defecto de Socrata.
  const raw = await json(`${api}?$select=${fields.join(',')}&$order=cod_mpio&$limit=50000`);
  const rows = raw.map(row => Object.fromEntries(fields.map(field => [field, row[field]])));
  const departments = validateRows(rows);
  if (rows.length !== count) throw Error(`Descarga incompleta: ${rows.length}/${count}`);
  const sha256 = digest(rows);
  const catalog = {
    metadata: {
      fuente: source, api, dataset: 'gdxc-w37w',
      descargadoEn: new Date().toISOString(),
      fuenteActualizadaEn: new Date(metadata.rowsUpdatedAt * 1000).toISOString(),
      version: `gdxc-w37w-${metadata.rowsUpdatedAt}-${sha256.slice(0, 12)}`,
      registros: rows.length, departamentos: departments, sha256,
    },
    municipios: rows,
  };
  const contents = JSON.stringify(catalog, null, 2) + '\n';
  // Solo escribir después de validar la descarga completa.
  for (const path of catalogPaths) {
    await mkdir(new URL('.', path), { recursive: true });
    await writeFile(path, contents);
  }
  console.log(JSON.stringify(catalog.metadata, null, 2));
}
