import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = new URL("../../docs/capturas/fase6a1/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1249, height: 1295 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const base = process.env.UI_BASE_URL || "http://127.0.0.1:5174";
  await page.goto(`${base}/#/dashboard`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL("nexo-despues.png", output)),
    fullPage: false,
  });
  const measures = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    font: getComputedStyle(document.body).fontFamily,
    nodes: [
      ".sidebar",
      ".topbar",
      ".dashboard-title",
      ".sales-hero",
      ".invoice-activity",
      ".kpi-grid",
      ".kpi",
    ].map((selector) => {
      const el = document.querySelector(selector);
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        selector,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        radius: style.borderRadius,
        blur: style.backdropFilter,
      };
    }),
  }));
  await writeFile(
    new URL("nexo-medidas.json", output),
    JSON.stringify(measures, null, 2),
  );
  console.log(JSON.stringify(measures));
  for (const [name, viewport] of [
    ["tablet", { width: 768, height: 1024 }],
    ["movil", { width: 375, height: 812 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: fileURLToPath(new URL(`nexo-${name}.png`, output)),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1249, height: 1295 });
  for (const section of ["productos", "personas", "apariencia"]) {
    await page.goto(`${base}/#/${section}`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: fileURLToPath(new URL(`nexo-${section}.png`, output)),
      fullPage: false,
    });
  }
  await page.goto(`${base}/#/productos`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Nuevo producto" })
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: fileURLToPath(new URL("nexo-formulario.png", output)),
    animations: "disabled",
  });
  await page
    .getByRole("dialog", { name: "Nuevo producto" })
    .getByRole("button", { name: "Cerrar panel" })
    .click();
  await page.goto(`${base}/#/apariencia`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await page.goto(`${base}/#/dashboard`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: fileURLToPath(new URL("nexo-oscuro.png", output)),
    fullPage: false,
  });
} finally {
  await browser.close();
}
