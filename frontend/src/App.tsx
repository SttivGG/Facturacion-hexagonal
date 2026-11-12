import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  House,
  Moon,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sun,
  Users,
  ChartNoAxesCombined,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import { useAppearance } from "./appearance";
import { useResource } from "./hooks";
import type { Page } from "./types";
import { Button, IconButton, Overlay, Toast } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { People } from "./pages/People";
import { Appearance } from "./pages/Appearance";
import { Predictions } from "./pages/Predictions";
import { Sale } from "./pages/Sale";
import { Invoices, InvoiceDetail } from "./pages/Invoices";
import { go, pagePath, routePath } from "./navigation";

const navItems = [
  { page: "dashboard", label: "Dashboard", icon: House },
  { page: "productos", label: "Productos", icon: Package },
  { page: "personas", label: "Personas", icon: Users },
  { page: "facturas", label: "Facturas", icon: FileText },
  { page: "venta", label: "Nueva venta", icon: ShoppingBag },
  { page: "predicciones", label: "Predicciones inteligentes", icon: ChartNoAxesCombined },
  {
    page: "creditos",
    label: "Créditos y pagos",
    icon: CreditCard,
  },
] as const;
const pageNames: Record<Page, string> = {
  dashboard: "Dashboard",
  productos: "Productos",
  personas: "Personas",
  facturas: "Facturas",
  venta: "Nueva venta",
  creditos: "Créditos y pagos",
  apariencia: "Configuración visual",
  predicciones: "Predicciones inteligentes",
};
function currentPage(): Page {
  const path = routePath();
  if (path === "/ventas/nueva") return "venta";
  if (/^\/facturas\/\d+$/.test(path)) return "facturas";
  const hash = path.replace(/^\//, "");
  return Object.hasOwn(pageNames, hash) ? (hash as Page) : "dashboard";
}
const loadHealth = (signal: AbortSignal) =>
  request<{ status: string }>("/health", { signal });

function Logo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <path
          d="M12 28V12l16 16V12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [route, setRoute] = useState(routePath);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const { preferences, update } = useAppearance();
  const health = useResource(loadHealth);
  const connected =
    health.data?.status === "OK" || health.data?.status === "UP";
  const mainRef = useRef<HTMLElement>(null);
  const notify = useCallback((next: string) => setMessage(next), []);
  const clearToast = useCallback(() => setMessage(""), []);
  useEffect(() => {
    const listener = () => {
      setPage(currentPage());
      setRoute(routePath());
    };
    window.addEventListener("hashchange", listener);
    window.addEventListener("popstate", listener);
    return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
  }, []);
  useEffect(() => {
    document.title = `${pageNames[page]} · Nexo`;
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
  }, [page, route]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (document.querySelector("dialog[open]")) return;
        setFinderOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const navigate = useCallback((next: Page) => {
    go(pagePath(next));
    setFinderOpen(false);
  }, []);
  function refresh() {
    setRefreshKey((v) => v + 1);
    health.refresh();
  }
  const navigation = () => (
    <>
      <a
        className="brand"
        href="#/dashboard"
        aria-label="Nexo, ir al dashboard"
        title="Nexo · Dashboard"
      >
        <Logo />
      </a>
      <nav aria-label="Navegación principal">
        {navItems.map(({ page: target, label, icon: Icon }) => (
          <a
            key={target}
            href={pagePath(target)}
            aria-current={page === target ? "page" : undefined}
            title={label}
            className={`nav-item ${page === target ? "active" : ""}`}
          >
            <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <a
          className={`nav-item ${page === "apariencia" ? "active" : ""}`}
          href="#/apariencia"
          aria-current={page === "apariencia" ? "page" : undefined}
          title="Configuración visual"
        >
          <Palette size={20} strokeWidth={1.7} aria-hidden="true" />
          <span className="sr-only">Configuración visual</span>
        </a>
        <div className="sidebar-footer">
          <span className="profile-avatar" title="Mi negocio · Espacio local">
            N
          </span>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="wallpaper" aria-hidden="true" />
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView();
        }}
      >
        Saltar al contenido
      </a>
      <div className="app-shell">
        <aside className="sidebar glass">{navigation()}</aside>
        <div className="main-shell">
          <header className="topbar glass">
            <div className="topbar-breadcrumb">
              <span className="desktop-only">Mi negocio</span>
              <ChevronRight
                size={14}
                className="desktop-only"
                aria-hidden="true"
              />
              <strong>{pageNames[page]}</strong>
            </div>
            <div className="topbar-actions">
              <span
                className={`connection-status ${connected ? "connected" : health.loading ? "checking" : "offline"}`}
                title={health.error || "Estado consultado en /api/health"}
              >
                <span className="tiny-dot" />
                <span>
                  {health.loading
                    ? "Conectando"
                    : connected
                      ? "Servidor conectado"
                      : "Sin conexión"}
                </span>
              </span>
              <button
                className="finder-trigger"
                aria-label="Buscar sección (Ctrl K)"
                title="Buscar sección (Ctrl K)"
                onClick={() => {
                  setFinderQuery("");
                  setFinderOpen(true);
                }}
              >
                <Search size={18} aria-hidden="true" />
              </button>
              <IconButton
                label={
                  preferences.theme === "dark"
                    ? "Activar modo claro"
                    : "Activar modo oscuro"
                }
                onClick={() =>
                  update({
                    theme: preferences.theme === "dark" ? "light" : "dark",
                  })
                }
              >
                {preferences.theme === "dark" ? (
                  <Sun size={19} />
                ) : (
                  <Moon size={19} />
                )}
              </IconButton>
              <IconButton label="Actualizar datos" onClick={refresh}>
                <RefreshCw size={18} className={health.loading ? "spin" : ""} />
              </IconButton>
              <Button
                variant="primary"
                className="header-create"
                title="Nueva venta"
                onClick={() => navigate("venta")}
              >
                <Plus size={17} />
                <span>Nueva venta</span>
              </Button>
            </div>
          </header>
          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            key={`${route}-${refreshKey}`}
            className="page-content"
          >
            {page === "dashboard" ? (
              <Dashboard navigate={navigate} />
            ) : page === "productos" ? (
              <Products notify={notify} />
            ) : page === "personas" ? (
              <People notify={notify} />
            ) : page === "apariencia" ? (
              <Appearance />
            ) : page === "predicciones" ? (
              <Predictions />
            ) : page === "venta" ? <Sale notify={notify} />
              : page === "creditos" ? <Invoices credits notify={notify} />
              : /^\/facturas\/\d+$/.test(route) ? <InvoiceDetail id={Number(route.split("/")[2])} notify={notify} />
              : <Invoices notify={notify} />}
            <footer className="page-footer">
              <span>
                <span className="tiny-dot" />
                Tu negocio. Todo conectado.
              </span>
              <span>
                Nexo<span className="footer-separator">/</span>Fase 6B
              </span>
            </footer>
          </main>
        </div>
      </div>
      <Overlay
        open={finderOpen}
        title="¿A dónde quieres ir?"
        onClose={() => setFinderOpen(false)}
        kind="modal"
      >
        <label className="finder-input">
          <span className="sr-only">Buscar una sección</span>
          <input
            autoFocus
            value={finderQuery}
            onChange={(e) => setFinderQuery(e.target.value)}
            placeholder="Escribe el nombre de una sección…"
          />
        </label>
        <div className="finder-results">
          {Object.entries(pageNames)
            .filter(([, name]) =>
              name
                .toLocaleLowerCase("es")
                .includes(finderQuery.toLocaleLowerCase("es")),
            )
            .map(([target, name]) => (
              <button key={target} onClick={() => navigate(target as Page)}>
                {name}
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            ))}
        </div>
        <Button variant="ghost" onClick={() => setFinderOpen(false)}>
          <ChevronLeft size={15} />
          Volver a mi espacio
        </Button>
      </Overlay>
      <Toast message={message} clear={clearToast} />
    </>
  );
}
