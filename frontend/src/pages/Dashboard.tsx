import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Box,
  CircleDollarSign,
  Clock3,
  FileText,
  Layers3,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { api, cents, date, money, request } from "../api";
import { useResource } from "../hooks";
import type { Factura, Page, Persona, Producto } from "../types";
import {
  InvoiceActivity,
  SalesEvolution,
  salesDays,
} from "../components/SalesCharts";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  ProductImage,
  SectionHeading,
  TextLink,
} from "../components/ui";

async function loadDashboard(signal: AbortSignal) {
  const [products, clients, invoices] = await Promise.allSettled([
    api.products(signal),
    api.people("CLIENTE", signal),
    request<Factura[]>("/facturas", { signal }),
  ]);
  const result = <T,>(source: PromiseSettledResult<T>) =>
    source.status === "fulfilled"
      ? { data: source.value, error: "" }
      : {
          data: undefined,
          error:
            source.reason instanceof Error
              ? source.reason.message
              : "No disponible.",
        };
  return {
    products: result<Producto[]>(products),
    clients: result<Persona[]>(clients),
    invoices: result<Factura[]>(invoices),
  };
}

export function Dashboard({ navigate }: { navigate: (page: Page) => void }) {
  const { data, loading, error, refresh } = useResource(loadDashboard);
  const products = data?.products.data;
  const clients = data?.clients.data;
  const invoices = data?.invoices.data;
  const active = products?.filter((p) => p.activo).length || 0;
  const totalProducts = products?.length || 0;
  const collected = invoices?.reduce(
    (sum, i) => sum + cents(i.totalPagado),
    0n,
  );
  const pending = invoices?.reduce(
    (sum, i) => sum + cents(i.saldoPendiente),
    0n,
  );
  const total = invoices?.reduce((sum, i) => sum + cents(i.total), 0n);
  const days = salesDays(invoices || []);
  const periodCount = days.reduce((sum, day) => sum + day.count, 0);
  const categories = Object.entries(
    (products || []).reduce<Record<string, number>>((result, p) => {
      const key = p.categoria || "Sin categoría";
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const recent = [
    ...(products || []).map((p) => ({
      id: `p-${p.id}`,
      name: p.nombre,
      kind: "Producto actualizado",
      at: p.fechaActualizacion,
      icon: Package,
      page: "productos" as Page,
    })),
    ...(clients || []).map((p) => ({
      id: `c-${p.id}`,
      name: `${p.nombres} ${p.apellidos || ""}`,
      kind: "Cliente actualizado",
      at: p.fechaActualizacion,
      icon: Users,
      page: "personas" as Page,
    })),
    ...(invoices || []).map((i) => ({
      id: `i-${i.id}`,
      name: i.numeroFactura,
      kind: "Factura emitida",
      at: i.fechaEmision,
      icon: FileText,
      page: "facturas" as Page,
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 4);
  const kpis = [
    {
      name: "Productos registrados",
      value: products ? String(totalProducts) : "—",
      detail: products
        ? `${active} activos en el catálogo`
        : "Catálogo no disponible",
      icon: Box,
      tone: "rose",
      page: "productos" as Page,
    },
    {
      name: "Clientes consultados",
      value: clients ? String(clients.length) : "—",
      detail: "Hasta 100 por rol · Incluye inactivos",
      icon: Users,
      tone: "mint",
      page: "personas" as Page,
    },
    {
      name: "Facturas emitidas",
      value: invoices ? String(invoices.length) : "—",
      detail: "Historial completo de facturación",
      icon: Clock3,
      tone: "cream",
      page: "facturas" as Page,
    },
    {
      name: "Saldo pendiente",
      value: pending !== undefined ? money(pending) : "—",
      detail: "COP · Saldo total del historial",
      icon: Wallet,
      tone: "blue",
      page: "creditos" as Page,
    },
  ];
  return (
    <>
      <header className="page-title dashboard-title">
        <div>
          <h1>Tu negocio, en perspectiva.</h1>
          <p>Tus productos, personas y facturas, en un mismo lugar.</p>
        </div>
        <div className="editorial-actions">
          <Button onClick={() => navigate("productos")}>
            <BarChart3 size={16} />
            Ver catálogo
          </Button>
          <Button
            onClick={() => navigate("venta")}
            title="Abrir punto de venta"
          >
            <Plus size={16} />
            Nueva venta
          </Button>
        </div>
      </header>
      {error && <ErrorNotice message={error} retry={refresh} />}
      <section className="sales-hero" aria-label="Resumen de ventas">
        <img
          className="hero-photo"
          src="/media/comercio.webp"
          alt=""
          fetchPriority="high"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-meta">
            <span>
              <ShoppingBag size={13} aria-hidden="true" />
              Mi negocio · Resumen general
            </span>
            <time>
              {new Intl.DateTimeFormat("es-CO", {
                day: "numeric",
                month: "short",
                timeZone: "America/Bogota",
              }).format(new Date())}
            </time>
          </div>
          <div className="hero-main">
            <h2>Cada venta comienza aquí.</h2>
            <p>
              Un catálogo propio. Personas que vuelven. Una historia por
              construir.
            </p>
            <div className="hero-stats">
              <div>
                <strong>{total === undefined ? "—" : money(total)}</strong>
                <span>Total facturado · COP</span>
              </div>
              <div>
                <strong>{invoices ? invoices.length : "—"}</strong>
                <span>Facturas emitidas</span>
              </div>
              <div>
                <strong>{products ? active : "—"}</strong>
                <span>Productos activos</span>
              </div>
              <div>
                <strong>{clients ? clients.length : "—"}</strong>
                <span>Clientes consultados</span>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="sales-evolution hero-loading">
              <Loading label="Consultando facturación" />
            </div>
          ) : data?.invoices.error ? (
            <div className="sales-evolution">
              <ErrorNotice message={data.invoices.error} retry={refresh} />
            </div>
          ) : (
            <SalesEvolution days={days} />
          )}
          <div className="hero-footer">
            <Button onClick={() => navigate("venta")}>
              <Plus size={17} />
              Crear una venta
              <ArrowUpRight size={16} />
            </Button>
            <span>
              <span className="tiny-dot" />
              Punto de venta disponible
            </span>
          </div>
        </div>
      </section>
      <section
        className="glass invoice-activity"
        aria-label="Actividad de facturación"
      >
        <SectionHeading
          title="Actividad de facturación"
          description="Facturas emitidas · últimos 30 días"
        >
          <Badge tone="amber">
            <span className="tiny-dot" />
            {loading
              ? "Consultando"
              : !invoices
                ? "No disponible"
                : periodCount
                  ? "Datos reales"
                  : "Sin actividad"}
          </Badge>
        </SectionHeading>
        <div className="activity-total">
          <strong>{invoices ? periodCount : "—"}</strong>
          <span>facturas en el periodo</span>
        </div>
        {loading ? (
          <Loading label="Consultando actividad" />
        ) : data?.invoices.error ? (
          <ErrorNotice message={data.invoices.error} retry={refresh} />
        ) : (
          <InvoiceActivity days={days} />
        )}
      </section>
      <section className="kpi-grid" aria-label="Resumen del negocio">
        {kpis.map(({ name, value, detail, icon: Icon, tone, page }, index) => (
          <button
            className={`glass kpi kpi-${tone}`}
            style={{ "--card-index": index } as React.CSSProperties}
            key={name}
            onClick={() => navigate(page)}
          >
            <div className="kpi-top">
              <Icon size={16} aria-hidden="true" />
              <span>{name}</span>
            </div>
            <strong className={loading ? "skeleton-text" : ""}>{value}</strong>
            <div className="kpi-bottom">
              <small>{loading ? "Consultando registros…" : detail}</small>
              <ArrowUpRight size={17} aria-hidden="true" />
            </div>
          </button>
        ))}
      </section>
      <section className="glass recent-products">
        <SectionHeading
          title="Lo último en tu catálogo"
          description="Productos ordenados por fecha de creación."
        >
          <TextLink onClick={() => navigate("productos")}>Ver todos</TextLink>
        </SectionHeading>
        {loading ? (
          <Loading />
        ) : data?.products.error ? (
          <ErrorNotice message={data.products.error} retry={refresh} />
        ) : products?.length ? (
          <div className="mini-product-list">
            {[...products]
              .sort(
                (a, b) =>
                  Date.parse(b.fechaCreacion) - Date.parse(a.fechaCreacion),
              )
              .slice(0, 4)
              .map((product) => (
                <button
                  key={product.id}
                  className="mini-product"
                  onClick={() => navigate("productos")}
                >
                  <ProductImage product={product} />
                  <span className="grow">
                    <strong>{product.nombre}</strong>
                    <small>
                      {product.categoria || "Sin categoría"} · {product.sku}
                    </small>
                  </span>
                  <span className="mini-price">
                    {money(product.precioVenta)}
                    <small>COP</small>
                  </span>
                  <ArrowUpRight
                    size={16}
                    className="muted"
                    aria-hidden="true"
                  />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            title="Tu primer producto tiene un lugar aquí"
            description="Agrega los productos de tu negocio, sus precios y sus imágenes."
            action={
              <Button onClick={() => navigate("productos")}>
                <Plus size={16} />
                Agregar producto
              </Button>
            }
          />
        )}
      </section>
      <div className="dashboard-details-grid">
        <section className="glass catalog-overview">
          <SectionHeading
            title="Tu catálogo, de un vistazo"
            description="Productos y categorías de tus registros."
          >
            <Layers3 size={18} className="muted" />
          </SectionHeading>
          {loading ? (
            <Loading />
          ) : data?.products.error ? (
            <ErrorNotice message={data.products.error} retry={refresh} />
          ) : (
            <>
              <div className="catalog-overview-body">
                <div
                  className="catalog-ring"
                  style={
                    {
                      "--ring-progress": `${totalProducts ? (active / totalProducts) * 100 : 0}%`,
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <Package size={19} aria-hidden="true" />
                    <strong>{totalProducts}</strong>
                    <span>productos</span>
                  </div>
                </div>
                <div className="catalog-counts">
                  <div>
                    <span>
                      <i className="legend-dot mint-dot" />
                      Activos
                    </span>
                    <strong>{active}</strong>
                  </div>
                  <div>
                    <span>
                      <i className="legend-dot muted-dot" />
                      Inactivos
                    </span>
                    <strong>{totalProducts - active}</strong>
                  </div>
                  <p>El estado actual de tu catálogo.</p>
                </div>
              </div>
              <div className="category-list">
                {categories.length ? (
                  categories.map(([name, count], index) => (
                    <div className="category-row" key={name}>
                      <div>
                        <span>
                          <i className={`legend-dot category-${index}`} />
                          {name}
                        </span>
                        <span>
                          {count}{" "}
                          <small>
                            {count === 1 ? "producto" : "productos"}
                          </small>
                        </span>
                      </div>
                      <div className="category-track">
                        <span
                          style={{ width: `${(count / totalProducts) * 100}%` }}
                          className={`category-${index}`}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Las categorías aparecerán con tus productos.
                  </p>
                )}
              </div>
            </>
          )}
          <TextLink onClick={() => navigate("productos")}>
            Gestionar catálogo
          </TextLink>
        </section>
        <section className="glass finance-overview">
          <SectionHeading
            title="Así va tu facturación"
            description="Importes acumulados del historial completo."
          >
            <CircleDollarSign size={20} className="muted" />
          </SectionHeading>
          {loading ? (
            <Loading />
          ) : data?.invoices.error ? (
            <ErrorNotice message={data.invoices.error} retry={refresh} />
          ) : (
            <>
              <div className="finance-total">
                <span>Total facturado · COP</span>
                <strong>{money(total || 0n)}</strong>
              </div>
              <div className="finance-split">
                <div>
                  <ArrowDownLeft size={19} />
                  <small>Pagado</small>
                  <strong>{money(collected || 0n)}</strong>
                </div>
                <div>
                  <ArrowUpRight size={19} />
                  <small>Por cobrar</small>
                  <strong>{money(pending || 0n)}</strong>
                </div>
              </div>
              <div className="phase-note">
                <Sparkles size={18} />
                <p>
                  Ventas y cobros
                  <span>Registra ventas y consulta tus créditos.</span>
                </p>
                <Badge tone="green">Disponible</Badge>
              </div>
            </>
          )}
        </section>
      </div>
      <section className="glass recent-activity">
        <SectionHeading
          title="Últimos cambios"
          description="Fechas de los registros consultados."
        >
          <Clock3 size={18} className="muted" />
        </SectionHeading>
        {loading ? (
          <Loading />
        ) : recent.length ? (
          <div className="activity-list">
            {recent.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.page)}
                className="activity-item"
              >
                <span className="activity-icon">
                  <item.icon size={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.kind}</small>
                </span>
                <time dateTime={item.at}>{date(item.at)}</time>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={Clock3}
            title="Todo listo para comenzar"
            description="Los cambios aparecerán cuando existan registros disponibles."
          />
        )}
        {!loading &&
          (data?.clients.error ||
            data?.products.error ||
            data?.invoices.error) && (
            <p className="data-note">
              Vista parcial: hay fuentes que no se pudieron consultar.
            </p>
          )}
      </section>
      <section className="glass quick-access">
        <div>
          <Sparkles size={20} />
          <h2>Tu siguiente paso</h2>
        </div>
        <TextLink onClick={() => navigate("productos")}>
          Gestionar productos
        </TextLink>
        <TextLink onClick={() => navigate("personas")}>
          Conectar personas
        </TextLink>
      </section>
    </>
  );
}
