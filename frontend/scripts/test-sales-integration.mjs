import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "docs/capturas/fase6b");
const origin = process.env.UI_BASE_URL || "http://127.0.0.1:5173";
const marker = `FASE6B-${randomUUID()}`;
const type = "FASE6B_TEST";
const checks = [];
let browser;
let client;
let product;
let invoice;
let baseline;
function check(condition, message) { if (!condition) throw Error(message); checks.push(message); console.log(message); }
async function api(method, route, body, status = 200) {
  const response = await fetch(`${origin}/api${route}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (response.status !== status) throw Error(`${method} ${route}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
function docker(args, input) { return execFileSync("docker", ["compose", ...args], { cwd: root, input, encoding: "utf8", timeout: 90000 }).trim(); }
function sql(query) { return docker(["exec", "-T", "facturacion-mysql", "sh", "-c", 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names --user="$MYSQL_USER" --database="$MYSQL_DATABASE"'], query); }
function cql(query) {
  const result = docker(["exec", "-T", "facturacion-cassandra", "cqlsh", "127.0.0.1", "9042", "-e", query]);
  if (/SyntaxException|InvalidRequest|Unauthorized/.test(result)) throw Error(result);
  return result;
}
function mongo(code) { return docker(["exec", "-T", "facturacion-mongodb", "mongosh", "--quiet", "--file", "/dev/stdin"], `const admin=db.getSiblingDB('admin'); if(!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD)) throw Error('auth'); const base=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE); ${code}`); }
async function snapshot() {
  const paths = ["/productos", "/facturas", ...["CLIENTE", "PROVEEDOR", "TRABAJADOR", "ADMINISTRADOR"].map(role => `/personas/rol/${role}`)];
  return Object.fromEntries(await Promise.all(paths.map(async route => { const rows = await api("GET", route); rows.sort((a, b) => String(a.id).localeCompare(String(b.id))); return [route, { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") }]; })));
}
try {
  await mkdir(output, { recursive: true }); baseline = await snapshot();
  client = await api("POST", "/personas", { tipoDocumento: type, numeroDocumento: marker, nombres: "Cliente ficticio Fase 6B", correo: "fase6b@example.test", roles: ["CLIENTE"] }, 201);
  product = await api("POST", "/productos", { sku: marker, nombre: "Producto ficticio Fase 6B", categoria: "Prueba Fase 6B", costo: "5000.00", precioVenta: "10000.25" }, 201);
  check(client.roles.includes("CLIENTE") && product.activo, "Cliente Cassandra y producto MongoDB ficticios creados mediante el proxy HTTP");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: "es-CO", timezoneId: "America/Bogota" });
  await page.goto(`${origin}/ventas/nueva`);
  await page.getByRole("searchbox").fill(marker);
  await page.getByRole("button", { name: "Agregar Producto ficticio Fase 6B", exact: true }).click();
  await page.getByLabel("Cantidad de Producto ficticio Fase 6B", { exact: true }).fill("2");
  await page.getByLabel("Tipo de documento del cliente", { exact: true }).fill(type);
  await page.getByLabel("Número de documento del cliente", { exact: true }).fill(marker);
  await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
  await expect(page.locator(".selected-person")).toContainText("Cliente ficticio Fase 6B");
  await page.getByLabel("Modalidad de venta", { exact: true }).selectOption("CREDITO");
  await page.getByLabel("Fecha de vencimiento", { exact: false }).fill("2099-12-15");
  await expect(page.getByTestId("sale-total")).toHaveText("$ 20.000,50");
  await page.screenshot({ path: path.join(output, "integracion-venta.png"), fullPage: true });
  const created = page.waitForResponse(response => response.url().endsWith("/api/facturas") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  const response = await created; check(response.status() === 201, "Factura a crédito creada desde el punto de venta"); invoice = await response.json();
  check(invoice.estado === "PENDIENTE" && invoice.total === 20000.50 && invoice.saldoPendiente === 20000.50, "MySQL devuelve total 20000.50 y estado PENDIENTE sin inicial");
  await page.getByRole("link", { name: "Consultar o imprimir comprobante" }).click();
  await expect(page.locator(".receipt")).toContainText(invoice.numeroFactura);
  async function pay(amount) {
    await page.getByRole("button", { name: "Registrar abono", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Registrar abono", exact: true });
    await drawer.getByLabel("Monto COP", { exact: false }).fill(amount);
    await drawer.getByLabel("Método de pago", { exact: true }).selectOption("NEQUI");
    await drawer.getByLabel("Referencia opcional", { exact: true }).fill(marker);
    await drawer.getByRole("button", { name: "Revisar abono", exact: true }).click();
    const response = page.waitForResponse(res => res.url().endsWith(`/api/facturas/${invoice.id}/pagos`) && res.request().method() === "POST");
    await page.getByRole("dialog", { name: "¿Confirmar el abono?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
    check((await response).status() === 200, `Abono ${amount} registrado desde el formulario de pagos`);
    await expect(drawer).not.toBeVisible();
  }
  await pay("5000.10");
  const partial = await api("GET", `/facturas/${invoice.id}`);
  check(partial.saldoPendiente === 15000.40 && partial.estado === "PARCIAL" && partial.pagos.length === 1, "Saldo 15000.40, estado PARCIAL e historial actualizado después del primer abono");
  await page.screenshot({ path: path.join(output, "integracion-abono-parcial.png"), fullPage: true });
  await pay("15000.40");
  const paid = await api("GET", `/facturas/${invoice.id}`);
  check(paid.saldoPendiente === 0 && paid.estado === "PAGADA" && paid.pagos.length === 2, "Pago completo: saldo cero, estado PAGADA y dos pagos conservados");
  await expect(page.locator(".receipt .badge")).toHaveText("Pagada");
  await page.screenshot({ path: path.join(output, "integracion-pagada.png"), fullPage: true });
  await page.pdf({ path: path.join(output, "integracion-comprobante.pdf"), printBackground: true });
  docker(["restart", "facturacion-backend"]);
  let available = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await api("GET", "/health")).status === "OK") { available = true; break; } } catch { /* readiness GET only */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  check(available, "Backend disponible después de reiniciarlo");
  const persisted = await api("GET", `/facturas/${invoice.id}`);
  check(JSON.stringify(persisted) === JSON.stringify(paid), "Persistencia tras reinicio: factura PAGADA, detalles históricos, pagos y saldos idénticos");
  await page.reload(); await expect(page.locator(".receipt .badge")).toHaveText("Pagada");
  await writeFile(path.join(output, "integracion-factura.json"), JSON.stringify({ marker, partial, paid, persisted }, null, 2));
} finally {
  await browser?.close();
  // Recover by exact unique document even if the creation response was lost.
  const found = await fetch(`${origin}/api/personas/documento/${type}/${marker}`);
  if (found.ok) client = await found.json(); else check(found.status === 404, "Consulta de limpieza del cliente responde 404");
  if (client) {
    check(client.tipoDocumento === type && client.numeroDocumento === marker && /^[a-f0-9-]{36}$/.test(client.id), "Identidad ficticia verificada antes de limpiar");
    sql(`START TRANSACTION; DELETE FROM pagos WHERE factura_id IN (SELECT id FROM facturas WHERE cliente_id='${client.id}'); DELETE FROM factura_detalles WHERE factura_id IN (SELECT id FROM facturas WHERE cliente_id='${client.id}'); DELETE FROM facturas WHERE cliente_id='${client.id}'; COMMIT;`);
    check(sql(`SELECT COUNT(*) FROM facturas WHERE cliente_id='${client.id}';`) === "0", "Limpieza MySQL limitada a las facturas del cliente ficticio de esta ejecución");
    cql(["CLIENTE", "PROVEEDOR", "TRABAJADOR", "ADMINISTRADOR"].map(role => `DELETE FROM facturacion_personas.personas_por_rol WHERE rol='${role}' AND persona_id=${client.id};`).join(" ") + ` DELETE FROM facturacion_personas.personas_por_id WHERE id=${client.id}; DELETE FROM facturacion_personas.id_por_documento WHERE tipo_documento='${type}' AND numero_documento='${marker}' IF persona_id=${client.id};`);
    check((await fetch(`${origin}/api/personas/documento/${type}/${marker}`)).status === 404, "Cliente ficticio eliminado de Cassandra");
  }
  const filter = JSON.stringify({ sku: marker });
  const deleted = mongo(`base.productos.deleteMany(${filter}); print(base.productos.countDocuments(${filter}));`);
  check(deleted === "0", "Producto ficticio eliminado de MongoDB por su SKU único");
  const final = await snapshot();
  if (baseline) check(JSON.stringify(final) === JSON.stringify(baseline), "Conteos y hashes de productos, facturas y todos los roles coinciden con la línea base");
  await writeFile(path.join(output, "integracion-resultados.json"), JSON.stringify({ date: new Date().toISOString(), marker, checks, baseline, final }, null, 2));
}
