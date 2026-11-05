import { mkdir, writeFile } from "node:fs/promises";
const media = new URL("../public/media/", import.meta.url);
const fonts = new URL("../public/fonts/", import.meta.url);
await Promise.all([
  mkdir(media, { recursive: true }),
  mkdir(fonts, { recursive: true }),
]);
const photos = [
  ["comercio.webp", "photo-1441986300917-64674bd600d8", 1600, 76],
  ["aurora.webp", "photo-1470770841072-f978cf4d019e", 960, 46],
  ["bosque.webp", "photo-1448375240586-882707db888b", 960, 46],
  ["horizonte.webp", "photo-1476514525535-07fb3b4ae5f1", 960, 46],
];
async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
  console.log(destination.pathname.split("/").at(-1), bytes.length, "bytes");
}
await Promise.all(
  photos.map(([name, id, width, quality]) =>
    download(
      `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=${quality}&fm=webp`,
      new URL(name, media),
    ),
  ),
);
const css = await (
  await fetch(
    "https://fonts.googleapis.com/css2?family=Urbanist:wght@400..700&display=swap",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    },
  )
).text();
const latin = css.split("/* latin */").at(-1);
const fontURL = latin.match(/url\((https:[^)]+)\)/)?.[1];
if (!fontURL?.endsWith(".woff2") || !css.includes("font-weight: 400 700"))
  throw Error("Urbanist Latin variable WOFF2 no encontrado.");
await download(fontURL, new URL("urbanist-latin.woff2", fonts));
await download(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/urbanist/OFL.txt",
  new URL("OFL-Urbanist.txt", fonts),
);
await writeFile(
  new URL("CREDITOS.md", media),
  `# Fotografías de Nexo\n\nDescargadas el 4 de noviembre de 2026. Licencia Unsplash: https://unsplash.com/license\nSon fotografías de ambientación, no productos del catálogo ni registros del negocio.\n\n${photos.map(([name, id, width, quality]) => `- ${name}: https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=${quality}&fm=webp`).join("\n")}\n\nUrbanist se distribuye aparte bajo SIL OFL 1.1 en /fonts/OFL-Urbanist.txt. La denominación Nexo Design System no cambia la autoría ni las licencias de estos recursos.\n`,
);
