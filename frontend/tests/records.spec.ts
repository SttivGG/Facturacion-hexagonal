import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// Explicit opt-in: creates isolated records through the real UI/API, then removes
// only this run's UUID document/SKU and its image from the existing Docker stores.
test.skip(
  process.env.UI_MUTATION_TESTS !== "1",
  "Activa UI_MUTATION_TESTS=1 para comprobar escrituras reales con limpieza.",
);

test("producto e imagen: guardado parcial, reintento, precisión, edición y desactivación", async ({
  page,
  request,
}) => {
  const sku = `UI-${randomUUID()}`;
  const productName = `Prueba UI ${sku}`;
  try {
    await page.goto("/#/productos");
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Nuevo producto" });
    await drawer.getByLabel("Nombre", { exact: false }).fill(productName);
    await drawer.getByLabel("SKU", { exact: false }).fill(sku);
    await drawer
      .getByLabel("Categoría", { exact: true })
      .fill("Prueba automatizada temporal");
    await drawer.getByLabel("Costo · COP", { exact: false }).fill("12345.67");
    await drawer
      .getByLabel("Precio de venta · COP", { exact: false })
      .fill("9007199254740993.01");
    await drawer
      .getByLabel("Imagen del producto", { exact: true })
      .setInputFiles({
        name: "prueba-ui.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await page.route("**/api/productos/*/imagen", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            detail: "Fallo de carga controlado por la prueba.",
          }),
        });
      } else await route.continue();
    });
    await drawer.getByRole("button", { name: "Guardar producto" }).click();
    await expect(drawer.getByRole("alert")).toContainText(
      "El producto se guardó, pero la imagen no",
    );
    const afterPartial = (
      await (await request.get("/api/productos")).json()
    ).filter((p: { sku: string }) => p.sku === sku);
    expect(afterPartial).toHaveLength(1);
    await page.unroute("**/api/productos/*/imagen");
    await drawer.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(drawer).not.toBeVisible();
    const card = page.locator(".product-card").filter({ hasText: productName });
    await expect(card).toBeVisible();
    await expect(card.locator(".price")).toHaveText(
      "$ 9.007.199.254.740.993,01",
    );
    await expect(card.locator("img")).toBeVisible();
    expect(
      await card
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    const saved = (await (await request.get("/api/productos")).json()).filter(
      (p: { sku: string }) => p.sku === sku,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].imagenId).toBeTruthy();
    await page
      .getByRole("button", { name: `Editar ${productName}`, exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "Editar producto" });
    await expect(
      edit.getByLabel("Precio de venta · COP", { exact: false }),
    ).toHaveValue("9007199254740993.01");
    await edit
      .getByLabel("Nombre", { exact: false })
      .fill(`${productName} editado`);
    await edit.getByRole("button", { name: "Guardar producto" }).click();
    await expect(edit).not.toBeVisible();
    await page
      .getByRole("button", {
        name: `Desactivar ${productName} editado`,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "¿Desactivar este producto?" })
      .getByRole("button", { name: "Sí, continuar" })
      .click();
    await expect(
      page
        .locator(".product-card")
        .filter({ hasText: productName })
        .getByText("Inactivo", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Vista de tabla" }).click();
    await expect(page.getByRole("row").filter({ hasText: sku })).toBeVisible();
  } finally {
    const script = `const admin=db.getSiblingDB('admin'); admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD); const base=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE); const own=base.productos.find({sku:${JSON.stringify(sku)}}).toArray(); for(const p of own){ if(p.imagenId){base.getCollection('fs.chunks').deleteMany({files_id:ObjectId(p.imagenId)});base.getCollection('fs.files').deleteOne({_id:ObjectId(p.imagenId)});} base.productos.deleteOne({_id:p._id,sku:${JSON.stringify(sku)}}); } if(base.productos.countDocuments({sku:${JSON.stringify(sku)}})!==0) throw Error('Limpieza incompleta'); print('Limpieza producto UI: '+own.length);`;
    const result = execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "facturacion-mongodb",
        "mongosh",
        "--quiet",
        "--eval",
        script,
      ],
      { encoding: "utf8", cwd: ".." },
    );
    console.log(result.trim());
  }
});

test("persona: creación real, documento inmutable, cambios de roles y desactivación", async ({
  page,
  request,
}) => {
  const documentNumber = randomUUID();
  const name = `Prueba UI ${documentNumber}`;
  try {
    await page.goto("/#/personas");
    await page
      .getByRole("button", { name: "Nueva persona", exact: true })
      .first()
      .click();
    const drawer = page.getByRole("dialog", { name: "Nueva persona" });
    await drawer
      .getByLabel("Tipo de documento", { exact: false })
      .fill("UI_TEST");
    await drawer
      .getByLabel("Número de documento", { exact: false })
      .fill(documentNumber);
    await drawer.getByLabel("Nombres", { exact: false }).fill(name);
    await drawer
      .getByLabel("Correo electrónico", { exact: true })
      .fill("ui@example.test");
    await drawer.getByLabel("Proveedor", { exact: true }).check();
    await drawer.getByRole("button", { name: "Guardar persona" }).click();
    await expect(drawer).not.toBeVisible();
    await page
      .getByRole("button", { name: `Editar ${name}`, exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "Editar persona" });
    await expect(
      edit.getByLabel("Número de documento", { exact: false }),
    ).toHaveAttribute("readonly", "");
    await edit.getByLabel("Proveedor", { exact: true }).uncheck();
    await edit.getByLabel("Trabajador", { exact: true }).check();
    await edit.getByRole("button", { name: "Guardar persona" }).click();
    await expect(edit).not.toBeVisible();
    const actual = await request.get(
      `/api/personas/documento/UI_TEST/${documentNumber}`,
    );
    expect(actual.ok()).toBeTruthy();
    expect((await actual.json()).roles.sort()).toEqual([
      "CLIENTE",
      "TRABAJADOR",
    ]);
    await page
      .getByRole("button", { name: `Desactivar ${name}`, exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "¿Desactivar esta persona?" })
      .getByRole("button", { name: "Sí, continuar" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "¿Desactivar esta persona?" }),
    ).not.toBeVisible();
    await expect(
      page
        .locator(".people-grid .person-card")
        .filter({ hasText: name })
        .getByText("Inactivo", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Tipo de documento para buscar", { exact: true })
      .fill("UI_TEST");
    await page
      .getByLabel("Número de documento para buscar", { exact: true })
      .fill(documentNumber);
    await page
      .locator(".lookup-form")
      .getByRole("button", { name: "Buscar", exact: true })
      .click();
    await expect(page.locator(".lookup-result .person-card")).toContainText(
      name,
    );
  } finally {
    const actual = await request.get(
      `/api/personas/documento/UI_TEST/${documentNumber}`,
    );
    if (actual.ok()) {
      const record = await actual.json();
      if (
        !/^[0-9a-f-]{36}$/.test(record.id) ||
        record.numeroDocumento !== documentNumber ||
        record.tipoDocumento !== "UI_TEST"
      )
        throw Error("Registro ajeno; se cancela la limpieza.");
      const cql =
        ["CLIENTE", "PROVEEDOR", "TRABAJADOR", "ADMINISTRADOR"]
          .map(
            (role) =>
              `DELETE FROM facturacion_personas.personas_por_rol WHERE rol='${role}' AND persona_id=${record.id};`,
          )
          .join(" ") +
        ` DELETE FROM facturacion_personas.personas_por_id WHERE id=${record.id}; DELETE FROM facturacion_personas.id_por_documento WHERE tipo_documento='UI_TEST' AND numero_documento='${documentNumber}' IF persona_id=${record.id};`;
      execFileSync(
        "docker",
        [
          "compose",
          "exec",
          "-T",
          "facturacion-cassandra",
          "cqlsh",
          "127.0.0.1",
          "9042",
          "-e",
          cql,
        ],
        { encoding: "utf8", cwd: ".." },
      );
      expect(
        (
          await request.get(`/api/personas/documento/UI_TEST/${documentNumber}`)
        ).status(),
      ).toBe(404);
      console.log("Limpieza persona UI: 1");
    } else expect(actual.status()).toBe(404);
  }
});
