import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("../../docs/capturas/fase6a1/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1249, height: 1295 },
  locale: "es-CO",
  timezoneId: "America/Bogota",
});
try {
  await page.goto("http://127.0.0.1:5173/#/dashboard", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: fileURLToPath(new URL("nexo-antes.png", output)),
    fullPage: false,
  });
  console.log("Nexo antes: capturado a 1249 × 1295.");
  for (const [name, url] of [
    ["sorvo-demo", "https://demo.codeandchill.store/sorvo/#/home"],
    ["sorvo-oficial", "https://codeandchill.store/templates/sorvo"],
  ]) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(1500);
      const audit = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        text: document.body.innerText.slice(0, 5000),
        font: getComputedStyle(document.body).fontFamily,
        images: [...document.images].map((i) => ({
          src: i.currentSrc,
          alt: i.alt,
          width: i.width,
          height: i.height,
        })),
        videos: [...document.querySelectorAll("video")].map((v) => ({
          src: v.currentSrc,
          poster: v.poster,
        })),
      }));
      console.log(name, JSON.stringify(audit));
      await writeFile(
        new URL(`${name}-auditoria.json`, output),
        JSON.stringify(audit, null, 2),
      );
      await page.screenshot({
        path: fileURLToPath(new URL(`${name}.png`, output)),
        fullPage: false,
      });
    } catch (error) {
      console.log(`${name}: ${error.message.split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
}
