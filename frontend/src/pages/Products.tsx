import {
  Grid2X2,
  List,
  Package,
  Pencil,
  Plus,
  Power,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api, money, request } from "../api";
import { useResource, readLocal, writeLocal } from "../hooks";
import type { Producto } from "../types";
import { ProductEditor } from "../components/ProductEditor";
import {
  Button,
  Confirm,
  Empty,
  ErrorNotice,
  IconButton,
  Loading,
  ProductImage,
  SearchField,
  Status,
} from "../components/ui";

export function Products({ notify }: { notify: (message: string) => void }) {
  const { data, loading, error, refresh } = useResource(api.products);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState(() =>
    readLocal<unknown>("nexo.productView", "grid") === "table"
      ? "table"
      : "grid",
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<Producto>();
  const [deactivate, setDeactivate] = useState<Producto>();
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const categories = useMemo(
    () => [...new Set(data?.map((p) => p.categoria || "Sin categoría"))].sort(),
    [data],
  );
  const filtered = useMemo(
    () =>
      data?.filter(
        (p) =>
          `${p.nombre} ${p.sku} ${p.categoria || ""}`
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es")) &&
          (status === "all" || p.activo === (status === "active")) &&
          (category === "all" || (p.categoria || "Sin categoría") === category),
      ) || [],
    [data, query, status, category],
  );
  function edit(product?: Producto) {
    setSelected(product);
    setEditorOpen(true);
  }
  async function confirmDeactivate() {
    if (!deactivate) return;
    setDeactivating(true);
    setDeactivateError("");
    try {
      await request(`/productos/${encodeURIComponent(deactivate.id)}`, {
        method: "DELETE",
      });
      setDeactivate(undefined);
      refresh();
      notify("Producto desactivado. Su historial se conserva.");
    } catch (reason) {
      setDeactivateError(
        reason instanceof Error ? reason.message : "No se pudo desactivar.",
      );
    } finally {
      setDeactivating(false);
    }
  }
  function changeView(next: string) {
    setView(next);
    writeLocal("nexo.productView", next);
  }
  const actions = (product: Producto) => (
    <div className="row-actions">
      <IconButton
        label={`Editar ${product.nombre}`}
        onClick={() => edit(product)}
      >
        <Pencil size={16} />
      </IconButton>
      {product.activo && (
        <IconButton
          label={`Desactivar ${product.nombre}`}
          onClick={() => {
            setDeactivateError("");
            setDeactivate(product);
          }}
        >
          <Power size={16} />
        </IconButton>
      )}
    </div>
  );
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">TU CATÁLOGO, EN ORDEN</span>
          <h1>
            Productos<span className="title-dot">.</span>
          </h1>
          <p>Todo lo que ofreces, en un solo lugar.</p>
        </div>
        <Button variant="primary" onClick={() => edit()}>
          <Plus size={18} />
          Nuevo producto
        </Button>
      </div>
      <section
        className="glass catalog-panel"
        aria-label="Catálogo de productos"
      >
        <div className="catalog-toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nombre, SKU o categoría"
          />
          <div className="filter-group">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <label>
              <span className="sr-only">Filtrar por categoría</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por estado</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
          </div>
          <div className="segmented compact" aria-label="Vista del catálogo">
            <IconButton
              label="Vista de tarjetas"
              aria-pressed={view === "grid"}
              onClick={() => changeView("grid")}
            >
              <Grid2X2 size={18} />
            </IconButton>
            <IconButton
              label="Vista de tabla"
              aria-pressed={view === "table"}
              onClick={() => changeView("table")}
            >
              <List size={18} />
            </IconButton>
          </div>
        </div>
        {error ? (
          <ErrorNotice message={error} retry={refresh} />
        ) : loading ? (
          <Loading label="Cargando catálogo" />
        ) : filtered.length === 0 ? (
          <Empty
            title={
              data?.length
                ? "No encontramos coincidencias"
                : "Tu catálogo empieza aquí"
            }
            description={
              data?.length
                ? "Prueba con otro término o cambia los filtros."
                : "Crea tu primer producto y organiza sus detalles, precios e imagen."
            }
            action={
              data?.length ? (
                <Button
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setCategory("all");
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : (
                <Button variant="primary" onClick={() => edit()}>
                  <Plus size={16} />
                  Crear producto
                </Button>
              )
            }
          />
        ) : view === "grid" ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-card-visual">
                  <ProductImage product={product} large />
                  <div className="product-card-status">
                    <Status active={product.activo} />
                  </div>
                </div>
                <div className="product-card-body">
                  <div className="product-meta">
                    <span>{product.categoria || "Sin categoría"}</span>
                    <span>{product.sku}</span>
                  </div>
                  <h2>{product.nombre}</h2>
                  <p>{product.descripcion || "Sin descripción"}</p>
                  <div className="product-card-footer">
                    <div>
                      <span className="price">
                        {money(product.precioVenta)}
                      </span>
                      <small>COP · Precio de venta</small>
                    </div>
                    {actions(product)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Catálogo de productos y precios en pesos colombianos
              </caption>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU / Categoría</th>
                  <th>Costo</th>
                  <th>Precio de venta</th>
                  <th>Estado</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="item-cell">
                        <ProductImage product={product} />
                        <span>
                          <strong>{product.nombre}</strong>
                          <small>
                            {product.descripcion || "Sin descripción"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{product.sku}</strong>
                      <small>{product.categoria || "Sin categoría"}</small>
                    </td>
                    <td className="numeric">{money(product.costo)}</td>
                    <td className="numeric">{money(product.precioVenta)}</td>
                    <td>
                      <Status active={product.activo} />
                    </td>
                    <td>{actions(product)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (
          <footer className="catalog-footer">
            <span>
              <Package size={14} aria-hidden="true" />
              {filtered.length} de {data?.length || 0} productos
            </span>
            <span>Precios en COP</span>
          </footer>
        )}
      </section>
      <ProductEditor
        onPersisted={refresh}
        open={editorOpen}
        product={selected}
        onClose={() => setEditorOpen(false)}
        onSaved={(message) => {
          refresh();
          notify(message);
        }}
      />
      <Confirm
        open={Boolean(deactivate)}
        title="¿Desactivar este producto?"
        description={`«${deactivate?.nombre || ""}» dejará de estar disponible para nuevas ventas. Se conservarán sus datos y facturas anteriores.`}
        onCancel={() => setDeactivate(undefined)}
        onConfirm={confirmDeactivate}
        busy={deactivating}
        error={deactivateError}
      />
    </>
  );
}
