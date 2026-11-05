import { test, expect, type Page } from "@playwright/test";

const customer = { id: "11111111-1111-4111-8111-111111111111", tipoDocumento: "CC", numeroDocumento: "123", nombres: "Cliente prueba", apellidos: "Nexo", roles: ["CLIENTE"], activo: true, correo: "cliente@example.test" };
const products = [
  { id: "p1", nombre: "Café de origen", sku: "CAF-01", categoria: "Bebidas", precioVenta: "10000.25", activo: true, imagenId: null },
  { id: "p2", nombre: "Galleta", sku: "GAL-02", categoria: "Alimentos", precioVenta: "2000.10", activo: true, imagenId: null },
  { id: "p3", nombre: "Producto retirado", sku: "OLD", categoria: "Otros", precioVenta: "1.00", activo: false, imagenId: null },
];
const baseInvoice = {
  id: 42, numeroFactura: "FAC-42", clienteId: customer.id, vendedorId: "22222222-2222-4222-8222-222222222222", clienteNombre: "Cliente prueba Nexo", clienteDocumento: "CC 123",
  fechaEmision: "2026-11-05T15:00:00Z", fechaVencimiento: "2099-12-15", modalidad: "CREDITO", subtotal: "20000.50", impuestos: "0.00", total: "20000.50", totalPagado: "5000.00", saldoPendiente: "15000.50", estado: "PARCIAL",
  detalles: [{ id: 1, productoId: "p1", sku: "CAF-HIST", nombreProducto: "Café histórico", cantidad: 2, precioUnitario: "10000.25", subtotal: "20000.50", total: "20000.50" }],
  pagos: [{ id: 1, facturaId: 42, fechaPago: "2026-11-05T15:00:00Z", metodoPago: "NEQUI", monto: "5000.00", referencia: "INICIAL", observaciones: "Pago de prueba" }],
};
type Invoice = typeof baseInvoice;
let invoice: Invoice;
let writes: { path: string; body: any }[];

test.beforeEach(async ({ page }) => {
  invoice = structuredClone(baseInvoice); writes = [];
  await page.route("**/api/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method() !== "GET") writes.push({ path, body: req.postDataJSON() });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/api/health") return json({ status: "OK" });
    if (path === "/api/productos") return json(products);
    if (path.startsWith("/api/personas/documento/")) return json(customer);
    if (path === "/api/personas") return json({ ...customer, ...req.postDataJSON() }, 201);
    if (path === "/api/facturas/42/pagos") {
      const body = req.postDataJSON();
      invoice = { ...invoice, totalPagado: invoice.total, saldoPendiente: "0.00", estado: "PAGADA", pagos: [...invoice.pagos, { id: 2, facturaId: 42, fechaPago: "2026-11-05T17:00:00Z", ...body }] };
      await new Promise(resolve => setTimeout(resolve, 200)); return json(invoice);
    }
    if (path === "/api/facturas/42") return json(invoice);
    if (path === "/api/facturas") {
      if (req.method() === "POST") { await new Promise(resolve => setTimeout(resolve, 200)); return json(invoice, 201); }
      return json([invoice, { ...invoice, id: 43, numeroFactura: "FAC-43", clienteNombre: "Cliente contado", modalidad: "CONTADO", estado: "PAGADA", saldoPendiente: "0", fechaVencimiento: null }]);
    }
    return json([], 200);
  });
});

async function selectCustomer(page: Page) {
  await page.getByLabel("Número de documento del cliente", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
  await expect(page.locator(".selected-person")).toContainText("Cliente prueba");
}
async function startSale(page: Page) {
  await page.goto("/ventas/nueva");
  await selectCustomer(page);
  await page.getByRole("button", { name: "Agregar Café de origen", exact: true }).click();
}
async function credit(page: Page) {
  await page.getByLabel("Modalidad de venta", { exact: true }).selectOption("CREDITO");
  await page.getByLabel("Fecha de vencimiento", { exact: false }).fill("2099-12-15");
}

test("busca clientes por documento y rechaza personas inactivas o sin rol", async ({ page }) => {
  await page.goto("/ventas/nueva");
  for (const record of [{ ...customer, activo: false }, { ...customer, roles: ["PROVEEDOR"] }]) {
    await page.route("**/api/personas/documento/**", route => route.fulfill({ json: record }));
    await page.getByLabel("Número de documento del cliente", { exact: true }).fill("123");
    await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("activa y tener rol Cliente");
    await expect(page.locator(".selected-person")).toHaveCount(0);
  }
  await page.route("**/api/personas/documento/**", route => route.fulfill({ json: customer }));
  await selectCustomer(page);
  await expect(page.locator(".selected-person")).toContainText("CC 123");
});

test("registra un cliente ausente con el editor de Personas y lo selecciona", async ({ page }) => {
  await page.route("**/api/personas/documento/**", route => route.fulfill({ status: 404, json: { detail: "Persona no encontrada" } }));
  await page.goto("/ventas/nueva");
  await page.getByLabel("Número de documento del cliente", { exact: true }).fill("456");
  await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
  await page.getByRole("button", { name: "Registrar nuevo cliente" }).click();
  const editor = page.getByRole("dialog", { name: "Nueva persona", exact: true });
  await expect(editor.getByLabel("Número de documento", { exact: false })).toHaveValue("456");
  await editor.getByLabel("Nombres", { exact: false }).fill("Cliente creado en venta");
  await editor.getByRole("button", { name: "Guardar persona" }).click();
  await expect(page.locator(".selected-person")).toContainText("Cliente creado en venta");
  await expect(page.locator(".selected-person")).toBeFocused();
  expect(writes[0].body.roles).toEqual(["CLIENTE"]);
});

test("busca nombre y SKU, filtra categoría y excluye inactivos", async ({ page }) => {
  await page.goto("/ventas/nueva");
  await expect(page.locator(".pos-product")).toHaveCount(2);
  await page.getByRole("searchbox").fill("CAF-01");
  await expect(page.locator(".pos-product")).toHaveCount(1);
  await expect(page.locator(".pos-product")).toContainText("Café de origen");
  await page.getByRole("searchbox").fill("galleta");
  await expect(page.locator(".pos-product")).toContainText("GAL-02");
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Categoría", { exact: true }).selectOption("Bebidas");
  await expect(page.locator(".pos-product")).toHaveCount(1);
  await expect(page.getByText("Producto retirado", { exact: true })).toHaveCount(0);
});

test("carrito actualiza cantidades, subtotal decimal, impuestos y eliminaciones", async ({ page }) => {
  await page.goto("/ventas/nueva");
  await page.getByRole("button", { name: "Agregar Café de origen", exact: true }).click();
  await page.getByRole("button", { name: "Agregar Café de origen", exact: true }).click();
  await page.getByRole("button", { name: "Agregar Galleta", exact: true }).click();
  await expect(page.getByTestId("sale-total")).toHaveText("$ 22.000,60");
  await page.getByLabel("Cantidad de Café de origen", { exact: true }).fill("3");
  await expect(page.getByTestId("sale-total")).toHaveText("$ 32.000,85");
  await page.getByRole("button", { name: "Eliminar Galleta", exact: true }).click();
  await expect(page.getByTestId("sale-total")).toHaveText("$ 30.000,75");
  await expect(page.locator(".cart-line")).toHaveCount(1);
});

test("contado admite pagos combinados exactos y bloquea doble envío", async ({ page }) => {
  await startSale(page);
  await page.getByRole("button", { name: "Agregar pago", exact: true }).click();
  await page.getByLabel("Monto COP 1", { exact: false }).fill("6000.10");
  await page.getByRole("button", { name: "Agregar pago", exact: true }).click();
  await page.getByLabel("Método de pago 2", { exact: true }).selectOption("NEQUI");
  await expect(page.getByLabel("Monto COP 2", { exact: false })).toHaveValue("4000.15");
  await expect(page.getByTestId("sale-remaining")).toHaveText("$ 0");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "¿Generar esta factura?" });
  await confirm.getByRole("button", { name: "Confirmar", exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  await expect(page.getByRole("heading", { name: "Factura generada." })).toBeVisible();
  await expect(page.locator(".sale-success")).toBeFocused();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({ clienteId: customer.id, modalidad: "CONTADO", detalles: [{ productoId: "p1", cantidad: 1 }], pagosIniciales: [{ metodoPago: "EFECTIVO", monto: "6000.10", referencia: "", observaciones: "" }, { metodoPago: "NEQUI", monto: "4000.15", referencia: "", observaciones: "" }] });
  await expect(page.getByRole("link", { name: "Consultar o imprimir comprobante" })).toHaveAttribute("href", "/facturas/42");
});

test("crédito exige vencimiento y admite venta sin inicial ni vendedor", async ({ page }) => {
  await startSale(page);
  await page.getByLabel("Modalidad de venta").selectOption("CREDITO");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("requiere vencimiento");
  await page.getByLabel("Fecha de vencimiento", { exact: false }).fill("2099-12-15");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Factura generada." })).toBeVisible();
  expect(writes[0].body).toMatchObject({ modalidad: "CREDITO", fechaVencimiento: "2099-12-15", pagosIniciales: [] });
  expect(writes[0].body).not.toHaveProperty("vendedorId");
});

test("valida pagos negativos, decimales, exceso y contado incompleto", async ({ page }) => {
  await startSale(page);
  await page.getByRole("button", { name: "Agregar pago", exact: true }).click();
  for (const [amount, message] of [["-1", "positivo"], ["1.001", "dos decimales"], ["10000.26", "superan"], ["1", "exactamente"]]) {
    await page.getByLabel("Monto COP 1", { exact: false }).fill(amount);
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(message);
  }
  expect(writes).toHaveLength(0);
});

test("crédito con inicial y vendedor usa los enumerados y DTO reales", async ({ page }) => {
  await startSale(page); await credit(page);
  await page.getByText("Asignar vendedor (opcional)", { exact: true }).click();
  await page.route("**/api/personas/documento/CC/789", route => route.fulfill({ json: { ...customer, id: "seller-id", nombres: "Vendedor", roles: ["TRABAJADOR"] } }));
  await page.getByLabel("Número de documento del vendedor", { exact: true }).fill("789");
  await page.getByRole("button", { name: "Buscar vendedor", exact: true }).click();
  await page.getByRole("button", { name: "Agregar pago", exact: true }).click();
  await page.getByLabel("Monto COP 1", { exact: false }).fill("1000.25");
  await page.getByLabel("Método de pago 1", { exact: true }).selectOption("TRANSFERENCIA");
  await expect(page.getByTestId("sale-remaining")).toHaveText("$ 9.000");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Factura generada." })).toBeVisible();
  expect(writes[0].body).toMatchObject({ vendedorId: "seller-id", modalidad: "CREDITO", pagosIniciales: [{ metodoPago: "TRANSFERENCIA", monto: "1000.25" }] });
});

test("errores HTTP de validación preservan carrito y muestran detalle de campos", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/facturas", async route => { posts++; await route.fulfill({ status: 400, json: { detail: "Datos de entrada inválidos", errores: { clienteId: "Revisa el cliente" } } }); });
  await startSale(page); await credit(page);
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Revisa el cliente");
  await expect(page.locator(".cart-line")).toHaveCount(1);
  expect(posts).toBe(1);
});

test("creación incierta bloquea repetición y ofrece comprobar historial", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/facturas", route => { posts++; return route.abort("connectionfailed"); });
  await startSale(page); await credit(page);
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("podría haberse guardado");
  await expect(page.getByRole("button", { name: "Generar factura", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Comprobar historial antes de repetir" })).toHaveAttribute("href", "/facturas");
  expect(posts).toBe(1);
});

test("historial filtra por cliente, modalidad, estado y fecha; créditos excluye contado", async ({ page }) => {
  await page.goto("/facturas");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("searchbox").fill("FAC-42"); await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Modalidad", { exact: true }).selectOption("CONTADO"); await expect(page.locator("tbody tr")).toContainText("Cliente contado");
  await page.getByLabel("Modalidad", { exact: true }).selectOption("");
  await page.getByLabel("Estado de factura").selectOption("PARCIAL"); await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Fecha desde").fill("2099-01-01"); await expect(page.getByText("Sin facturas para mostrar")).toBeVisible();
  await page.goto("/creditos"); await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("15 de dic de 2099");
});

test("detalle usa exclusivamente snapshot histórico e imprime un comprobante limpio", async ({ page }, info) => {
  let productReads = 0;
  page.on("request", req => { if (req.url().includes("/api/productos")) productReads++; });
  await page.addInitScript(() => { (window as any).printCount = 0; window.print = () => { (window as any).printCount++; }; });
  await page.goto("/facturas/42");
  await expect(page.getByRole("article")).toContainText("Café histórico");
  await expect(page.getByRole("article")).toContainText("CAF-HIST");
  await expect(page.getByRole("article")).toContainText(baseInvoice.vendedorId);
  expect(productReads).toBe(0);
  await page.getByRole("button", { name: "Imprimir comprobante" }).click();
  expect(await page.evaluate(() => (window as any).printCount)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).not.toBeVisible(); await expect(page.locator(".topbar")).not.toBeVisible();
  await expect(page.getByRole("article")).toBeVisible();
  if (info.project.name === "desktop") await page.pdf({ path: "../docs/capturas/fase6b/comprobante.pdf", printBackground: true });
});

test("abono consulta saldo, valida exceso y confirma sobre el formulario existente", async ({ page }) => {
  await page.goto("/facturas/42");
  await page.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Registrar abono", exact: true });
  invoice.saldoPendiente = "10000.25";
  await drawer.getByLabel("Monto COP", { exact: false }).fill("15000.50");
  await drawer.getByRole("button", { name: "Revisar abono" }).click();
  await expect(drawer.getByRole("alert")).toContainText("superan");
  await expect(page.getByTestId("payment-balance")).toHaveText("$ 10.000,25");
  await drawer.getByLabel("Monto COP", { exact: false }).fill("10000.25");
  await drawer.getByRole("button", { name: "Revisar abono" }).click();
  const confirm = page.getByRole("dialog", { name: "¿Confirmar el abono?" });
  await expect(confirm).toBeVisible(); expect(await drawer.evaluate(el => (el as HTMLDialogElement).open)).toBeTruthy();
  await confirm.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(drawer.getByLabel("Monto COP", { exact: false })).toHaveValue("10000.25");
  expect(writes).toHaveLength(0);
});

test("abono actualiza detalle, pagos y estado evitando doble envío", async ({ page }) => {
  await page.goto("/facturas/42");
  await page.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Registrar abono", exact: true });
  await drawer.getByLabel("Monto COP", { exact: false }).fill("15000.50");
  await drawer.getByLabel("Método de pago", { exact: true }).selectOption("TRANSFERENCIA");
  await drawer.getByLabel("Referencia opcional", { exact: true }).fill("ABONO-TEST");
  await drawer.getByLabel("Observaciones opcionales").fill("Saldo completo");
  await drawer.getByRole("button", { name: "Revisar abono" }).click();
  await page.getByRole("dialog", { name: "¿Confirmar el abono?" }).getByRole("button", { name: "Confirmar", exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir comprobante" })).toBeFocused();
  await expect(page.locator(".receipt .badge")).toHaveText("Pagada");
  await expect(page.locator(".receipt-payments tbody tr")).toHaveCount(2);
  await expect(page.locator(".receipt-payments")).toContainText("ABONO-TEST");
  await expect(page.getByRole("button", { name: "Registrar abono", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
});

test("abono detecta cambio concurrente de saldo antes del POST", async ({ page }) => {
  await page.goto("/facturas/42"); await page.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Registrar abono", exact: true });
  await drawer.getByLabel("Monto COP", { exact: false }).fill("5000");
  await drawer.getByRole("button", { name: "Revisar abono" }).click();
  await expect(page.getByRole("dialog", { name: "¿Confirmar el abono?" })).toBeVisible();
  invoice.saldoPendiente = "10000.50";
  await page.getByRole("dialog", { name: "¿Confirmar el abono?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(drawer.getByRole("alert")).toContainText("El saldo cambió"); expect(writes).toHaveLength(0);
});

test("abono incierto conserva formulario bloqueado y enlace a pagos", async ({ page }) => {
  await page.route("**/api/facturas/42/pagos", route => route.fulfill({ status: 502, body: "upstream unavailable" }));
  await page.goto("/facturas/42"); await page.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Registrar abono", exact: true });
  await drawer.getByLabel("Monto COP", { exact: false }).fill("5000"); await drawer.getByRole("button", { name: "Revisar abono" }).click();
  await page.getByRole("dialog", { name: "¿Confirmar el abono?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(drawer.getByRole("alert")).toContainText("podría haberse guardado");
  await expect(drawer.getByRole("button", { name: "Revisar abono" })).toBeDisabled();
  await expect(drawer.getByRole("link", { name: "Comprobar historial de pagos" })).toHaveAttribute("href", "/facturas/42");
});

test("importes JSON grandes se preservan sin redondeo de punto flotante", async ({ page }) => {
  await page.route("**/api/productos", route => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ ...products[0], precioVenta: "PRECISION" }]).replace('"PRECISION"', "999999999999999999999999.99") }));
  await page.goto("/ventas/nueva"); await page.getByRole("button", { name: "Agregar Café de origen", exact: true }).click();
  await expect(page.getByTestId("sale-total")).toHaveText("$ 999.999.999.999.999.999.999.999,99");
  await page.getByLabel("Cantidad de Café de origen", { exact: true }).fill("3");
  await expect(page.getByTestId("sale-total")).toHaveText("$ 2.999.999.999.999.999.999.999.999,97");
});

test("errores de consulta no se presentan como historial vacío", async ({ page }) => {
  await page.route("**/api/facturas", route => route.fulfill({ status: 503, json: { detail: "Facturación no disponible" } }));
  await page.goto("/facturas"); await expect(page.getByRole("alert")).toContainText("Facturación no disponible");
  await expect(page.getByText("Sin facturas para mostrar")).toHaveCount(0);
  await page.route("**/api/facturas/404", route => route.fulfill({ status: 404, json: { detail: "Factura no encontrada" } }));
  await page.goto("/facturas/404"); await expect(page.getByRole("alert")).toContainText("Factura no encontrada");
});

test("pantallas Nexo responden en ambos temas y movimiento reducido", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.goto("/#/apariencia");
    await page.getByRole("button", { name: theme === "light" ? "Claro" : "Oscuro", exact: true }).click();
    for (const path of ["/ventas/nueva", "/facturas", "/creditos", "/facturas/42"]) {
      await page.goto(path); await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".loading-state")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const panel = page.locator("main .glass").first();
      expect(await panel.evaluate(el => getComputedStyle(el).backdropFilter)).toContain("blur(");
      await page.screenshot({ path: `../docs/capturas/fase6b/${path.replaceAll("/", "-")}-${theme}-${info.project.name}.png`, fullPage: true });
    }
  }
});
