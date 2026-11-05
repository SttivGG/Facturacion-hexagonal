import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      await route.abort("blockedbyclient");
      throw Error("Escritura de API prohibida en la verificación visual.");
    }
    await route.continue();
  });
});

test("un fallo de facturación se distingue de una actividad vacía", async ({
  page,
}) => {
  await page.route("**/api/facturas", (route) =>
    route.abort("connectionfailed"),
  );
  await page.goto("/#/dashboard");
  const activity = page.getByRole("region", {
    name: "Actividad de facturación",
  });
  await expect(
    activity.getByText("No disponible", { exact: true }),
  ).toBeVisible();
  await expect(activity.locator(".activity-total strong")).toHaveText("—");
  await expect(activity.getByRole("alert")).toBeVisible();
  await expect(activity.locator(".invoice-bar")).toHaveCount(0);
});

test("inicia claro y compacto aunque existan preferencias de la versión anterior", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nexo.appearance",
      JSON.stringify({ theme: "dark", background: "bosque", frost: 8 }),
    );
    localStorage.setItem("nexo.sidebar", "false");
    localStorage.setItem("nexo.sidebar.v2", "false");
  });
  await page.goto("/#/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cada venta comienza aquí." }),
  ).toBeVisible();
  await expect(page.locator(".hero-photo")).toBeVisible();
  expect(
    await page
      .locator(".hero-photo")
      .evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  if (info.project.name === "desktop")
    expect(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(84);
});

test("respeta la composición de referencia a 1249 por 1295", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1249, height: 1295 });
  await page.goto("/#/dashboard");
  await expect(page.locator(".kpi > strong").first()).not.toHaveText("—");
  const boxes = await page.evaluate(() =>
    Object.fromEntries(
      [
        ".sidebar",
        ".topbar",
        ".sales-hero",
        ".invoice-activity",
        ".kpi-grid",
        ".kpi",
      ].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return [
          selector,
          { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ];
      }),
    ),
  );
  expect(boxes[".sidebar"].width).toBeCloseTo(84, 2);
  expect(boxes[".topbar"].height).toBeCloseTo(64, 2);
  expect(boxes[".sales-hero"].height).toBeCloseTo(470, 2);
  expect(Math.abs(boxes[".sales-hero"].y - 188)).toBeLessThan(4);
  expect(boxes[".invoice-activity"].height).toBeCloseTo(267, 2);
  expect(boxes[".invoice-activity"].y).toBeGreaterThan(boxes[".sales-hero"].y);
  expect(boxes[".kpi-grid"].y).toBeGreaterThan(boxes[".invoice-activity"].y);
  expect(boxes[".kpi"].height).toBeCloseTo(128, 2);
  const styles = await page.locator("body").evaluate((el) => ({
    font: getComputedStyle(el).fontFamily,
    accent: getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim(),
  }));
  expect(styles.font).toContain("Urbanist");
  expect(styles.accent.toUpperCase()).toBe("#F58136");
  for (const selector of [".sidebar", ".topbar", ".invoice-activity"]) {
    expect(
      await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).backdropFilter),
    ).toContain("blur(26px)");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("todas las rutas y las imágenes reales siguen disponibles sin escrituras", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    "dashboard",
    "productos",
    "personas",
    "facturas",
    "venta",
    "creditos",
    "apariencia",
  ]) {
    await page.goto(`/#/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  const products = await (await request.get("/api/productos")).json();
  const productWithImage = products.find(
    (product: { imagenId?: string }) => product.imagenId,
  );
  if (productWithImage) {
    const response = await request.get(
      `/api/productos/${encodeURIComponent(productWithImage.id)}/imagen`,
    );
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toMatch(/^image\//);
    await page.goto("/#/productos");
    await expect(
      page
        .getByRole("img", { name: productWithImage.nombre, exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Vista de tabla" }).click();
    await expect(page.getByRole("table")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
