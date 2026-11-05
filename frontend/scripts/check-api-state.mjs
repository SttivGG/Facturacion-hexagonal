import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.UI_BASE_URL || "http://127.0.0.1:5173";
const output = new URL("../../docs/capturas/fase6a1/", import.meta.url);
await mkdir(output, { recursive: true });
const paths = [
  "/productos",
  "/facturas",
  ...["CLIENTE", "PROVEEDOR", "TRABAJADOR", "ADMINISTRADOR"].map(
    (role) => `/personas/rol/${role}`,
  ),
];
const snapshots = await Promise.all(
  paths.map(async (path) => {
    const response = await fetch(`${base}/api${path}`);
    if (!response.ok)
      throw Error(`No se pudo consultar ${path}: ${response.status}`);
    const source = await response.text();
    return {
      path,
      count: JSON.parse(source).length,
      sha256: createHash("sha256").update(source).digest("hex"),
    };
  }),
);
if (process.argv[2] === "after") {
  const before = JSON.parse(
    await readFile(new URL("api-antes.json", output), "utf8"),
  );
  await writeFile(
    new URL("api-despues.json", output),
    JSON.stringify(snapshots, null, 2),
  );
  const changes = snapshots.filter(current => before.find(previous => previous.path === current.path)?.sha256 !== current.sha256).map(current => ({ path: current.path, beforeCount: before.find(previous => previous.path === current.path)?.count, afterCount: current.count }));
  await writeFile(new URL('api-comparacion.json', output), JSON.stringify({ unchanged: changes.length === 0, changes }, null, 2));
  if (changes.length) {
    console.log('Se registraron diferencias entre lecturas; revisar la actividad concurrente sin revertir registros:', JSON.stringify(changes));
    if (!process.argv.includes('--report-only')) process.exitCode = 1;
  } else console.log('Las seis consultas de negocio conservan los mismos conteos y hashes.');
} else {
  await writeFile(
    new URL("api-antes.json", output),
    JSON.stringify(snapshots, null, 2),
  );
  console.log(
    "Estado inicial registrado sin guardar datos personales:",
    snapshots.map((s) => `${s.path}: ${s.count}`).join(", "),
  );
}
