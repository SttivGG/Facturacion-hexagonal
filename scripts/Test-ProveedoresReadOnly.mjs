import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Solo SELECT/find y GET contra los servicios reales. Se guardan conteos y hashes,
// nunca documentos, nombres ni credenciales. La única escritura es el informe local.
const root = fileURLToPath(new URL('../', import.meta.url));
const [mode, reportPath = 'docs/FASE7D-VERIFICACION-DATOS.json'] = process.argv.slice(2);
assert(['capture', 'verify'].includes(mode), 'Uso: node scripts/Test-ProveedoresReadOnly.mjs capture|verify [informe.json]');
const reportFile = resolve(root, reportPath);
const docker = args => execFileSync('docker', ['compose', 'exec', '-T', ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
const mongo = JSON.parse(docker(['facturacion-mongodb', 'mongosh', '--quiet', '--eval', `
  db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
  const base = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
  const crypto = require('crypto');
  const result = {};
  for (const name of ['productos', 'fs.files', 'fs.chunks']) {
    const hash = crypto.createHash('sha256');
    let count = 0;
    base.getCollection(name).find().sort({_id:1}).forEach(row => {
      hash.update(EJSON.stringify(row, {relaxed:false}) + '\\n'); count++;
    });
    result[name] = {count, sha256:hash.digest('hex')};
  }
  print(JSON.stringify(result));
`]).trim());

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const cassandra = {};
for (const table of ['personas_por_id', 'id_por_documento', 'personas_por_rol']) {
  const source = docker(['facturacion-cassandra', 'cqlsh', '--no-color', '-e', `PAGING OFF; SELECT JSON * FROM facturacion_personas.${table};`]);
  const rows = source.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{'))
    .map(line => JSON.stringify(canonical(JSON.parse(line)))).sort();
  cassandra[table] = { count: rows.length, sha256: createHash('sha256').update(rows.join('\n')).digest('hex') };
}
const apiBase = process.env.PROVIDER_API_BASE || 'http://127.0.0.1:8080/api';
const response = await fetch(`${apiBase}/personas/rol/PROVEEDOR`);
assert.equal(response.status, 200, 'El endpoint real de proveedores debe responder 200');
const providers = await response.json();
assert(Array.isArray(providers) && providers.length <= 100);
for (const person of providers) {
  assert.match(person.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert(person.roles.includes('PROVEEDOR'));
  assert.equal(typeof person.nombres, 'string');
  assert.equal(typeof person.numeroDocumento, 'string');
}
const state = { mongo, cassandra };
const liveApi = { returned: providers.length, active: providers.filter(person => person.activo).length, limit: 100 };
if (mode === 'capture') {
  writeFileSync(reportFile, JSON.stringify({ capturedAt: new Date().toISOString(), before: state, liveApi }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: true, state, liveApi }));
} else {
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  assert.deepEqual(state, report.before, 'Los documentos de MongoDB, GridFS o Cassandra cambiaron');
  writeFileSync(reportFile, JSON.stringify({ ...report, verifiedAt: new Date().toISOString(), after: state, unchanged: true, liveApi }, null, 2) + '\n');
  console.log(JSON.stringify({ unchanged: true, state, liveApi }));
}
