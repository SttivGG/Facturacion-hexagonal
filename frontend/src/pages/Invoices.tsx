import { useCallback, useRef, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { api, cents, date, money } from "../api";
import { useResource } from "../hooks";
import type { Factura } from "../types";
import { Badge, Button, Empty, ErrorNotice, Loading, SearchField } from "../components/ui";
import { PaymentEditor } from "../components/PaymentEditor";
import { methodNames } from "../components/PaymentFields";

const stateNames = { PAGADA: "Pagada", PARCIAL: "Parcial", PENDIENTE: "Pendiente" };
export function InvoiceState({ state }: { state: Factura["estado"] }) {
  return <Badge tone={state === "PAGADA" ? "green" : state === "PARCIAL" ? "blue" : "amber"}>{stateNames[state]}</Badge>;
}
export function InvoiceSummary({ invoice: f }: { invoice: Factura }) {
  return <dl className="sale-totals invoice-totals">
    <div><dt>Modalidad</dt><dd>{f.modalidad === "CREDITO" ? "Crédito" : "Contado"}</dd></div>
    <div><dt>Estado</dt><dd><InvoiceState state={f.estado} /></dd></div>
    {f.fechaVencimiento && <div><dt>Vencimiento</dt><dd>{date(f.fechaVencimiento)}</dd></div>}
    <div><dt>Subtotal</dt><dd>{money(f.subtotal)}</dd></div>
    <div><dt>Impuestos</dt><dd>{money(f.impuestos)}</dd></div>
    <div className="grand-total"><dt>Total COP</dt><dd>{money(f.total)}</dd></div>
    <div><dt>Total pagado</dt><dd>{money(f.totalPagado)}</dd></div>
    <div className="grand-total"><dt>Saldo pendiente</dt><dd>{money(f.saldoPendiente)}</dd></div>
  </dl>;
}
export function Invoices({ credits = false, notify }: { credits?: boolean; notify: (message: string) => void }) {
  const resource = useResource(api.invoices);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payment, setPayment] = useState<Factura>();
  const catalog = useRef<HTMLElement>(null);
  function closePayment() {
    setPayment(undefined);
    requestAnimationFrame(() => catalog.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true }));
  }
  const all = (resource.data || []).filter(f => !credits || f.modalidad === "CREDITO");
  const filtered = all.filter(f => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(f.fechaEmision));
    return `${f.numeroFactura} ${f.clienteNombre} ${f.clienteDocumento}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")) && (!state || f.estado === state) && (!mode || f.modalidad === mode) && (!from || day >= from) && (!to || day <= to);
  }).sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision) || b.id - a.id);
  const balance = filtered.reduce((sum, f) => sum + cents(f.saldoPendiente), 0n);
  return <>
    <div className="page-title"><div><span className="eyebrow">{credits ? "TU CARTERA, A LA VISTA" : "EL REGISTRO DE TU NEGOCIO"}</span><h1>{credits ? "Créditos y pagos." : "Facturas."}</h1><p>{credits ? "Consulta vencimientos y registra abonos sobre el saldo actual." : "Consulta tus ventas y sus comprobantes."}</p></div><a href="/ventas/nueva" className="button button-primary">Nueva venta</a></div>
    <section ref={catalog} className="panel glass catalog-panel invoice-catalog" aria-label={credits ? "Lista de créditos" : "Historial de facturas"}>
      <div className="catalog-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Buscar factura, cliente o documento" />
        <label>Estado<select aria-label="Estado de factura" value={state} onChange={e => setState(e.target.value)}><option value="">Todos</option>{Object.entries(stateNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        {!credits && <label>Modalidad<select aria-label="Modalidad" value={mode} onChange={e => setMode(e.target.value)}><option value="">Todas</option><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select></label>}
        <label>Desde<input aria-label="Fecha desde" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input aria-label="Fecha hasta" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      {resource.loading ? <Loading label="Cargando facturas" /> : resource.error ? <ErrorNotice message={resource.error} retry={resource.refresh} /> : !filtered.length ? <Empty icon={FileText} title="Sin facturas para mostrar" description="Las ventas registradas aparecerán aquí. Ajusta los filtros si ya existen facturas." /> : <div className="table-scroll"><table className="data-table invoice-table">
        <thead><tr><th>Factura / emisión</th><th>Cliente</th><th>Modalidad</th><th>Total</th><th>Pagado</th><th>Saldo pendiente</th>{credits && <th>Vencimiento</th>}<th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{filtered.map(f => <tr key={f.id}>
          <td><a className="invoice-link" href={`/facturas/${f.id}`}>{f.numeroFactura}</a><small>{date(f.fechaEmision)}</small></td>
          <td><strong>{f.clienteNombre}</strong><small>{f.clienteDocumento}</small></td><td>{f.modalidad === "CREDITO" ? "Crédito" : "Contado"}</td>
          <td>{money(f.total)}</td><td>{money(f.totalPagado)}</td><td>{money(f.saldoPendiente)}</td>{credits && <td>{f.fechaVencimiento ? date(f.fechaVencimiento) : "—"}</td>}
          <td><InvoiceState state={f.estado} /></td><td><div className="sale-actions"><a className="button button-ghost" href={`/facturas/${f.id}`}>Ver detalle</a>{f.modalidad === "CREDITO" && f.estado !== "PAGADA" && <Button onClick={() => setPayment(f)}>Registrar abono</Button>}</div></td>
        </tr>)}</tbody>
      </table></div>}
      {!resource.loading && !resource.error && <div className="catalog-footer">{filtered.length} facturas · Saldo por cobrar en resultados: {money(balance)} · Filtros locales</div>}
    </section>
    {payment && <PaymentEditor key={payment.id} invoice={payment} onClose={closePayment} onSaved={() => { closePayment(); resource.refresh(); notify("Abono registrado. Saldo y estado actualizados."); }} />}
  </>;
}
export function InvoiceDetail({ id, notify }: { id: number; notify: (message: string) => void }) {
  const loader = useCallback((signal: AbortSignal) => api.invoice(id, signal), [id]);
  const resource = useResource(loader);
  const [updated, setUpdated] = useState<Factura>();
  const [payment, setPayment] = useState(false);
  const actions = useRef<HTMLDivElement>(null);
  function closePayment() {
    setPayment(false);
    requestAnimationFrame(() => actions.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
  }
  const f = updated || resource.data;
  return <>
    <div className="page-title"><div><span className="eyebrow">COMPROBANTE DE VENTA</span><h1>Detalle de factura.</h1></div><a className="button button-secondary" href="/facturas">Volver a facturas</a></div>
    {resource.loading && !f ? <Loading label="Cargando factura" /> : resource.error && !f ? <ErrorNotice message={resource.error} retry={resource.refresh} /> : f && <>
      <div ref={actions} className="invoice-actions"><Button variant="primary" onClick={() => window.print()}><Printer size={17} aria-hidden="true" />Imprimir comprobante</Button>{f.modalidad === "CREDITO" && f.estado !== "PAGADA" && <Button onClick={() => setPayment(true)}>Registrar abono</Button>}</div>
      <article className="panel glass receipt" aria-label={`Comprobante ${f.numeroFactura}`}>
        <header className="receipt-header"><div><span className="receipt-brand">Nexo.</span><p>Comprobante de venta</p></div><div><h2>{f.numeroFactura}</h2><p>Emisión: {date(f.fechaEmision)}</p></div></header>
        <section className="receipt-parties"><div><span className="eyebrow">CLIENTE</span><h3>{f.clienteNombre}</h3><p>{f.clienteDocumento}</p></div>{f.vendedorId && <div><span className="eyebrow">VENDEDOR</span><p>Identificador: {f.vendedorId}</p></div>}</section>
        <div className="table-scroll"><table className="data-table receipt-products"><caption>Productos facturados · Valores históricos en COP</caption><thead><tr><th>Producto / SKU</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th><th>Total</th></tr></thead><tbody>{f.detalles.map(line => <tr key={line.id}><td><strong>{line.nombreProducto}</strong><small>{line.sku}</small></td><td>{line.cantidad}</td><td>{money(line.precioUnitario)}</td><td>{money(line.subtotal)}</td><td>{money(line.total)}</td></tr>)}</tbody></table></div>
        <InvoiceSummary invoice={f} />
        <section className="receipt-payments"><h3>Historial de pagos</h3>{!f.pagos.length ? <p>Sin pagos registrados.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Método</th><th>Monto COP</th><th>Referencia / observaciones</th></tr></thead><tbody>{f.pagos.map(p => <tr key={p.id}><td>{date(p.fechaPago)}</td><td>{methodNames[p.metodoPago]}</td><td>{money(p.monto)}</td><td>{p.referencia || "—"}{p.observaciones && <small>{p.observaciones}</small>}</td></tr>)}</tbody></table></div>}</section>
        <p className="receipt-note">Gracias por tu compra. Conserva este comprobante para consultar tu venta y sus pagos.</p>
      </article>
      {payment && <PaymentEditor invoice={f} onClose={closePayment} onSaved={fresh => { setUpdated(fresh); closePayment(); notify("Abono registrado. Saldo y estado actualizados."); }} />}
    </>}
  </>;
}
