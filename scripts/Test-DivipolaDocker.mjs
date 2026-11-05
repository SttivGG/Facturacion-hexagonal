import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Solo peticiones de creación inválidas y consultas. No actualiza personas existentes.
const origin = process.env.NEXO_ORIGIN || 'http://127.0.0.1:5173';
const document = `FASE7C-NEG-${randomUUID()}`;
const invalid = [
  { pais: 'Colombia', departamento: 'Antioquia', ciudad: 'Mocoa' },
  { pais: ' Colombia ', departamento: 'Putumayo', ciudad: 'Medellín' },
  { pais: '', departamento: '', ciudad: 'Mocoa' },
];
for (const location of invalid) {
  const response = await fetch(`${origin}/api/personas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipoDocumento: 'CC', numeroDocumento: document,
      nombres: 'Prueba negativa DIVIPOLA', roles: ['CLIENTE'], ...location }),
  });
  const problem = await response.json();
  assert.equal(response.status, 400, JSON.stringify(problem));
  assert.equal(problem.status, 400);
  console.log(`HTTP 400: ${JSON.stringify(location)}: ${problem.detail}`);
}
const lookup = await fetch(`${origin}/api/personas/documento/CC/${encodeURIComponent(document)}`);
assert.equal(lookup.status, 404, 'Una petición inválida reservó o guardó una persona');
console.log('HTTP 404 por documento: las peticiones inválidas no crearon ni reservaron una persona.');
