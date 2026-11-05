import type { Factura, FacturaRequest, PagoRequest, Persona, Producto, Rol } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      headers:
        init.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      "No pudimos conectar con el servidor. Revisa la conexión e inténtalo de nuevo.",
      0,
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(
      problem.detail ||
        `No se pudo completar la solicitud (${response.status}).`,
      response.status,
      problem.errores,
    );
  }
  if (response.status === 204) return undefined as T;
  // Keep monetary JSON tokens as decimal strings, including amounts beyond JS safe precision.
  const source = await response.text();
  const tokens =
    /"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const monetary = new Set([
    "costo",
    "precioVenta",
    "subtotal",
    "impuestos",
    "total",
    "totalPagado",
    "saldoPendiente",
    "precioUnitario",
    "monto",
  ]);
  let key = "";
  const preserved = source.replace(tokens, (token) => {
    if (token.endsWith(":")) {
      key = JSON.parse(token.slice(0, -1));
      return token;
    }
    if (token.startsWith('"')) {
      key = "";
      return token;
    }
    const result = monetary.has(key) ? JSON.stringify(token) : token;
    key = "";
    return result;
  });
  return JSON.parse(preserved) as T;
}

export const api = {
  invoices: (signal: AbortSignal) => request<Factura[]>("/facturas", { signal }),
  invoice: (id: number, signal?: AbortSignal) => request<Factura>(`/facturas/${id}`, { signal }),
  createInvoice: (body: FacturaRequest) => request<Factura>("/facturas", {
    method: "POST", body: JSON.stringify(body),
  }),
  payInvoice: (id: number, body: PagoRequest) => request<Factura>(`/facturas/${id}/pagos`, {
    method: "POST", body: JSON.stringify(body),
  }),
  personByDocument: (type: string, document: string, signal?: AbortSignal) =>
    request<Persona>(`/personas/documento/${encodeURIComponent(type.trim())}/${encodeURIComponent(document.trim())}`, { signal }),
  person: (id: string, signal?: AbortSignal) =>
    request<Persona>(`/personas/${encodeURIComponent(id)}`, { signal }),
  products: (signal: AbortSignal) =>
    request<Producto[]>("/productos", { signal }),
  people: (role: Rol, signal: AbortSignal) =>
    request<Persona[]>(`/personas/rol/${role}`, { signal }),
  saveProduct: (body: object, id?: string) =>
    request<Producto>(`/productos${id ? `/${encodeURIComponent(id)}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  savePerson: (body: object, id?: string) =>
    request<Persona>(`/personas${id ? `/${encodeURIComponent(id)}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  image: (product: Producto) =>
    `/api/productos/${encodeURIComponent(product.id)}/imagen?v=${encodeURIComponent(product.fechaActualizacion)}`,
};

// Integer cents for previews and display. Spring Boot decides persisted amounts.
export function cents(value: number | string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(value));
  if (!match) throw new Error("Importe decimal inválido.");
  const fraction = match[3] || "";
  const scale = 2 + Number(match[4] || 0) - fraction.length;
  if (Math.abs(scale) > 100) throw new Error("Importe fuera de rango.");
  const digits = BigInt(match[2] + fraction);
  const divisor = scale < 0 ? 10n ** BigInt(-scale) : 1n;
  if (digits % divisor !== 0n) throw new Error("El importe admite hasta dos decimales.");
  const result = scale >= 0 ? digits * 10n ** BigInt(scale) : digits / divisor;
  return match[1] ? -result : result;
}
export function money(value: number | string | bigint): string {
  const amount = typeof value === "bigint" ? value : cents(value);
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${amount < 0n ? "−" : ""}$ ${whole.toLocaleString("es-CO")}${fraction === "00" ? "" : `,${fraction}`}`;
}
export function date(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
