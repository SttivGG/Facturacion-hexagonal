import { test, expect, type Page, type Locator } from "@playwright/test";
import type { Persona, Producto } from "../src/types";

// Fixtures exclusivas de pruebas: todas las peticiones /api se interceptan.
// Ninguna lectura ni escritura de esta suite alcanza MongoDB o Cassandra.
const a: Persona = {
  id: "7d000000-0000-4000-8000-000000000001", tipoDocumento: "NIT", numeroDocumento: "900111222",
  nombres: "Distribuciones", apellidos: "Andina", correo: null, telefono: null, telefonoAlternativo: null,
  direccion: null, ciudad: "Bogotá", departamento: "Bogotá, D.C.", pais: "Colombia", fechaNacimiento: null,
  observaciones: null, roles: ["PROVEEDOR"], activo: true,
  fechaCreacion: "2026-11-05T12:00:00Z", fechaActualizacion: "2026-11-05T12:00:00Z",
};
const b: Persona = { ...a, id: "7d000000-0000-4000-8000-000000000002", nombres: "Suministros", apellidos: "del Sur", numeroDocumento: "900333444", ciudad: "Mocoa" };
const inactive: Persona = { ...a, id: "7d000000-0000-4000-8000-000000000003", nombres: "Proveedor Inactivo", apellidos: null, activo: false };
const customer: Persona = { ...a, id: "7d000000-0000-4000-8000-000000000004", nombres: "Solo Cliente", apellidos: null, roles: ["CLIENTE"] };
const outside: Persona = { ...a, id: "7d000000-0000-4000-8000-000000000005", nombres: "Proveedor Fuera del Límite", apellidos: null, numeroDocumento: "900999000" };
const baseProduct: Producto = {
  id: "producto-7d", sku: "FASE7D", nombre: "Producto de prueba", descripcion: null, categoria: null,
  costo: "12345.67", precioVenta: "9007199254740993.01", moneda: "COP", proveedorId: null,
  activo: true, imagenId: null, fechaCreacion: a.fechaCreacion, fechaActualizacion: a.fechaActualizacion,
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=", "base64");

let roleRows: Persona[];
let canonical: Map<string, Persona>;
let products: Producto[];
let writes: { method: string; path: string; body: Record<string, unknown> }[];
let reads: string[];
let failRole: boolean;
let failReference: boolean;
let failImage: boolean;
let failSave: boolean;
let imageUploads: number;
let roleGate: Promise<void> | undefined;
let unexpectedWrites: string[];

test.beforeEach(async ({ page }) => {
  roleRows = [a, b, inactive, customer];
  canonical = new Map([a, b, inactive, customer, outside].map(person => [person.id, person]));
  products = []; writes = []; reads = []; unexpectedWrites = [];
  failRole = false; failReference = false; failImage = false; failSave = false;
  imageUploads = 0; roleGate = undefined;
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname);
    const method = request.method();
    if (method === "GET") {
      reads.push(path);
      if (path === "/api/health") return route.fulfill({ json: { status: "OK" } });
      if (path === "/api/productos") return route.fulfill({ json: products });
      if (path === "/api/personas/rol/PROVEEDOR") {
        if (roleGate) await roleGate;
        return route.fulfill(failRole ? { status: 503, json: { detail: "Cassandra no disponible" } } : { json: roleRows });
      }
      if (path.startsWith("/api/personas/documento/")) {
        const [, , , , type, number] = path.split("/");
        const person = [...canonical.values()].find(row => row.tipoDocumento === type && row.numeroDocumento === number);
        return route.fulfill(person ? { json: person } : { status: 404, json: { detail: "Persona no encontrada" } });
      }
      if (path.startsWith("/api/personas/")) {
        const person = canonical.get(path.split("/").at(-1)!);
        return route.fulfill(failReference ? { status: 503, json: { detail: "Cassandra no disponible" } }
          : person ? { json: person } : { status: 404, json: { detail: "Persona no encontrada" } });
      }
      if (path.endsWith("/imagen")) return route.fulfill({ contentType: "image/png", body: png });
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/imagen") && method === "POST") {
      imageUploads++;
      if (failImage) return route.fulfill({ status: 503, json: { detail: "Carga de imagen interrumpida" } });
      products[0] = { ...products[0], imagenId: "gridfs-7d" };
      return route.fulfill({ json: products[0] });
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ method, path, body });
    if (path === "/api/personas" && method === "POST") {
      const person = { ...a, ...body, id: "7d000000-0000-4000-8000-000000000006" } as Persona;
      canonical.set(person.id, person);
      roleRows.push(person);
      return route.fulfill({ status: 201, json: person });
    }
    if (path.startsWith("/api/productos") && ["POST", "PUT"].includes(method)) {
      if (failSave) return route.fulfill({ status: 400, json: { detail: "El proveedor seleccionado está inactivo" } });
      const saved = { ...baseProduct, ...products[0], ...body } as Producto;
      products = [saved];
      return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
    }
    unexpectedWrites.push(`${method} ${path}`);
    return route.abort();
  });
});
test.afterEach(() => expect(unexpectedWrites).toEqual([]));

async function openNew(page: Page) {
  await page.goto("/#/productos");
  await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nuevo producto", exact: true });
  await editor.getByRole("textbox", { name: /^Nombre/ }).fill(baseProduct.nombre);
  await editor.getByLabel("SKU", { exact: false }).fill(baseProduct.sku);
  await editor.getByLabel("Costo · COP", { exact: false }).fill(String(baseProduct.costo));
  await editor.getByLabel("Precio de venta · COP", { exact: false }).fill(String(baseProduct.precioVenta));
  return editor;
}
async function openEdit(page: Page, provider: string | null) {
  products = [{ ...baseProduct, proveedorId: provider, imagenId: "imagen-anterior" }];
  await page.goto("/#/productos");
  await page.getByRole("button", { name: `Editar ${baseProduct.nombre}`, exact: true }).click();
  return page.getByRole("dialog", { name: "Editar producto", exact: true });
}
async function save(editor: Locator) {
  await editor.getByRole("button", { name: "Guardar producto", exact: true }).click();
  await expect(editor).not.toBeVisible();
}
async function selectProvider(editor: Locator, name: RegExp) {
  const input = editor.getByRole("combobox", { name: "Buscar proveedor", exact: true });
  await input.click();
  await editor.getByRole("option", { name }).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeFocused();
}

test("consulta el endpoint real del contrato, filtra activos y roles, busca sin tildes y guarda UUID", async ({ page }, info) => {
  const editor = await openNew(page);
  await editor.getByRole("combobox").click();
  await expect(editor.getByRole("option", { name: /Distribuciones Andina/ })).toBeVisible();
  expect(reads).toContain("/api/personas/rol/PROVEEDOR");
  await expect(editor.getByRole("option", { name: /Proveedor Inactivo|Solo Cliente/ })).toHaveCount(0);
  await expect(editor.getByLabel("ID del proveedor", { exact: true })).toHaveCount(0);
  const search = editor.getByRole("combobox", { name: "Buscar proveedor", exact: true });
  for (const term of ["bogota", "900111222", "andina"]) {
    await search.fill(term);
    await expect(editor.getByRole("option", { name: /Distribuciones Andina/ })).toBeVisible();
    await expect(editor.getByRole("option", { name: /Suministros del Sur/ })).toHaveCount(0);
  }
  await search.press("Enter");
  expect(writes).toHaveLength(0);
  await expect(search).toHaveValue("Distribuciones Andina");
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await editor.locator(".provider-selector").scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: info.outputPath("selector.png") });
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(a.id);
  expect(writes[0].body.precioVenta).toBe("9007199254740993.01");
});

test("guarda producto sin proveedor", async ({ page }) => {
  const editor = await openNew(page);
  await expect(editor.getByRole("combobox")).toHaveValue("Sin proveedor");
  await save(editor);
  expect(writes[0].body.proveedorId).toBeNull();
});

test("edita proveedor existente sin cambiar UUID ni imagen", async ({ page }) => {
  const editor = await openEdit(page, a.id);
  await expect(editor.getByRole("combobox")).toHaveValue("Distribuciones Andina");
  await editor.getByLabel("Nombre", { exact: false }).fill("Producto actualizado");
  await save(editor);
  expect(reads).toContain(`/api/personas/${a.id}`);
  expect(writes[0]).toMatchObject({ method: "PUT", body: { proveedorId: a.id } });
  expect(products[0].imagenId).toBe("imagen-anterior");
});

test("cambia de proveedor y permite retirar la asociación", async ({ page }) => {
  let editor = await openEdit(page, a.id);
  await selectProvider(editor, /Suministros del Sur/);
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(b.id);
  editor = await openEdit(page, b.id);
  await selectProvider(editor, /Sin proveedor/);
  await save(editor);
  expect(writes[1].body.proveedorId).toBeNull();
});

for (const [name, provider] of [["inactivo", inactive], ["sin rol", customer], ["fuera del límite", outside]] as const) {
  test(`resuelve proveedor histórico ${name} y conserva asociación`, async ({ page }) => {
    const editor = await openEdit(page, provider.id);
    await expect(editor.getByRole("combobox")).toHaveValue(new RegExp(provider.nombres));
    if (name === "inactivo") await expect(editor.getByText("Inactivo · La asociación histórica se conserva.", { exact: true })).toBeVisible();
    if (name === "sin rol") await expect(editor.getByText(/Ya no tiene rol Proveedor/)).toBeVisible();
    await save(editor);
    expect(writes[0].body.proveedorId).toBe(provider.id);
  });
}

test("referencia antigua inexistente se conserva sin bloquear la edición", async ({ page }) => {
  const editor = await openEdit(page, "  referencia-antigua  ");
  await expect(editor.getByText(/La referencia del proveedor no está disponible/)).toBeVisible();
  await save(editor);
  expect(writes[0].body.proveedorId).toBe("  referencia-antigua  ");
});

test("el estado canónico por ID prevalece sobre una lista por rol desactualizada", async ({ page }) => {
  canonical.set(a.id, { ...a, activo: false });
  const editor = await openEdit(page, a.id);
  await expect(editor.getByText("Inactivo · La asociación histórica se conserva.", { exact: true })).toBeVisible();
  await expect(editor.getByRole("combobox")).toHaveValue("Distribuciones Andina");
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(a.id);
});

test("fallos de Cassandra conservan referencia y permiten reintentar", async ({ page }) => {
  failRole = true; failReference = true;
  const editor = await openEdit(page, outside.id);
  await expect(editor.getByRole("alert")).toContainText("Cassandra no disponible");
  await expect(editor.getByText(/No se pudo consultar el proveedor asociado/)).toBeVisible();
  failRole = false; failReference = false;
  await editor.getByRole("button", { name: "Reintentar consulta de proveedores" }).click();
  await expect(editor.getByRole("combobox")).toHaveValue("Proveedor Fuera del Límite");
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(outside.id);
});

test("puede guardar otros datos conservando proveedor durante caída de Cassandra", async ({ page }) => {
  failRole = true; failReference = true;
  const editor = await openEdit(page, a.id);
  await expect(editor.getByText(/No se pudo consultar el proveedor asociado/)).toBeVisible();
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(a.id);
});

test("estado de carga y lista vacía; crear proveedor reutiliza Personas y preserva producto", async ({ page }) => {
  let release!: () => void;
  roleRows = [];
  roleGate = new Promise<void>(resolve => { release = resolve; });
  const editor = await openNew(page);
  await editor.getByRole("combobox").click();
  await expect(editor.getByText("Cargando proveedores…", { exact: true })).toBeVisible();
  release();
  await expect(editor.getByText("No hay proveedores registrados. Puedes crear uno desde Personas.", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Registrar proveedor en Personas" }).click();
  const personEditor = page.getByRole("dialog", { name: "Nueva persona", exact: true });
  await expect(personEditor.getByLabel("Proveedor", { exact: true })).toBeChecked();
  await expect(personEditor.getByLabel("Cliente", { exact: true })).not.toBeChecked();
  await personEditor.getByLabel("Número de documento", { exact: false }).fill("900777888");
  await personEditor.getByLabel("Nombres", { exact: false }).fill("Proveedor nuevo");
  await personEditor.getByRole("button", { name: "Guardar persona" }).click();
  await expect(personEditor).not.toBeVisible();
  await expect(editor.getByLabel("Nombre", { exact: false })).toHaveValue(baseProduct.nombre);
  await expect(editor.getByRole("combobox")).toHaveValue("Proveedor nuevo");
  await expect(editor.locator("[data-provider-current]")).toBeFocused();
  await save(editor);
  expect(writes[0].body.roles).toEqual(["PROVEEDOR"]);
  expect(writes[1].body.proveedorId).toBe("7d000000-0000-4000-8000-000000000006");
});

test("avisa del límite y busca por documento fuera de la lista", async ({ page }) => {
  const editor = await openNew(page);
  await expect(editor.getByText(/La consulta por rol devuelve hasta 100 personas/)).toBeVisible();
  await editor.getByRole("combobox", { name: "Buscar proveedor", exact: true }).fill("no existe en esta lista");
  await expect(editor.getByText(/Sin coincidencias en los registros cargados/)).toBeVisible();
  await editor.getByText("Buscar en todas las personas por documento", { exact: true }).click();
  await editor.getByLabel("Tipo de documento del proveedor", { exact: true }).fill("NIT");
  await editor.getByLabel("Número de documento del proveedor", { exact: true }).fill(outside.numeroDocumento);
  await editor.getByRole("button", { name: "Buscar y seleccionar por documento" }).click();
  await expect(editor.getByRole("combobox")).toHaveValue("Proveedor Fuera del Límite");
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(outside.id);
});

test("buscar documento inexistente o no elegible no borra la selección", async ({ page }) => {
  const editor = await openEdit(page, b.id);
  await editor.getByText("Buscar en todas las personas por documento", { exact: true }).click();
  await editor.getByLabel("Tipo de documento del proveedor", { exact: true }).fill("NIT");
  for (const documentNumber of ["inexistente", "INACTIVO", "CLIENTE"]) {
    canonical.set(inactive.id, { ...inactive, numeroDocumento: "INACTIVO" });
    canonical.set(customer.id, { ...customer, numeroDocumento: "CLIENTE" });
    await editor.getByLabel("Número de documento del proveedor", { exact: true }).fill(documentNumber);
    await editor.getByRole("button", { name: "Buscar y seleccionar por documento" }).click();
    await expect(editor.getByRole("alert")).toBeVisible();
    await expect(editor.getByRole("combobox")).toHaveValue("Suministros del Sur");
  }
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(b.id);
});

test("teclado: combobox, flechas, Enter, Escape y confirmación sin desmontar producto", async ({ page }) => {
  const editor = await openNew(page);
  const input = editor.getByRole("combobox");
  const first = editor.getByRole("option", { name: /Distribuciones Andina/ });
  const second = editor.getByRole("option", { name: /Suministros del Sur/ });
  await input.focus();
  await input.press("ArrowDown");
  await expect(editor.getByRole("listbox", { name: "Proveedor del producto" })).toBeVisible();
  await expect(first).toBeVisible();
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", await first.getAttribute("id") as string);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", await second.getAttribute("id") as string);
  await expect(input).toBeFocused();
  const outline = await input.evaluate(element => getComputedStyle(element.closest(".provider-control")!).outlineStyle);
  expect(outline).toBe("solid");
  await input.press("Enter");
  await expect(input).toHaveValue("Suministros del Sur");
  await input.press("ArrowUp");
  await input.press("Home");
  await input.press("End");
  await expect(input).toHaveAttribute("aria-activedescendant", await second.getAttribute("id") as string);
  await input.press("Escape");
  await expect(input).toHaveValue("Suministros del Sur");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await expect(editor).toBeVisible();
  await page.evaluate(() => { (document.querySelector("#product-form") as HTMLElement).dataset.stillMounted = "yes"; });
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "¿Descartar los cambios?", exact: true });
  await confirmation.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(editor.locator("#product-form")).toHaveAttribute("data-still-mounted", "yes");
  await expect(input).toHaveValue("Suministros del Sur");
  await expect(editor.getByLabel("Nombre", { exact: false })).toHaveValue(baseProduct.nombre);
});

test("rechazo al guardar conserva el UUID y los datos introducidos", async ({ page }) => {
  const editor = await openNew(page);
  await selectProvider(editor, /Distribuciones Andina/);
  failSave = true;
  await editor.getByRole("button", { name: "Guardar producto", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("El proveedor seleccionado está inactivo");
  await expect(editor.getByRole("combobox")).toHaveValue("Distribuciones Andina");
  await expect(editor.getByLabel("SKU", { exact: false })).toHaveValue(baseProduct.sku);
  failSave = false;
  await save(editor);
  expect(writes[1].body.proveedorId).toBe(a.id);
});

test("lista de 100 registros: temas, movimiento reducido y orientación horizontal sin desbordamiento", async ({ page }, info) => {
  roleRows = Array.from({ length: 100 }, (_, index) => ({ ...a,
    id: `7d000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
    nombres: `Distribuciones de suministros y materiales con nombre extenso ${index}`, apellidos: null,
    numeroDocumento: String(900000000 + index),
  }));
  roleRows.forEach(person => canonical.set(person.id, person));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const editor = await openNew(page);
  await editor.getByRole("combobox").click();
  await expect(editor.getByRole("option")).toHaveCount(101);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const selector = editor.locator(".provider-selector");
    expect(await selector.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    const options = editor.locator(".provider-options");
    expect(await options.evaluate(element => element.scrollHeight > element.clientHeight)).toBeTruthy();
    const panel = editor.locator(".provider-popover");
    expect(await panel.evaluate(element => element.matches(":popover-open"))).toBeTruthy();
    expect(await panel.evaluate(element => getComputedStyle(element).backdropFilter)).toContain("blur");
    expect(await panel.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(.001);
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ animations: "disabled", path: info.outputPath(`selector-${theme}.png`) });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  const search = editor.getByRole("combobox", { name: "Buscar proveedor", exact: true });
  await search.fill("900000099");
  await expect(editor.getByRole("option")).toHaveCount(2);
  const label = editor.getByRole("option").nth(1);
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await label.click();
  await expect(search).toHaveValue(/nombre extenso 99/);
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
});

test("búsqueda sin resultados, Tab y clic externo conservan la selección", async ({ page }) => {
  const editor = await openEdit(page, a.id);
  const input = editor.getByRole("combobox");
  await expect(input).toHaveValue("Distribuciones Andina");
  await input.fill("no existe");
  await expect(editor.getByText("Sin coincidencias en los registros cargados.", { exact: true })).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.press("Tab");
  await expect(input).toHaveValue("Distribuciones Andina");
  await input.click();
  await editor.getByText("Precios y proveedor", { exact: true }).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await save(editor);
  expect(writes[0].body.proveedorId).toBe(a.id);
});

test("capturas de estados del selector integrado en ProductEditor", async ({ page }, info) => {
  const editor = await openNew(page);
  const input = editor.getByRole("combobox");
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: info.outputPath("cerrado.png") });
  await input.click();
  await expect(editor.getByRole("option")).toHaveCount(3);
  await page.screenshot({ animations: "disabled", path: info.outputPath("desplegado.png") });
  await input.fill("bogota");
  await expect(editor.getByRole("option")).toHaveCount(2);
  await page.screenshot({ animations: "disabled", path: info.outputPath("busqueda.png") });
  await input.press("Enter");
  await expect(input).toHaveValue("Distribuciones Andina");
  await page.screenshot({ animations: "disabled", path: info.outputPath("seleccionado.png") });
  await input.fill("sin coincidencias");
  await expect(editor.getByText("Sin coincidencias en los registros cargados.", { exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: info.outputPath("vacio.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await input.fill("");
  await page.screenshot({ animations: "disabled", path: info.outputPath("oscuro.png") });
});

test("imagen: reintenta tras guardado parcial usando PUT y mantiene proveedor y precisión", async ({ page }) => {
  const editor = await openNew(page);
  await selectProvider(editor, /Distribuciones Andina/);
  await editor.getByLabel("Imagen del producto", { exact: true }).setInputFiles({ name: "prueba.png", mimeType: "image/png", buffer: png });
  failImage = true;
  await editor.getByRole("button", { name: "Guardar producto", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("El producto se guardó, pero la imagen no");
  failImage = false;
  await editor.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(writes.map(write => write.method)).toEqual(["POST", "PUT"]);
  expect(writes.every(write => write.body.proveedorId === a.id)).toBeTruthy();
  expect(imageUploads).toBe(2);
  expect(products).toHaveLength(1);
  expect(products[0].imagenId).toBe("gridfs-7d");
  expect(products[0].precioVenta).toBe("9007199254740993.01");
});

test("táctil: abre desde el icono y selecciona sin perder el foco", async ({ page, isMobile }) => {
  test.skip(!isMobile, "La interacción táctil se comprueba en tablet y móvil.");
  const editor = await openNew(page);
  const input = editor.getByRole("combobox");
  await editor.locator(".provider-chevron").tap();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await editor.getByRole("option", { name: /Distribuciones Andina/ }).tap();
  await expect(input).toHaveValue("Distribuciones Andina");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeFocused();
  await input.tap();
  await editor.getByRole("option", { name: /Sin proveedor/ }).tap();
  await expect(input).toHaveValue("Sin proveedor");
});
