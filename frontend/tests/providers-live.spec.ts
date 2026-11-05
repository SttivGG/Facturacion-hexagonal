import { test, expect } from "@playwright/test";
import type { Persona } from "../src/types";

test.skip(process.env.PROVIDER_READ_ONLY_TESTS !== "1", "Requiere backend local; solo lecturas reales y cualquier escritura bloqueada.");

test("carga proveedores reales sin escribir datos", async ({ page }) => {
  const attemptedWrites: string[] = [];
  await page.route("**/api/**", route => {
    if (route.request().method() === "GET") return route.continue();
    attemptedWrites.push(route.request().method() + " " + route.request().url());
    return route.abort();
  });
  await page.goto("/#/productos");
  const loaded = page.waitForResponse(response => response.url().endsWith("/api/personas/rol/PROVEEDOR"));
  await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
  const response = await loaded;
  expect(response.status()).toBe(200);
  const people = await response.json() as Persona[];
  const active = people.filter(person => person.activo && person.roles.includes("PROVEEDOR"));
  const editor = page.getByRole("dialog", { name: "Nuevo producto", exact: true });
  await expect(editor.getByText(/La consulta por rol devuelve hasta 100 personas/)).toBeVisible();
  await expect(editor.getByRole("radio")).toHaveCount(active.length + 1);
  for (const person of active) {
    await expect(editor.locator(".provider-option").filter({ hasText: `${person.nombres} ${person.apellidos || ""}`.trim() }).filter({ hasText: `${person.tipoDocumento} ${person.numeroDocumento}` })).toBeVisible();
  }
  if (active.length) {
    await editor.getByRole("radio").nth(1).check();
    await expect(editor.getByRole("radio").nth(1)).toBeChecked();
  }
  expect(attemptedWrites).toEqual([]);
});
