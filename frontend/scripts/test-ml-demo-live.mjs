// Prueba de navegador con Spring/FastAPI reales. Solo escribe el modelo demo.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const isolatedPort = process.argv[2] ? Number(process.argv[2]) : null;
if (isolatedPort !== null) assert.ok(Number.isInteger(isolatedPort) && isolatedPort > 0 && isolatedPort < 65536);
const apiBase = isolatedPort ? `http://127.0.0.1:${isolatedPort}` : (process.env.ML_API_BASE_URL || 'http://127.0.0.1:8080');
const uiBase = process.env.ML_UI_BASE_URL || (isolatedPort ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5173');
const root = resolve(import.meta.dirname, '../..');
const screenshots = resolve(root, 'docs/capturas/fase8b');
await mkdir(screenshots, { recursive: true });
async function api(path) {
  const response = await fetch(`${apiBase}/api/predicciones${path}`);
  assert.equal(response.status, 200);
  return response.json();
}
const before = await api('/estado');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'es-CO', timezoneId: 'America/Bogota', reducedMotion: 'reduce' });
  if (isolatedPort) {
    // Reenvío HTTP a Spring aislado; nunca fabrica cuerpos ni sustituye predicciones.
    await page.route('**/api/**', async route => {
      const original = new URL(route.request().url());
      const response = await route.fetch({ url: `${apiBase}${original.pathname}${original.search}` });
      await route.fulfill({ response });
    });
  }
  await page.goto(`${uiBase}/predicciones`);
  await page.getByRole('radio', { name: 'Demostración', exact: true }).check();
  await expect(page.getByRole('complementary', { name: 'Aviso de datos simulados' })).toBeVisible();
  const training = page.waitForResponse(response => response.url().endsWith('/api/predicciones/demo/entrenar') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrenar modelo' }).click();
  const trained = await training;
  assert.equal(trained.status(), 200);
  const metadata = (await trained.json()).resultado;
  assert.equal(metadata.observaciones, 90);
  assert.equal(metadata.metricas.diasEvaluacion, 14);
  await expect(page.locator('.prediction-kpi')).toHaveCount(4);
  await expect(page.getByRole('img', { name: /Datos simulados de los últimos 90 días/ })).toBeVisible();
  await expect(page.locator('.prediction-metrics')).toContainText(`${metadata.metricas.wape}%`);
  const seven = (await api('/demo/ventas?horizonte=7')).resultado;
  assert.equal(seven.predicciones.length, 7);
  await page.getByLabel('Horizonte de predicción').selectOption('14');
  await expect(page.locator('.prediction-point')).toHaveCount(14);
  const fourteen = (await api('/demo/ventas?horizonte=14')).resultado;
  assert.equal(fourteen.predicciones.length, 14);
  assert.equal(fourteen.historico.length, 90);
  assert.ok(fourteen.predicciones.every(row => Number(row.total) >= 0));
  await page.getByText('Ver valores diarios exactos').click();
  await expect(page.getByRole('cell', { name: 'Simulado', exact: true })).toHaveCount(90);
  await expect(page.getByRole('cell', { name: 'Predicción simulada', exact: true })).toHaveCount(14);
  await page.getByText('Ver valores diarios exactos').click();
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 375, 812]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      const current = await page.locator('html').getAttribute('data-theme');
      if (current !== theme) await page.getByRole('button', { name: theme === 'dark' ? 'Activar modo oscuro' : 'Activar modo claro' }).click();
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: resolve(screenshots, `demo-${theme}-${name}.png`), fullPage: true });
    }
  }
  await page.getByRole('radio', { name: 'Datos reales', exact: true }).check();
  await expect(page.locator('.prediction-demo-banner')).toHaveCount(0);
  assert.deepEqual(await api('/estado'), before, 'La demostración no cambia el modelo real');
  const evidence = { entorno: isolatedPort ? 'Spring y Python aislados; HTTP real' : 'Docker local; HTTP real', fecha: new Date().toISOString(), observaciones: metadata.observaciones, metricas: metadata.metricas, total7: seven.totalProyectado, total14: fourteen.totalProyectado, estadoRealSinCambios: true };
  await mkdir(resolve(root, 'target'), { recursive: true });
  await writeFile(resolve(root, 'target/fase8b-live-ui.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
