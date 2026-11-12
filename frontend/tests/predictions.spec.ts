import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const metrics = { mae: '1250.25', wape: '12.50', maeReferencia: '1700.00', wapeReferencia: '17.00', mejoraReferencia: '26.46', diasEvaluacion: 14, finEntrenamientoEvaluacion: '2026-10-28', inicioEvaluacion: '2026-10-29', finEvaluacion: '2026-11-11' };
const model = { version: 'ridge-diaria-v1', algoritmo: 'Ridge', alpha: '1.0', fechaEntrenamiento: '2026-11-12T15:00:00Z', inicioDatos: '2026-09-03', finDatos: '2026-11-11', observaciones: 70, totalHistorico: '700000.25', metricas: metrics };
const initial = { habilitado: true, disponible: true, entrenado: false, entrenando: false, estado: 'MODELO_NO_ENTRENADO', ultimaFechaEntrenamiento: null, modelo: null, mensaje: null };

test('estados deshabilitado, no disponible y pendiente no inventan cifras', async ({ page }) => {
  let state = { ...initial, habilitado: false, disponible: false, estado: 'DESHABILITADO' };
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/predicciones/estado') ? state : { status: 'OK' } }));
  await page.goto('/predicciones');
  await expect(page.getByRole('heading', { name: 'Predicciones deshabilitadas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeDisabled();
  await expect(page.locator('.prediction-kpi')).toHaveCount(0);
  state = { ...initial, disponible: false, estado: 'SERVICIO_NO_DISPONIBLE' };
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('heading', { name: 'Servicio ML no disponible' })).toBeVisible();
  state = { ...initial };
  await page.getByRole('button', { name: 'Actualizar estado' }).click();
  await expect(page.getByRole('heading', { name: 'Tu modelo está pendiente de entrenamiento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeEnabled();
});

test('entrenamiento explícito, bloqueo de duplicados, horizontes y presentación accesible', async ({ page }, info) => {
  let trained = false; let trainings = 0; const horizons: number[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url());
    if (path.pathname === '/api/predicciones/estado') return route.fulfill({ json: { ...initial, entrenado: trained, modelo: trained ? model : null } });
    if (path.pathname === '/api/predicciones/entrenar') {
      trainings++; await new Promise(resolve => setTimeout(resolve, 300)); trained = true;
      return route.fulfill({ json: model });
    }
    if (path.pathname === '/api/predicciones/ventas') {
      const horizon = Number(path.searchParams.get('horizonte')); horizons.push(horizon);
      return route.fulfill({ json: {
        horizonte: horizon, estado: 'LISTO', totalProyectado: `${horizon * 10000}.00`, promedioDiario: '10000.00', modelo: model,
        historico: Array.from({ length: 70 }, (_, i) => ({ fecha: new Date(Date.UTC(2026, 8, 3 + i)).toISOString().slice(0, 10), total: `${8500 + i * 30 + (i % 7) * 200}.25` })),
        predicciones: Array.from({ length: horizon }, (_, i) => ({ fecha: `2026-11-${12 + i}`, total: '10000.00' })),
      } });
    }
    if (route.request().method() !== 'GET') throw Error('Escritura fuera de ML');
    return route.fulfill({ json: { status: 'OK' } });
  });
  await page.goto('/predicciones');
  await expect(page.getByRole('heading', { name: 'Predicciones inteligentes', exact: true })).toBeVisible();
  expect(trainings).toBe(0);
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeDisabled();
  await expect(page.getByLabel('Horizonte de predicción')).toBeDisabled();
  await expect(page.locator('.prediction-kpi')).toHaveCount(4);
  expect(trainings).toBe(1);
  await expect(page.locator('.prediction-kpi').nth(1)).toContainText('$ 70.000');
  await page.getByLabel('Horizonte de predicción').selectOption('14');
  await expect(page.locator('.prediction-kpi').nth(1)).toContainText('$ 140.000');
  expect(horizons).toEqual([7,14]);
  await expect(page.getByRole('img', { name: /Valor facturado real/ })).toBeVisible();
  await page.getByText('Ver valores diarios exactos').click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Predicción', exact: true })).toHaveCount(14);
  await page.getByText('Ver valores diarios exactos').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir('../docs/capturas/fase8', { recursive: true });
  for (const theme of ['light','dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `../docs/capturas/fase8/predicciones-${theme}-${info.project.name}.png`, fullPage: true });
  }
});

test('datos insuficientes y fallo de entrenamiento se pueden reintentar', async ({ page }) => {
  let fail = 422;
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: fail, json: { codigo: fail === 422 ? 'DATOS_INSUFICIENTES' : 'SERVICIO_NO_DISPONIBLE', detail: fail === 422 ? 'Se necesitan 56 días completos de historial' : 'El servicio ML no responde' } });
    return route.fulfill({ json: route.request().url().includes('/predicciones/estado') ? initial : { status: 'OK' } });
  });
  await page.goto('/predicciones');
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('alert')).toContainText('56 días completos');
  await expect(page.locator('.prediction-kpi')).toHaveCount(0);
  fail = 503;
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  await expect(page.getByRole('alert')).toContainText('El servicio ML no responde');
  await expect(page.getByRole('button', { name: 'Entrenar modelo' })).toBeEnabled();
});

test('modelo desactualizado y WAPE sin ventas son explícitos', async ({ page }) => {
  const stale = { ...model, metricas: { ...metrics, wape: null, wapeReferencia: null, mejoraReferencia: null } };
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/ventas?') ? {
    horizonte: 7, estado: 'MODELO_DESACTUALIZADO', predicciones: [{ fecha: '2026-11-12', total: '0.00' }], totalProyectado: '0.00', promedioDiario: '0.00', historico: [{ fecha: '2026-11-11', total: '0.00' }], modelo: stale,
  } : route.request().url().includes('/predicciones/estado') ? { ...initial, entrenado: true, modelo: stale } : { status: 'OK' } }));
  await page.goto('/predicciones');
  await expect(page.getByText('Modelo desactualizado.', { exact: true })).toBeVisible();
  await expect(page.getByText('No calculable', { exact: true })).toBeVisible();
});
