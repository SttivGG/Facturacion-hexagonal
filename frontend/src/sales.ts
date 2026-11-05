import { ApiError, cents } from "./api";
import type { PagoRequest, Producto } from "./types";

export interface CartLine { product: Producto; quantity: number }
export const amountPattern = /^\d{1,48}(\.\d{1,2})?$/;
export function decimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function cartTotal(cart: CartLine[]): bigint {
  return cart.reduce((sum, line) => sum + cents(line.product.precioVenta) * BigInt(line.quantity), 0n);
}
export function paymentTotal(payments: PagoRequest[]): bigint {
  return payments.reduce((sum, payment) => sum + (amountPattern.test(payment.monto) ? cents(payment.monto) : 0n), 0n);
}
export function validatePayments(payments: PagoRequest[], total: bigint, cash: boolean): string {
  if (payments.length > 100) return "Solo se admiten hasta 100 pagos iniciales.";
  if (payments.some(p => !amountPattern.test(p.monto) || cents(p.monto) <= 0n))
    return "Cada pago debe ser positivo y tener como máximo dos decimales (usa punto decimal).";
  const paid = paymentTotal(payments);
  if (paid > total) return "Los pagos superan el total disponible.";
  if (cash && (!payments.length || paid !== total)) return "Los pagos de contado deben cubrir exactamente el total.";
  return "";
}
export function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function mutationFailure(reason: unknown): { message: string; uncertain: boolean } {
  const uncertain = !(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500;
  if (uncertain) return {
    message: "No pudimos confirmar el resultado. La operación podría haberse guardado. Consulta el historial y sus pagos antes de volver a intentarlo.",
    uncertain,
  };
  const fields = Object.entries(reason.fields).map(([key, value]) => `${key}: ${value}`).join(". ");
  return { message: [reason.message, fields].filter(Boolean).join(" "), uncertain };
}
