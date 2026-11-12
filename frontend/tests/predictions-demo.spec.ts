import { test, expect } from '@playwright/test';

const metrics = { mae: '17500.25', wape: '5.22', maeReferencia: '29500.00', wapeReferencia: '8.80', mejoraReferencia: '40.68', diasEvaluacion: 14, finEntrenamientoEvaluacion: '2026-10-28', inicioEvaluacion: '2026-10-29', finEvaluacion: '2026-11-11' };
const model = { version: 'ridge-diaria-v1', algoritmo: 'Ridge', alpha: '1.0', fechaEntrenamiento: '2026-11-12T19:00:00Z', inicioDatos: '2026-08-14', finDatos: '2026-11-11', observaciones: 90, totalHistorico: '30000000.25', metricas: metrics };
const initial = { habilitado: true, disponible: true, entrenado: false, entrenando: false, estado: 'MODELO_NO_ENTRENADO', ultimaFechaEntrenamiento: null, modelo: null, mensaje: null };
const demoResponse = (resultado: unknown) => ({ modo: 'DEMOSTRACION', datosSimulados: true, resultado });

test('selector separa los modelos, entrena explícitamente y mantiene visible la procedencia', async ({ page }) => {
  let trained = false; let demoTrainings = 0; let realTrainings = 0; const horizons: number[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'OK' } });
    if (url.pathname === '/api/predicciones/estado') return route.fulfill({ json: initial });
    if (url.pathname === '/api/predicciones/entrenar') {
      realTrainings++;
      return route.fulfill({ status: 422, json: { detail: 'Se necesitan al menos 56 días completos' } });
    }
    if (url.pathname === '/api/predicciones/demo/estado') return route.fulfill({ json: demoResponse({ ...initial, entrenado: trained, modelo: trained ? model : null }) });
    if (url.pathname === '/api/predicciones/demo/entrenar') {
      demoTrainings++; await new Promise(resolve => setTimeout(resolve, 300)); trained = true;
      return route.fulfill({ json: demoResponse(model) });
    }
    if (url.pathname === '/api/predicciones/demo/ventas') {
      const horizon = Number(url.searchParams.get('horizonte')); horizons.push(horizon);
      return route.fulfill({ json: demoResponse({
        horizonte: horizon, estado: 'LISTO', totalProyectado: `${horizon * 350000}.00`, promedioDiario: '350000.00', modelo: model,
        historico: Array.from({ length: 90 }, (_, i) => ({ fecha: new Date(Date.UTC(2026, 7, 14 + i)).toISOString().slice(0, 10), total: `${280000 + i * 600}.25` })),
        predicciones: Array.from({ length: horizon }, (_, i) => ({ fecha: `2026-11-${12 + i}`, total: '350000.00' })),
      }) });
    }
    throw new Error(`La demostración no debe consultar ni escribir datos de negocio: ${url.pathname}`);
  });
  await page.goto('/predicciones');
  await page.getByRole('radio', { name: 'Demostración', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Tu demostración está lista para entrenar' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Aviso de datos simulados' })).toBeVisible();
  expect(demoTrainings).toBe(0);
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('radio', { name: 'Datos reales', exact: true })).toBeDisabled();
  await expect(page.getByRole('complementary', { name: 'Aviso de datos simulados' })).toBeVisible();
  await expect(page.locator('.prediction-kpi')).toHaveCount(4);
  await expect(page.getByRole('img', { name: /Datos simulados de los últimos 90 días/ })).toBeVisible();
  await expect(page.locator('.prediction-metrics')).toContainText('5.22%');
  await page.getByLabel('Horizonte de predicción').selectOption('14');
  await expect(page.locator('.prediction-kpi').nth(1)).toContainText('$ 4.900.000');
  expect(horizons).toEqual([7,14]);
  await page.getByText('Ver valores diarios exactos').click();
  await expect(page.getByRole('cell', { name: 'Simulado', exact: true })).toHaveCount(90);
  await expect(page.getByRole('cell', { name: 'Predicción simulada', exact: true })).toHaveCount(14);
  await expect(page.getByRole('cell', { name: 'Real', exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Datos reales', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Tu modelo está pendiente de entrenamiento' })).toBeVisible();
  await expect(page.locator('.prediction-kpi')).toHaveCount(0);
  await expect(page.locator('.prediction-metrics')).toHaveCount(0);
  await expect(page.locator('.prediction-demo-banner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('alert')).toContainText('56 días');
  expect(realTrainings).toBe(1); expect(demoTrainings).toBe(1);
  await page.getByRole('radio', { name: 'Demostración', exact: true }).check();
  await expect(page.locator('.prediction-kpi')).toHaveCount(4);
  expect(demoTrainings).toBe(1);
});

test('deshabilitada por defecto, errores y respuestas sin origen nunca muestran predicciones', async ({ page }) => {
  let scenario = 'disabled';
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { status: 'OK' } });
    if (!path.includes('/demo/')) return route.fulfill({ json: initial });
    if (scenario === 'unmarked') return route.fulfill({ json: initial });
    if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { detail: 'No se pudo guardar el modelo de demostración' } });
    return route.fulfill({ json: demoResponse({ ...initial, habilitado: scenario !== 'disabled' }) });
  });
  await page.goto('/predicciones');
  await page.getByRole('radio', { name: 'Demostración', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Demostración deshabilitada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeDisabled();
  scenario = 'enabled';
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
  await expect(page.getByRole('complementary', { name: 'Aviso de datos simulados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeEnabled();
  scenario = 'unmarked';
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('alert')).toContainText('no identificó los datos de demostración');
  await expect(page.locator('.prediction-kpi')).toHaveCount(0);
});
