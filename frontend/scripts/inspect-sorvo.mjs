import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1249, height: 1295 },
  colorScheme: "light",
});
try {
  await page.goto("https://demo.codeandchill.store/sorvo/#/home", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
  console.log(
    "Controls:",
    JSON.stringify(
      await page.locator("button").evaluateAll((buttons) =>
        buttons.slice(0, 24).map((b) => ({
          text: b.textContent,
          aria: b.getAttribute("aria-label"),
          title: b.title,
        })),
      ),
    ),
  );
  const theme = page.getByRole("button", { name: /light|theme/i }).first();
  if (await theme.count()) {
    await theme.click();
    await page.waitForTimeout(400);
  }
  await page.mouse.move(1100, 500);
  await page.evaluate(() => document.fonts.ready);
  const measures = await page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll("aside,header,main,h1,section,article"),
    ];
    return {
      theme: document.documentElement.dataset,
      font: getComputedStyle(document.body).fontFamily,
      nodes: nodes.slice(0, 22).map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.slice(0, 85),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          background: style.backgroundColor,
          radius: style.borderRadius,
          padding: style.padding,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          shadow: style.boxShadow,
          blur: style.backdropFilter,
        };
      }),
    };
  });
  console.log(JSON.stringify(measures));
  await writeFile(
    new URL("../../docs/capturas/fase6a1/sorvo-medidas.json", import.meta.url),
    JSON.stringify(measures, null, 2),
  );
  await page.screenshot({
    path: fileURLToPath(
      new URL("../../docs/capturas/fase6a1/sorvo-claro.png", import.meta.url),
    ),
  });
} finally {
  await browser.close();
}
