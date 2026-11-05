import { useRef, useState } from "react";
import { api, cents, money } from "../api";
import { mutationFailure, validatePayments } from "../sales";
import type { Factura } from "../types";
import { blankPayment, PaymentFields } from "./PaymentFields";
import { Button, Confirm, ErrorNotice, Overlay } from "./ui";

export function PaymentEditor({ invoice, onClose, onSaved }: {
  invoice: Factura; onClose: () => void; onSaved: (invoice: Factura) => void;
}) {
  const [payment, setPayment] = useState(blankPayment);
  const [current, setCurrent] = useState(invoice);
  const [reviewed, setReviewed] = useState<Factura>();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  function validate(fresh: Factura) {
    if (fresh.modalidad !== "CREDITO" || fresh.estado === "PAGADA") return "Esta factura no admite más abonos.";
    return validatePayments([payment], cents(fresh.saldoPendiente), false);
  }
  async function review() {
    if (lock.current || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const fresh = await api.invoice(invoice.id);
      setCurrent(fresh);
      const invalid = validate(fresh);
      if (invalid) setError(invalid); else setReviewed(fresh);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo consultar el saldo actual."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit() {
    if (lock.current || uncertain || !reviewed) return;
    lock.current = true; setBusy(true); setError("");
    let posting = false;
    try {
      const fresh = await api.invoice(invoice.id);
      setCurrent(fresh);
      const invalid = validate(fresh);
      if (invalid) { setReviewed(undefined); setError(invalid); return; }
      if (cents(fresh.saldoPendiente) !== cents(reviewed.saldoPendiente)) {
        setReviewed(undefined); setError("El saldo cambió desde la confirmación. Revisa el saldo actual y confirma de nuevo."); return;
      }
      posting = true;
      const saved = await api.payInvoice(invoice.id, payment);
      setReviewed(undefined); onSaved(saved);
    } catch (reason) {
      setReviewed(undefined);
      if (posting) { const failure = mutationFailure(reason); setError(failure.message); setUncertain(failure.uncertain); }
      else setError(reason instanceof Error ? reason.message : "No se pudo comprobar el saldo. No se envió el pago.");
    } finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Overlay open title="Registrar abono" busy={busy} onClose={onClose} footer={<><Button onClick={onClose} disabled={busy}>Cerrar</Button><Button type="submit" form="payment-form" variant="primary" busy={busy} disabled={uncertain}>Revisar abono</Button></>}>
      <p className="form-intro">{current.numeroFactura} · {current.clienteNombre}</p>
      <dl className="sale-totals"><div><dt>Saldo actual</dt><dd data-testid="payment-balance">{money(current.saldoPendiente)}</dd></div></dl>
      <form id="payment-form" onSubmit={event => { event.preventDefault(); void review(); }}>
        <fieldset disabled={busy || uncertain}><PaymentFields value={payment} onChange={setPayment} notes /></fieldset>
      </form>
      {error && <ErrorNotice message={error} />}
      {uncertain && <a className="button button-secondary" href={`/facturas/${invoice.id}`}>Comprobar historial de pagos</a>}
    </Overlay>
    <Confirm open={Boolean(reviewed)} title="¿Confirmar el abono?" description={`${current.numeroFactura} · Abono ${money(/^\d+(\.\d{1,2})?$/.test(payment.monto) ? payment.monto : "0")} · Saldo posterior ${money(reviewed ? cents(reviewed.saldoPendiente) - cents(payment.monto) : 0n)}.`} danger={false} busy={busy} onCancel={() => setReviewed(undefined)} onConfirm={submit} />
  </>;
}
