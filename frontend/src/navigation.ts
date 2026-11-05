import type { Page } from "./types";

export function routePath(): string {
  return window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : window.location.pathname;
}
export function pagePath(page: Page): string {
  return page === "venta" ? "/ventas/nueva" : `/${page}`;
}
export function go(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
