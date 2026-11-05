import { useEffect, useRef, useState } from "react";
import { Plus, ShoppingBag, Trash2 } from "lucide-react";
import { api, cents, money } from "../api";
import { useResource } from "../hooks";
import { cartTotal, decimal, mutationFailure, paymentTotal, todayBogota, validatePayments, type CartLine } from "../sales";
import type { Factura, FacturaRequest, PagoRequest, Persona, Producto } from "../types";
import { PersonSelector } from "../components/PersonSelector";
import { blankPayment, methodNames, PaymentFields } from "../components/PaymentFields";
import { Field } from "../components/forms";
import { Badge, Button, Confirm, Empty, ErrorNotice, IconButton, Loading, ProductImage, SearchField } from "../components/ui";
import { InvoiceSummary } from "./Invoices";

export function Sale({ notify }: { notify: (message: string) => void }) {
  const products = useResource(api.products);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Persona>();
  const [seller, setSeller] = useState<Persona>();
  const [mode, setMode] = useState<Factura["modalidad"]>("CONTADO");
  const [due, setDue] = useState("");
  const [payments, setPayments] = useState<PagoRequest[]>([]);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FacturaRequest>();
  const [saved, setSaved] = useState<Factura>();
  const lock = useRef(false);
  const resultPanel = useRef<HTMLElement>(null);
  useEffect(() => { if (saved) resultPanel.current?.focus({ preventScroll: true }); }, [saved]);
  const total = cartTotal(cart);
  const paid = paymentTotal(payments);
  const remaining = total - paid;
  const active = products.data?.filter(p => p.activo) || [];
  const categories = [...new Set(active.map(p => p.categoria || "Sin categoría"))].sort();
  const filtered = active.filter(p => `${p.nombre} ${p.sku}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")) && (!category || (p.categoria || "Sin categoría") === category));
  function add(product: Producto) {
    setCart(previous => {
      const line = previous.find(l => l.product.id === product.id);
      if (line) return previous.map(l => l === line ? { ...l, quantity: Math.min(2147483647, l.quantity + 1) } : l);
      return previous.length < 1000 ? [...previous, { product, quantity: 1 }] : previous;
    });
  }
  function prepare() {
    if (lock.current || uncertain) return;
    let invalid = !customer ? "Selecciona un cliente activo con rol Cliente." : !cart.length ? "Agrega al menos un producto." : "";
    invalid ||= validatePayments(payments, total, mode === "CONTADO");
    if (mode === "CREDITO" && (!due || due < todayBogota())) invalid ||= "El crédito requiere vencimiento igual o posterior a hoy.";
    setError(invalid);
    if (invalid) return;
    setPending({
      clienteId: customer!.id,
      ...(seller ? { vendedorId: seller.id } : {}),
      modalidad: mode,
      ...(mode === "CREDITO" ? { fechaVencimiento: due } : {}),
      detalles: cart.map(l => ({ productoId: l.product.id, cantidad: l.quantity })),
      pagosIniciales: payments.map(p => ({ ...p, monto: decimal(cents(p.monto)) })),
    });
  }
  async function submit() {
    if (!pending || lock.current || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await api.createInvoice(pending);
      setSaved(result); setPending(undefined); notify(`Factura ${result.numeroFactura} generada.`);
    } catch (reason) {
      const failure = mutationFailure(reason);
      setError(failure.message); setUncertain(failure.uncertain); setPending(undefined);
    } finally { lock.current = false; setBusy(false); }
  }
  if (saved) return <>
    <div className="page-title"><div><span className="eyebrow">VENTA REGISTRADA</span><h1>Factura generada.</h1><p>{saved.numeroFactura} · {saved.clienteNombre}</p></div><Badge tone="green">Guardada</Badge></div>
    <section ref={resultPanel} tabIndex={-1} className="panel glass sale-success"><InvoiceSummary invoice={saved} />
      <div className="saved-payments"><h2>Pagos de la venta</h2>{saved.pagos.length ? <ul>{saved.pagos.map(payment => <li key={payment.id}><span>{methodNames[payment.metodoPago]}</span><strong>{money(payment.monto)}</strong>{payment.referencia && <small>{payment.referencia}</small>}</li>)}</ul> : <p>Sin pagos iniciales.</p>}</div>
      <div className="sale-actions"><a className="button button-primary" href={`/facturas/${saved.id}`}>Consultar o imprimir comprobante</a>
      <Button onClick={() => { setSaved(undefined); setCart([]); setPayments([]); setError(""); }}>Iniciar otra venta</Button></div>
    </section>
  </>;
  return <>
    <div className="page-title"><div><span className="eyebrow">CADA VENTA, TODO CONECTADO</span><h1>Punto de venta.</h1><p>Elige productos, selecciona tu cliente y registra la venta.</p></div><a className="button button-secondary" href="/facturas">Ver facturas</a></div>
    <div className="pos-layout">
      <section className="panel glass pos-catalog" aria-label="Catálogo de venta">
        <div className="catalog-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Buscar producto por nombre o SKU" />
          <label className="field"><span>Categoría</span><select aria-label="Categoría" value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        {products.loading ? <Loading label="Cargando catálogo" /> : products.error ? <ErrorNotice message={products.error} retry={products.refresh} /> : !filtered.length ? <Empty title="Sin productos disponibles" description="Prueba otra búsqueda o registra un producto activo en Productos." /> : <div className="pos-products">
          {filtered.map(product => <article className="pos-product" key={product.id}>
            <ProductImage product={product} large /><div><small>{product.categoria || "Sin categoría"}</small><h2>{product.nombre}</h2><span className="mono">{product.sku}</span><strong>{money(product.precioVenta)}</strong>
            <Button type="button" disabled={busy || uncertain} onClick={() => add(product)} aria-label={`Agregar ${product.nombre}`}><Plus size={16} aria-hidden="true" />Agregar</Button></div>
          </article>)}
        </div>}
        <div className="catalog-footer">{filtered.length} productos activos · Precios en COP</div>
      </section>
      <form className="panel glass pos-summary" onSubmit={event => { event.preventDefault(); prepare(); }} aria-label="Resumen de venta">
        <fieldset disabled={busy || uncertain}>
          <legend><ShoppingBag size={20} aria-hidden="true" />Resumen de venta</legend>
          <PersonSelector value={customer} onSelect={setCustomer} notify={notify} />
          <details className="seller-details"><summary>Asignar vendedor (opcional)</summary><PersonSelector value={seller} onSelect={setSeller} seller notify={notify} /></details>
          <section className="cart-section" aria-label="Productos en carrito"><h3>Tu carrito <Badge>{cart.length}</Badge></h3>
            {!cart.length && <p className="field-hint">Agrega productos del catálogo para comenzar.</p>}
            {cart.map(line => <div className="cart-line" key={line.product.id}>
              <div><strong>{line.product.nombre}</strong><small>{money(line.product.precioVenta)} / unidad</small><b>{money(cents(line.product.precioVenta) * BigInt(line.quantity))}</b></div>
              <label><span className="sr-only">Cantidad de {line.product.nombre}</span><input type="number" min={1} max={2147483647} step={1} value={line.quantity} onChange={e => { const quantity = Number(e.target.value); if (Number.isInteger(quantity) && quantity > 0 && quantity <= 2147483647) setCart(previous => previous.map(l => l.product.id === line.product.id ? { ...l, quantity } : l)); }} /></label>
              <IconButton label={`Eliminar ${line.product.nombre}`} onClick={() => setCart(previous => previous.filter(l => l.product.id !== line.product.id))}><Trash2 size={17} /></IconButton>
            </div>)}
          </section>
          <dl className="sale-totals" aria-live="polite"><div><dt>Subtotal</dt><dd>{money(total)}</dd></div><div><dt>Impuestos</dt><dd>{money(0n)}</dd></div><div className="grand-total"><dt>Total estimado</dt><dd data-testid="sale-total">{money(total)}</dd></div></dl>
          <p className="field-hint">Los importes definitivos se confirman al guardar. Actualmente no se aplican impuestos.</p>
          <Field name="saleMode" label="Modalidad de venta">{props => <select {...props} value={mode} onChange={e => setMode(e.target.value as Factura["modalidad"])}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select>}</Field>
          {mode === "CREDITO" && <Field name="dueDate" label="Fecha de vencimiento" required>{props => <input {...props} type="date" min={todayBogota()} value={due} onChange={e => setDue(e.target.value)} />}</Field>}
          <div className="payment-heading"><h3>{mode === "CONTADO" ? "Pagos de contado" : "Pagos iniciales opcionales"}</h3></div>
          {payments.map((payment, index) => <div className="initial-payment" key={index}><PaymentFields value={payment} prefix={` ${index + 1}`} onChange={value => setPayments(previous => previous.map((p, i) => i === index ? value : p))} /><Button type="button" variant="ghost" onClick={() => setPayments(previous => previous.filter((_, i) => i !== index))}>Quitar pago {index + 1}</Button></div>)}
          <Button type="button" disabled={payments.length >= 100} onClick={() => setPayments(previous => [...previous, { ...blankPayment(), monto: remaining > 0n ? decimal(remaining) : "" }])}><Plus size={16} aria-hidden="true" />Agregar pago</Button>
          <dl className="sale-totals" aria-live="polite"><div><dt>Pagos registrados</dt><dd>{money(paid)}</dd></div><div><dt>{remaining < 0n ? "Exceso de pago" : "Saldo pendiente estimado"}</dt><dd data-testid="sale-remaining">{money(remaining < 0n ? -remaining : remaining)}</dd></div></dl>
          <Button className="generate-invoice" type="submit" variant="primary" busy={busy}>Generar factura</Button>
        </fieldset>
        {error && <ErrorNotice message={error} />}
        {uncertain && <a className="button button-secondary" href="/facturas">Comprobar historial antes de repetir</a>}
      </form>
    </div>
    <Confirm open={Boolean(pending)} title="¿Generar esta factura?" description={`${customer?.nombres || "Cliente"} · ${mode === "CREDITO" ? "Crédito" : "Contado"} · Total estimado ${money(total)} · Pagos ${money(paid)} · Saldo ${money(remaining)}. Se usarán los precios vigentes al guardar.`} danger={false} busy={busy} onCancel={() => setPending(undefined)} onConfirm={submit} />
  </>;
}
