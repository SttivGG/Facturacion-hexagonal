/** Fase 7B. Crea y CONSERVA tres facturas ficticias; nunca elimina datos ni volúmenes.
 * Requiere Nexo con DRUID_ENABLED=true, analytics saludable y npm ci en frontend.
 * node scripts/Test-DruidIngesta.mjs
 * Reinicia únicamente backend y analytics para verificar recuperación y persistencia.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "frontend/package.json"));
const { chromium, expect } = require("@playwright/test");
const run = promisify(execFile);
const apiBase = process.env.NEXO_API_URL || "http://127.0.0.1:8080";
const uiBase = process.env.UI_BASE_URL || "http://127.0.0.1:5173";
const druidBase = process.env.DRUID_TEST_URL || "http://127.0.0.1:8888";
const resumeId = process.argv[2] === "--resume" ? process.argv[3] : undefined;
if (process.argv.length > 2 && (!resumeId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(resumeId))) {
  throw Error("Uso: node scripts/Test-DruidIngesta.mjs [--resume UUID]. Resume solo retoma la verificación posterior al reinicio Druid.");
}
const runId = resumeId || randomUUID();
const marker = `FASE7B-${runId}`;
const output = path.join(root, "backend/target/fase7b", runId);
const analytics = ["druid-router", "druid-middlemanager", "druid-historical", "druid-broker", "druid-coordinator", "druid-zookeeper", "druid-metadata"];
const summary = { runId, startedAt: new Date().toISOString(), checks: [], invoices: {} };
let browser;
let analyticsStopped = false;
let backendStopped = false;
let sampler;
let measuring;
const metrics = { samples: 0, maxMiddleManagerMiB: 0, maxTotalMiB: 0, maxControllers: 0, maxWorkers: 0, maxActiveTasks: 0, peaks: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function save(name, value) { await writeFile(path.join(output, name + ".json"), JSON.stringify(value, null, 2)); }
function check(value, message) { if (!value) throw Error(message); summary.checks.push(message); console.log(message); }
async function request(base, route, method = "GET", body, status = 200) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (response.status !== status) throw Error(`${method} ${route}: HTTP ${response.status} (esperado ${status})`);
  return text ? JSON.parse(text) : null;
}
const api = (route, method, body, status) => request(apiBase, "/api" + route, method, body, status);
const sql = query => request(druidBase, "/druid/v2/sql", "POST", { query, context: { useApproximateCountDistinct: false, useCache: false, populateCache: false } });
async function docker(args) {
  const { stdout } = await run("docker", ["compose", "--project-directory", root, "--profile", "analytics", ...args], { timeout: 660000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}
async function mysql(query) {
  // execFile evita interpretar en el shell host los nombres, referencias o contraseñas.
  const child = execFile("docker", ["compose", "--project-directory", root, "exec", "-T", "facturacion-mysql", "sh", "-c",
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names --user="$MYSQL_USER" --database="$MYSQL_DATABASE"'], { timeout: 20000 });
  let out = "", error = "";
  child.stdout.on("data", text => out += text); child.stderr.on("data", text => error += text);
  child.stdin.end(query);
  await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(Error("Consulta MySQL fallida: " + error))); });
  return out.trim();
}
async function waitFor(description, action, seconds = 600) {
  const deadline = Date.now() + seconds * 1000; let lastError;
  do {
    try { const value = await action(); if (value) return value; } catch (error) { if (error.fatal) throw error; lastError = error.message; }
    await sleep(2000);
  } while (Date.now() < deadline);
  throw Error(`Tiempo agotado: ${description}. ${lastError || ""}`);
}
async function waitSync(name, manual = true) {
  if (manual) await api("/analitica/sincronizar", "POST", undefined, 202);
  const estado = await waitFor(name, async () => {
    const e = await api("/analitica/estado");
    if (!e.enEjecucion && e.ultimoResultado === "FAILED") { const error = Error(e.ultimoError); error.fatal = true; throw error; }
    return !e.enEjecucion && !e.pendiente && e.ultimoResultado === "SUCCESS" ? e : false;
  });
  await save(name + "-estado", estado); return estado;
}
async function totals() {
  const result = {};
  for (const [table, id, columns] of [
    ["nexo_facturas", "factura_id", ["subtotal_centavos", "impuestos_centavos", "total_centavos", "total_pagado_centavos", "saldo_pendiente_centavos"]],
    ["nexo_factura_detalles", "detalle_id", ["cantidad", "precio_unitario_centavos", "subtotal_centavos", "total_centavos"]],
    ["nexo_pagos", "pago_id", ["monto_centavos"]],
  ]) {
    const sums = columns.map(c => `CAST(COALESCE(SUM(${c}),0) AS VARCHAR) AS ${c}`).join(", ");
    result[table] = (await sql(`SELECT COUNT(*) AS registros, COUNT(DISTINCT ${id}) AS identidades, ${sums} FROM ${table}`))[0];
    check(result[table].registros === result[table].identidades, `${table}: identidades únicas (${result[table].registros})`);
  }
  return result;
}
async function invoiceRow(id) {
  return (await sql(`SELECT factura_id, numero_factura, modalidad, estado, total_centavos, total_pagado_centavos, saldo_pendiente_centavos FROM nexo_facturas WHERE factura_id = ${Number(id)}`))[0];
}
async function captureInvoice(name, invoice, expected) {
  const row = await invoiceRow(invoice.id);
  check(row && Object.entries(expected).every(([key, value]) => row[key] === value), `${name}: valores exactos de ${invoice.numeroFactura} consultados en Druid`);
  const mysqlRow = JSON.parse(await mysql(`SELECT JSON_OBJECT('numero_factura',numero_factura,'estado',estado,'total_centavos',CAST(total*100 AS SIGNED),'total_pagado_centavos',CAST(total_pagado*100 AS SIGNED),'saldo_pendiente_centavos',CAST(saldo_pendiente*100 AS SIGNED)) FROM facturas WHERE id=${Number(invoice.id)};`));
  check(Object.entries(expected).every(([key, value]) => mysqlRow[key] === value), `${name}: MySQL confirma los mismos importes y estado`);
  await save(name, { druid: row, mysql: mysqlRow }); return row;
}
async function startAnalytics() { await docker(["up", "-d", "--no-build", "--wait", "--wait-timeout", "600", "druid-router"]); analyticsStopped = false; }
function mib(value) {
  const match = value.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB)$/);
  if (!match) throw Error("Unidad de memoria inesperada: " + value);
  return Number(match[1]) * ({ B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 })[match[2]];
}
async function measure() {
  const sample = { at: new Date().toISOString() };
  try {
    const { stdout } = await run("docker", ["stats", "--no-stream", "--format", "{{json .}}"], { timeout: 15000 });
    sample.memory = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const row = JSON.parse(line); const [used, limit] = row.MemUsage.split("/");
      return { name: row.Name, usedMiB: mib(used), limitMiB: mib(limit) };
    }).filter(row => row.name.startsWith("facturacion-hexagonal-"));
    metrics.maxTotalMiB = Math.max(metrics.maxTotalMiB, sample.memory.reduce((sum, row) => sum + row.usedMiB, 0));
    metrics.maxMiddleManagerMiB = Math.max(metrics.maxMiddleManagerMiB, sample.memory.find(row => row.name.includes("druid-middlemanager"))?.usedMiB || 0);
  } catch (error) { sample.memoryError = error.message; }
  try {
    const tasks = await request(druidBase, "/druid/indexer/v1/tasks");
    sample.activeTasks = tasks.filter(t => t.id.startsWith("query-nexo_7b_") && t.statusCode === "RUNNING")
      .map(t => ({ id: t.id, type: t.type, datasource: t.dataSource }));
    metrics.maxControllers = Math.max(metrics.maxControllers, sample.activeTasks.filter(t => t.type === "query_controller").length);
    metrics.maxWorkers = Math.max(metrics.maxWorkers, sample.activeTasks.filter(t => t.type === "query_worker").length);
    metrics.maxActiveTasks = Math.max(metrics.maxActiveTasks, sample.activeTasks.length);
  } catch (error) { sample.tasksError = error.message; }
  metrics.samples++; await appendFile(path.join(output, "metrics.ndjson"), JSON.stringify(sample) + "\n");
}
function sampleMetrics() {
  if (measuring) return;
  measuring = measure().finally(() => { measuring = undefined; });
}
async function peak(stage) {
  const result = await docker(["exec", "-T", "druid-middlemanager", "sh", "-c", "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events"]);
  metrics.peaks.push({ stage, raw: result }); await save("memory-peaks", metrics.peaks);
}
async function containers() {
  const ids = (await docker(["ps", "-q"])).split(/\s+/).filter(Boolean);
  const { stdout } = await run("docker", ["inspect", ...ids], { maxBuffer: 8 * 1024 * 1024 });
  // No guardar Config.Env: incluye secretos.
  return JSON.parse(stdout).map(c => ({ name: c.Name, image: c.Config.Image, startedAt: c.State.StartedAt,
    health: c.State.Health?.Status, oomKilled: c.State.OOMKilled, restarts: c.RestartCount,
    mounts: c.Mounts.map(m => ({ name: m.Name, destination: m.Destination })) }));
}
async function finalizar(beforeRestart, mountsBefore) {
  // start intenta resolver el inicializador Cassandra aunque esté ausente. up --no-deps
  // arranca el backend existente sin ejecutar ni recrear las bases o inicializadores.
  await docker(["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "180", "facturacion-backend"]); backendStopped = false;
  await waitFor("backend disponible", async () => (await api("/health")).status === "OK", 180);
  await waitSync("10-reinicio-spring", false);
  check(JSON.stringify(await totals()) === JSON.stringify(beforeRestart), "Druid y Spring conservan facturas, pagos y saldos tras reiniciar");
  const after = await waitFor("doce contenedores saludables", async () => {
    const rows = await containers(); return rows.length === 12 && rows.every(c => c.health === "healthy") ? rows : false;
  }, 180);
  await save("10-contenedores-despues", after);
  for (const before of mountsBefore) {
    const current = after.find(c => c.name === before.name);
    check(current && JSON.stringify(current.mounts) === JSON.stringify(before.mounts), `Volúmenes conservados: ${before.name}`);
  }
  check(after.every(c => !c.oomKilled), "Doce contenedores saludables, sin OOM");
  await peak("final");
  check(metrics.maxControllers === 1 && metrics.maxWorkers <= 1 && metrics.maxActiveTasks <= 2,
    "Muestreo confirma una ingesta MSQ a la vez: un controlador y como máximo un worker");
  summary.mysqlAfter = JSON.parse(await mysql("SELECT JSON_OBJECT('facturas',(SELECT COUNT(*) FROM facturas),'detalles',(SELECT COUNT(*) FROM factura_detalles),'pagos',(SELECT COUNT(*) FROM pagos));"));
  summary.finalTotals = await totals(); summary.finalState = await api("/analitica/estado");
  summary.resumen = await api("/analitica/resumen");
  check((await fetch(uiBase)).status === 200, "Frontend Nexo disponible después de las pruebas");
  check((await request(uiBase, "/api/health")).status === "OK", "Proxy frontend resuelve el backend después del reinicio");
  const throughProxy = await request(uiBase, "/api/facturas/" + summary.invoices.credit.id);
  check(throughProxy.numeroFactura === summary.invoices.credit.numero && throughProxy.estado === "PAGADA",
    "Factura y abonos reales disponibles a través del proxy frontend");
}
try {
  await mkdir(output, { recursive: true });
  if (resumeId) {
    const previous = JSON.parse(await readFile(path.join(output, "summary.json"), "utf8"));
    await save("summary-before-resume-" + Date.now(), previous);
    Object.assign(summary, previous); Object.assign(metrics, previous.metrics);
    summary.resumes = [...(previous.resumes || []), { at: new Date().toISOString(), previousError: previous.error }];
    delete summary.error; delete summary.backendRestoreError; delete summary.restoreError;
  }
  sampleMetrics(); sampler = setInterval(sampleMetrics, 2000);
  if (resumeId) {
    const before = JSON.parse(await readFile(path.join(output, "09-totales-antes-reinicio.json"), "utf8"));
    const persisted = JSON.parse(await readFile(path.join(output, "09-totales-despues-reinicio-druid.json"), "utf8"));
    const mounts = JSON.parse(await readFile(path.join(output, "09-contenedores-antes.json"), "utf8"));
    check(JSON.stringify(before) === JSON.stringify(persisted), "Checkpoint confirma persistencia Druid con Spring detenido");
    await finalizar(before, mounts);
  } else {
  check((await api("/analitica/estado")).habilitado, "Analítica habilitada");
  summary.containersBefore = await containers();
  summary.mysqlBefore = JSON.parse(await mysql("SELECT JSON_OBJECT('facturas',(SELECT COUNT(*) FROM facturas),'detalles',(SELECT COUNT(*) FROM factura_detalles),'pagos',(SELECT COUNT(*) FROM pagos));"));
  const customer = await api("/personas", "POST", { tipoDocumento: "FASE7B_TEST", numeroDocumento: marker, nombres: "Cliente ficticio Fase 7B", roles: ["CLIENTE"] }, 201);
  const product = await api("/productos", "POST", { sku: marker, nombre: "Producto ficticio Fase 7B", costo: "5000.00", precioVenta: "10000.25" }, 201);
  check(customer.roles.includes("CLIENTE") && product.activo, "Cliente Cassandra y producto MongoDB ficticios creados");
  const cash = await api("/facturas", "POST", { clienteId: customer.id, modalidad: "CONTADO",
    detalles: [{ productoId: product.id, cantidad: 1 }], pagosIniciales: [{ metodoPago: "EFECTIVO", monto: "10000.25", referencia: marker + "-CONTADO" }] }, 201);
  summary.invoices.cash = { id: cash.id, numero: cash.numeroFactura };
  await waitSync("01-contado");
  await captureInvoice("01-contado", cash, { numero_factura: cash.numeroFactura, total_centavos: 1000025, total_pagado_centavos: 1000025, saldo_pendiente_centavos: 0, estado: "PAGADA" });

  // Venta a crédito real desde la interfaz Nexo existente, sin modificar su diseño.
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: "es-CO", timezoneId: "America/Bogota" });
  await page.goto(uiBase + "/ventas/nueva");
  await page.getByRole("searchbox").fill(marker);
  await page.getByRole("button", { name: "Agregar Producto ficticio Fase 7B", exact: true }).click();
  await page.getByLabel("Cantidad de Producto ficticio Fase 7B", { exact: true }).fill("2");
  await page.getByLabel("Tipo de documento del cliente", { exact: true }).fill("FASE7B_TEST");
  await page.getByLabel("Número de documento del cliente", { exact: true }).fill(marker);
  await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
  await expect(page.locator(".selected-person")).toContainText("Cliente ficticio Fase 7B");
  await page.getByLabel("Modalidad de venta", { exact: true }).selectOption("CREDITO");
  await page.getByLabel("Fecha de vencimiento", { exact: false }).fill("2099-12-15");
  const created = page.waitForResponse(r => r.url().endsWith("/api/facturas") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Generar factura", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Generar esta factura?" }).getByRole("button", { name: "Confirmar", exact: true }).click();
  const response = await created; check(response.status() === 201, "Factura de crédito creada desde Nexo en el navegador");
  const credit = await response.json(); summary.invoices.credit = { id: credit.id, numero: credit.numeroFactura };
  await waitSync("02-credito-pendiente", false);
  await captureInvoice("02-credito-pendiente", credit, { numero_factura: credit.numeroFactura, total_centavos: 2000050, total_pagado_centavos: 0, saldo_pendiente_centavos: 2000050, estado: "PENDIENTE" });
  await page.getByRole("link", { name: "Consultar o imprimir comprobante" }).click();
  await expect(page.locator(".receipt")).toContainText(credit.numeroFactura);
  await page.screenshot({ path: path.join(output, "credito-nexo.png"), fullPage: true });

  await api(`/facturas/${credit.id}/pagos`, "POST", { metodoPago: "NEQUI", monto: "5000.10", referencia: marker + "-ABONO" });
  await waitSync("03-credito-parcial", false);
  await captureInvoice("03-credito-parcial", credit, { numero_factura: credit.numeroFactura, total_centavos: 2000050, total_pagado_centavos: 500010, saldo_pendiente_centavos: 1500040, estado: "PARCIAL" });
  await api(`/facturas/${credit.id}/pagos`, "POST", { metodoPago: "TRANSFERENCIA", monto: "15000.40", referencia: marker + "-FINAL" });
  await waitSync("04-credito-pagada", false);
  await captureInvoice("04-credito-pagada", credit, { numero_factura: credit.numeroFactura, total_centavos: 2000050, total_pagado_centavos: 2000050, saldo_pendiente_centavos: 0, estado: "PAGADA" });

  await api(`/productos/${product.id}`, "PUT", { sku: marker + "-NUEVO", nombre: "Producto ficticio actualizado", costo: "1.00", precioVenta: "99999.99" });
  await waitSync("05-historico");
  const historical = await sql(`SELECT sku, nombre_producto, precio_unitario_centavos FROM nexo_factura_detalles WHERE factura_id = ${Number(credit.id)}`);
  check(historical.length === 1 && historical[0].sku === marker && historical[0].precio_unitario_centavos === 1000025, "Cambiar MongoDB conserva el precio y SKU históricos en Druid");
  await save("05-historico", historical);
  const beforeRepeat = await totals(); await waitSync("06-repeticion-a"); const repeatA = await totals();
  await waitSync("06-repeticion-b"); const repeatB = await totals();
  check(JSON.stringify(beforeRepeat) === JSON.stringify(repeatA) && JSON.stringify(repeatA) === JSON.stringify(repeatB), "Dos sincronizaciones completas conservan conteos y todas las sumas sin duplicaciones");
  await save("06-idempotencia", { beforeRepeat, repeatA, repeatB });

  await peak("antes-desconexion"); analyticsStopped = true; await docker(["stop", ...analytics]);
  const start = Date.now();
  const offline = await api("/facturas", "POST", { clienteId: customer.id, modalidad: "CREDITO", fechaVencimiento: "2099-12-15", detalles: [{ productoId: product.id, cantidad: 1 }] }, 201);
  summary.invoices.offline = { id: offline.id, numero: offline.numeroFactura, responseMs: Date.now() - start };
  check(offline.estado === "PENDIENTE", "Venta confirmada en MySQL con los siete servicios analytics apagados");
  const failed = await waitFor("fallo analítico visible", async () => { const e = await api("/analitica/estado"); return e.ultimoResultado === "FAILED" && e.pendiente ? e : false; }, 60);
  await save("07-druid-apagado-estado", failed);
  await request(apiBase, "/api/analitica/resumen", "GET", undefined, 503);
  // Reiniciar Spring con el cambio pendiente prueba que no depende de una cola solo en memoria.
  await docker(["restart", "facturacion-backend"]);
  await waitFor("backend reiniciado con Druid apagado", async () => (await api("/health")).status === "OK", 180);
  await startAnalytics();
  await waitSync("08-recuperacion");
  await captureInvoice("08-recuperacion", offline, { numero_factura: offline.numeroFactura, total_centavos: 9999999, total_pagado_centavos: 0, saldo_pendiente_centavos: 9999999, estado: "PENDIENTE" });
  const beforeRestart = await totals(); await save("09-totales-antes-reinicio", beforeRestart);
  const mountsBefore = await containers(); await save("09-contenedores-antes", mountsBefore);
  await peak("antes-persistencia");
  // Spring queda detenido: ninguna reconciliación puede reconstruir datos durante la prueba de persistencia.
  backendStopped = true; await docker(["stop", "facturacion-backend"]);
  analyticsStopped = true; await docker(["stop", ...analytics]); await startAnalytics();
  // Consultar Druid ANTES de reiniciar Spring: demuestra persistencia sin reconstrucción del backend.
  await waitFor("mismos hechos persistidos tras reiniciar Druid", async () => JSON.stringify(await totals()) === JSON.stringify(beforeRestart));
  await save("09-totales-despues-reinicio-druid", await totals());
  await finalizar(beforeRestart, mountsBefore);
  }
  summary.success = true;
} catch (error) {
  summary.success = false; summary.error = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  if (analyticsStopped) {
    try { await startAnalytics(); } catch (error) { summary.restoreError = error.message; process.exitCode = 1; }
  }
  if (backendStopped) {
    try { await docker(["up", "-d", "--no-deps", "--no-build", "--wait", "--wait-timeout", "180", "facturacion-backend"]); }
    catch (error) { summary.backendRestoreError = error.message; process.exitCode = 1; }
  }
  clearInterval(sampler); await measuring; summary.metrics = metrics;
  await browser?.close(); summary.finishedAt = new Date().toISOString();
  await save("summary", summary); console.log(`Evidencia: ${output}`);
}
