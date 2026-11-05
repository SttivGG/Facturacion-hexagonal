import { metodosPago, type PagoRequest } from "../types";
import { Field } from "./forms";

export const blankPayment = (): PagoRequest => ({ metodoPago: "EFECTIVO", monto: "", referencia: "", observaciones: "" });
export const methodNames = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", NEQUI: "Nequi" };
export function PaymentFields({ value, onChange, prefix = "", notes = false }: {
  value: PagoRequest; onChange: (value: PagoRequest) => void; prefix?: string; notes?: boolean;
}) {
  return <div className="payment-fields">
    <div className="form-grid">
      <Field name={`${prefix}method`} label={`Método de pago${prefix}`}>
        {props => <select {...props} value={value.metodoPago} onChange={e => onChange({ ...value, metodoPago: e.target.value as PagoRequest["metodoPago"] })}>
          {metodosPago.map(method => <option key={method} value={method}>{methodNames[method]}</option>)}
        </select>}
      </Field>
      <Field name={`${prefix}amount`} label={`Monto COP${prefix}`} required hint="Usa punto para los decimales.">
        {props => <input {...props} inputMode="decimal" value={value.monto} maxLength={51} onChange={e => onChange({ ...value, monto: e.target.value })} />}
      </Field>
    </div>
    <Field name={`${prefix}reference`} label={`Referencia opcional${prefix}`}>
      {props => <input {...props} value={value.referencia || ""} maxLength={255} onChange={e => onChange({ ...value, referencia: e.target.value })} />}
    </Field>
    {notes && <Field name={`${prefix}notes`} label="Observaciones opcionales">
      {props => <textarea {...props} rows={3} value={value.observaciones || ""} maxLength={2000} onChange={e => onChange({ ...value, observaciones: e.target.value })} />}
    </Field>}
  </div>;
}
