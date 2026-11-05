import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      await route.abort("blockedbyclient");
      throw new Error(
        "Las pruebas de rediseño no pueden escribir en las bases de datos.",
      );
    }
    await route.continue();
  });
});

test("pantallas de trabajo se adaptan en ambos temas", async ({
  page,
}, testInfo) => {
  for (const theme of ["dark", "light"]) {
    await page.goto("/#/apariencia");
    await page
      .getByRole("button", {
        name: theme === "dark" ? "Oscuro" : "Claro",
        exact: true,
      })
      .click();
    for (const section of ["productos", "personas"]) {
      await page.goto(`/#/${section}`);
      await expect(page.locator(".catalog-footer")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      expect(
        await page
          .locator(".catalog-panel")
          .evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThan(page.viewportSize()!.width - 140);
      await page.screenshot({
        path: `test-results/${section}-${theme}-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  }
});

test("dashboard consulta las APIs reales y presenta sus conteos", async ({
  page,
  request,
}) => {
  const products = await request.get("/api/productos");
  const people = await request.get("/api/personas/rol/CLIENTE");
  const invoices = await request.get("/api/facturas");
  expect(products.ok()).toBeTruthy();
  expect(people.ok()).toBeTruthy();
  expect(invoices.ok()).toBeTruthy();
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("heading", { name: "Tu negocio, en perspectiva." }),
  ).toBeVisible();
  await expect(page.locator(".connection-status")).toHaveClass(/connected/);
  await expect(page.locator(".kpi > strong").nth(0)).toHaveText(
    String((await products.json()).length),
  );
  await expect(page.locator(".kpi > strong").nth(1)).toHaveText(
    String((await people.json()).length),
  );
  await expect(page.locator(".kpi > strong").nth(2)).toHaveText(
    String((await invoices.json()).length),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    await page
      .locator(".main-shell")
      .evaluate((el) => el.getBoundingClientRect().width / innerWidth),
  ).toBeGreaterThan(0.7);
  expect(
    await page
      .locator(".kpi")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(100);
  await page.screenshot({
    path: `test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("preferencias persisten y cada fondo conserva la legibilidad estructural", async ({
  page,
}) => {
  await page.goto("/#/apariencia");
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await page.getByRole("button", { name: /^Bosque / }).click();
  await page.getByLabel("Desenfoque del fondo").fill("28");
  await page.getByLabel("Opacidad de los paneles").fill("75");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-background",
    "bosque",
  );
  await expect(page.getByLabel("Desenfoque del fondo")).toHaveValue("28");
  expect(
    await page
      .locator(".appearance-section")
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain("blur(28px)");
  await expect(page.getByLabel("Opacidad de los paneles")).toHaveValue("75");
  await expect(
    page.getByRole("button", { name: "Claro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/appearance-light-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Restaurar apariencia" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("Desenfoque del fondo")).toHaveValue("26");
  await expect(page.getByLabel("Opacidad de los paneles")).toHaveValue("68");
});

test("el descarte se confirma sobre el producto sin perder el formulario", async ({
  page,
}) => {
  await page.goto("/#/productos");
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Nuevo producto" });
  await drawer
    .getByLabel("Nombre", { exact: false })
    .fill("Borrador sin guardar");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "¿A dónde quieres ir?" }),
  ).not.toBeVisible();
  await drawer.getByRole("button", { name: "Cancelar", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "¿Descartar los cambios?" });
  await expect(confirm).toBeVisible();
  expect(
    await confirm.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(500);
  expect(
    await drawer.evaluate((el) => (el as HTMLDialogElement).open),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/discard-${test.info().project.name}.png`,
  });
  await confirm.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(drawer.getByLabel("Nombre", { exact: false })).toHaveValue(
    "Borrador sin guardar",
  );
  await drawer.getByRole("button", { name: "Guardar producto" }).click();
  await expect(drawer.getByText("Escribe el SKU del producto.")).toBeVisible();
  await expect(drawer.locator('input[name="sku"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await confirm.getByRole("button", { name: "Sí, continuar" }).click();
  await expect(drawer).not.toBeVisible();
});

test("personas valida correo, permite varios roles y conserva el borrador", async ({
  page,
}) => {
  await page.goto("/#/personas");
  await page
    .getByRole("button", { name: "Nueva persona", exact: true })
    .first()
    .click();
  const drawer = page.getByRole("dialog", { name: "Nueva persona" });
  await drawer
    .getByLabel("Nombres", { exact: false })
    .fill("Borrador de prueba");
  await drawer
    .getByLabel("Correo electrónico", { exact: true })
    .fill("correo-invalido");
  await drawer.getByLabel("Proveedor", { exact: true }).check();
  await drawer.getByRole("button", { name: "Guardar persona" }).click();
  await expect(
    drawer.getByText("Escribe un correo válido, como nombre@correo.com."),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Cancelar" }).click();
  await page
    .getByRole("dialog", { name: "¿Descartar los cambios?" })
    .getByRole("button", { name: "Volver", exact: true })
    .click();
  await expect(drawer.getByLabel("Proveedor", { exact: true })).toBeChecked();
  await expect(
    drawer.getByLabel("Correo electrónico", { exact: true }),
  ).toHaveValue("correo-invalido");
});

test("la barra permanece visible, respeta historial y permite ventas", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  const rail = page.locator(".sidebar");
  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", { name: /Abrir menú|Expandir menú|Contraer menú/ })).toHaveCount(0);
  const originalBox = await rail.boundingBox();
  expect(originalBox!.width).toBe(page.viewportSize()!.width < 768 ? 72 : 84);
  expect(await rail.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBe(28);
  await expect(navigation.getByRole("link", { name: "Productos", exact: true })).toHaveAttribute("title", "Productos");
  await navigation.getByRole("link", { name: "Productos", exact: true }).hover();
  await expect(rail).toHaveCSS("width", `${originalBox!.width}px`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect((await rail.boundingBox())!.y).toBe(originalBox!.y);
  await expect(navigation).toBeVisible();
  await page.reload();
  await expect(rail).toHaveCSS("width", `${originalBox!.width}px`);
  await navigation.getByRole("link", { name: "Productos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Productos." })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Tu negocio, en perspectiva." }),
  ).toBeVisible();
  await page.goto("/#/venta");
  await expect(
    page.getByRole("heading", { name: "Punto de venta." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generar factura", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("un fallo de API se comunica y permite reintentar sin mostrar datos ficticios", async ({
  page,
}) => {
  await page.route("**/api/productos", (route) =>
    route.abort("connectionfailed"),
  );
  await page.goto("/#/productos");
  await expect(page.getByRole("alert")).toContainText(
    "No pudimos conectar con el servidor",
  );
  await expect(page.locator(".product-card")).toHaveCount(0);
  await page.unroute("**/api/productos");
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".catalog-footer")).toBeVisible();
});

test("movimiento reducido y búsqueda de secciones funcionan con teclado", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/dashboard");
  await page.keyboard.press("Control+k");
  const finder = page.getByRole("dialog", { name: "¿A dónde quieres ir?" });
  await expect(finder).toBeVisible();
  await finder
    .getByRole("textbox", { name: "Buscar una sección" })
    .fill("configuración");
  await finder.getByRole("button", { name: "Configuración visual" }).click();
  await expect(
    page.getByRole("heading", { name: "A tu manera." }),
  ).toBeVisible();
  const duration = await page
    .locator(".page-content")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
});
