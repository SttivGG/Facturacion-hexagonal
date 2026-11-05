import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { departments, municipalities, resolveLocation, searchLocations, validateLocation } from '../src/locations';

const basePerson = {
  id: '7c000000-0000-4000-8000-000000000001', tipoDocumento: 'CC', numeroDocumento: '7C-PRUEBA',
  nombres: 'Persona de prueba DIVIPOLA', apellidos: 'Nexo', correo: null, telefono: null,
  telefonoAlternativo: null, pais: 'Colombia', departamento: 'PUTUMAYO', ciudad: 'MOCOA',
  direccion: 'Calle de prueba 7C', fechaNacimiento: null, observaciones: null,
  roles: ['CLIENTE'], activo: true, fechaCreacion: '2026-11-05T15:00:00Z', fechaActualizacion: '2026-11-05T15:00:00Z',
};
let people: typeof basePerson[];
let writes: { method: string; body: typeof basePerson }[];
let externalRequests: string[];

test.beforeEach(async ({ page }) => {
  people = []; writes = []; externalRequests = [];
  await page.route(/https?:\/\/([^/]*\.)?datos\.gov\.co\//, async route => {
    externalRequests.push(route.request().url()); await route.abort();
  });
  // Todas las escrituras y lecturas de personas se resuelven en memoria.
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      const body = request.postDataJSON();
      if (!path.startsWith('/api/personas')) throw Error(`Escritura inesperada: ${path}`);
      writes.push({ method: request.method(), body });
      people = [{ ...basePerson, ...body }];
      return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: people[0] });
    }
    if (path === '/api/health') return route.fulfill({ json: { status: 'OK' } });
    if (path.startsWith('/api/personas/documento/')) return route.fulfill({ status: 404, json: { detail: 'Persona no encontrada' } });
    if (path.startsWith('/api/personas/rol/')) return route.fulfill({ json: people });
    return route.fulfill({ json: [] });
  });
});

async function openNew(page: Page) {
  await page.goto('/#/personas');
  await page.getByRole('button', { name: 'Nueva persona', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Nueva persona', exact: true });
  await editor.getByLabel('Número de documento', { exact: false }).fill('7C-PRUEBA');
  await editor.getByLabel('Nombres', { exact: false }).fill('Persona de prueba DIVIPOLA');
  return editor;
}
async function openEdit(page: Page, overrides = {}) {
  people = [{ ...basePerson, ...overrides }];
  await page.goto('/#/personas');
  await page.getByRole('button', { name: `Editar ${basePerson.nombres}`, exact: true }).click();
  return page.getByRole('dialog', { name: 'Editar persona', exact: true });
}
async function choose(editor: Locator, label: string, query: string, name: string) {
  await editor.getByRole('combobox', { name: label, exact: true }).fill(query);
  await editor.getByRole('option', { name, exact: true }).click();
}
async function selectMocoa(editor: Locator) {
  await choose(editor, 'Departamento', 'putu', 'PUTUMAYO');
  await choose(editor, 'Municipio / ciudad', 'mocoa', 'MOCOA');
}

test('catálogo local: departamentos, municipios, búsqueda sin tildes y ambigüedad', () => {
  expect(departments).toHaveLength(33);
  expect(departments).toContainEqual({ code: '05', name: 'ANTIOQUIA' });
  expect(municipalities('86')).toHaveLength(13);
  expect(municipalities('86').every(row => row.code.startsWith('86'))).toBeTruthy();
  expect(searchLocations(municipalities('05'), 'medellin')).toEqual(searchLocations(municipalities('05'), 'MEDELLÍN'));
  expect(searchLocations(municipalities('86'), '  puerto   asis ')[0].name).toBe('PUERTO ASÍS');
  expect(resolveLocation({ pais: 'Colombia', departamento: '', ciudad: 'San Francisco' }).municipality).toBeUndefined();
  expect(resolveLocation({ pais: 'Colombia', departamento: '  putumayo ', ciudad: '  PUERTO asis ' }).municipality?.code).toBe('86568');
  expect(validateLocation({ pais: 'Colombia', departamento: 'Antioquia', ciudad: 'Mocoa', direccion: '' }).ciudad).toBeTruthy();
});

test('crea persona con nombres oficiales sin conectarse a datos.gov.co', async ({ page }, info) => {
  const editor = await openNew(page);
  await expect(editor.getByRole('combobox', { name: 'Municipio / ciudad' })).toBeDisabled();
  await selectMocoa(editor);
  await editor.getByLabel('Dirección', { exact: true }).fill('Calle de prueba 7C');
  if (info.project.name === 'desktop') {
    await mkdir('../docs/capturas/fase7c', { recursive: true });
    await editor.getByLabel('Dirección', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '../docs/capturas/fase7c/creacion.png' });
  }
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(editor).not.toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ pais: 'Colombia', departamento: 'PUTUMAYO', ciudad: 'MOCOA', direccion: 'Calle de prueba 7C', roles: ['CLIENTE'] });
  expect(externalRequests).toEqual([]);
});

test('cambiar o limpiar departamento borra el municipio y limita las opciones', async ({ page }) => {
  const editor = await openNew(page);
  await selectMocoa(editor);
  await choose(editor, 'Departamento', 'putumayo', 'PUTUMAYO');
  await expect(editor.getByRole('combobox', { name: 'Municipio / ciudad' })).toHaveValue('MOCOA');
  await choose(editor, 'Departamento', 'antio', 'ANTIOQUIA');
  const city = editor.getByRole('combobox', { name: 'Municipio / ciudad' });
  await expect(city).toHaveValue('');
  await city.fill('mocoa');
  await expect(editor.getByRole('option', { name: 'MOCOA', exact: true })).toHaveCount(0);
  await expect(editor.getByText('Sin coincidencias. Prueba con otro nombre.')).toBeVisible();
  await city.fill('medellin');
  await editor.getByRole('option', { name: 'MEDELLÍN', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Departamento', exact: true }).fill('');
  await editor.getByRole('option', { name: 'Sin especificar', exact: true }).click();
  await expect(city).toHaveValue('');
  await expect(city).toBeDisabled();
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[0].body).toMatchObject({ departamento: '', ciudad: '' });
});

test('rechaza texto sin confirmar y nombres fuera del catálogo', async ({ page }) => {
  const editor = await openNew(page);
  await editor.getByRole('combobox', { name: 'Departamento', exact: true }).fill('Inventado');
  await editor.getByRole('combobox', { name: 'Departamento', exact: true }).press('Enter');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(editor.getByRole('combobox', { name: 'Departamento', exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(writes).toHaveLength(0);
  await choose(editor, 'Departamento', 'putumayo', 'PUTUMAYO');
  await editor.getByRole('combobox', { name: 'Municipio / ciudad' }).fill('Medellín');
  await editor.getByRole('combobox', { name: 'Municipio / ciudad' }).press('Enter');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes).toHaveLength(0);
});

test('edita persona y guarda la selección oficial', async ({ page }, info) => {
  const editor = await openEdit(page);
  await expect(editor.getByRole('combobox', { name: 'Departamento', exact: true })).toHaveValue('PUTUMAYO');
  await choose(editor, 'Departamento', 'antioquia', 'ANTIOQUIA');
  await choose(editor, 'Municipio / ciudad', 'medellin', 'MEDELLÍN');
  if (info.project.name === 'desktop') {
    await mkdir('../docs/capturas/fase7c', { recursive: true });
    await editor.getByLabel('Dirección', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '../docs/capturas/fase7c/edicion.png' });
  }
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(editor).not.toBeVisible();
  expect(writes[0].method).toBe('PUT');
  expect(writes[0].body).toMatchObject({ departamento: 'ANTIOQUIA', ciudad: 'MEDELLÍN' });
});

test('reconoce escritura anterior y conserva los valores al editar otro dato', async ({ page }) => {
  const editor = await openEdit(page, { pais: ' colombia ', departamento: ' putumayo ', ciudad: ' puerto asis ' });
  await expect(editor.getByRole('combobox', { name: 'Municipio / ciudad' })).toHaveValue('PUERTO ASÍS');
  await editor.getByLabel('Teléfono', { exact: true }).fill('3000000000');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[0].body).toMatchObject({ pais: ' colombia ', departamento: ' putumayo ', ciudad: ' puerto asis ' });
});

test('ubicación desconocida requiere revisión explícita y permite conservarla', async ({ page }) => {
  const editor = await openEdit(page, { departamento: 'Depto anterior', ciudad: 'San Francisco' });
  await expect(editor.getByText(/no encontramos una correspondencia única/)).toBeVisible();
  await expect(editor.getByLabel('Municipio / ciudad', { exact: true })).toHaveValue('San Francisco');
  await expect(editor.getByLabel('Municipio / ciudad', { exact: true })).toHaveAttribute('readonly', '');
  await editor.getByLabel('Teléfono', { exact: true }).fill('3000000000');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[0].body).toMatchObject({ departamento: 'Depto anterior', ciudad: 'San Francisco' });
});

test('revisa una ubicación desconocida con una selección explícita', async ({ page }) => {
  const editor = await openEdit(page, { departamento: '', ciudad: 'San Francisco' });
  await editor.getByRole('button', { name: 'Seleccionar ubicación de Colombia' }).click();
  await expect(editor.getByRole('combobox', { name: 'Municipio / ciudad' })).toHaveValue('');
  await selectMocoa(editor);
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[0].body).toMatchObject({ pais: 'Colombia', departamento: 'PUTUMAYO', ciudad: 'MOCOA' });
});

test('conserva país extranjero y ofrece edición internacional explícita', async ({ page }) => {
  const editor = await openEdit(page, { pais: 'Ecuador', departamento: 'Pichincha', ciudad: 'Quito' });
  await expect(editor.getByLabel('País', { exact: true })).toHaveValue('Ecuador');
  await expect(editor.getByLabel('Municipio / ciudad', { exact: true })).toHaveAttribute('readonly', '');
  await editor.getByRole('button', { name: 'Editar ubicación internacional', exact: true }).click();
  await editor.getByLabel('Departamento / región', { exact: true }).fill('Guayas');
  await editor.getByLabel('Municipio / ciudad', { exact: true }).fill('Guayaquil');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[0].body).toMatchObject({ pais: 'Ecuador', departamento: 'Guayas', ciudad: 'Guayaquil' });
});

test('conserva nulos y permite crear sin ubicación opcional', async ({ page }) => {
  const editor = await openEdit(page, { pais: null, departamento: null, ciudad: null });
  await editor.getByLabel('Teléfono', { exact: true }).fill('3000000000');
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(editor).not.toBeVisible();
  expect(writes[0].body).toMatchObject({ pais: null, departamento: null, ciudad: null });
  const create = await openNew(page);
  await create.getByRole('button', { name: 'Guardar persona' }).click();
  expect(writes[1].body).toMatchObject({ pais: 'Colombia', departamento: '', ciudad: '' });
});

test('selección, búsqueda y cierre de lista mediante teclado', async ({ page }) => {
  const editor = await openNew(page);
  const department = editor.getByRole('combobox', { name: 'Departamento', exact: true });
  await department.fill('putu');
  await department.press('ArrowDown');
  await department.press('Enter');
  await expect(department).toHaveValue('PUTUMAYO');
  await department.press('Tab');
  const city = editor.getByRole('combobox', { name: 'Municipio / ciudad' });
  await expect(city).toBeFocused();
  await city.fill('puerto asis');
  await city.press('ArrowDown');
  await city.press('Enter');
  await expect(city).toHaveValue('PUERTO ASÍS');
  await city.press('ArrowDown');
  await city.press('Escape');
  await expect(city).toHaveAttribute('aria-expanded', 'false');
  await expect(editor).toBeVisible();
  await city.press('Tab');
  await expect(editor.getByLabel('Dirección', { exact: true })).toBeFocused();
});

test('descartar una selección y reabrir restablece el formulario', async ({ page }) => {
  const editor = await openNew(page);
  await selectMocoa(editor);
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('dialog', { name: '¿Descartar los cambios?' }).getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole('button', { name: 'Nueva persona', exact: true }).first().click();
  await expect(editor.getByRole('combobox', { name: 'Departamento', exact: true })).toHaveValue('');
  await expect(editor.getByRole('combobox', { name: 'Municipio / ciudad' })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test('registro rápido de cliente desde Nueva venta usa el mismo selector', async ({ page }) => {
  await page.goto('/ventas/nueva');
  await page.getByLabel('Número de documento del cliente', { exact: true }).fill('7C-PRUEBA');
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar nuevo cliente' }).click();
  const editor = page.getByRole('dialog', { name: 'Nueva persona', exact: true });
  await editor.getByLabel('Nombres', { exact: false }).fill('Cliente DIVIPOLA en venta');
  await selectMocoa(editor);
  await editor.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.locator('.selected-person')).toContainText('Cliente DIVIPOLA en venta');
  await expect(page.locator('.selected-person')).toBeFocused();
  expect(writes[0].body).toMatchObject({ departamento: 'PUTUMAYO', ciudad: 'MOCOA', roles: ['CLIENTE'] });
});
