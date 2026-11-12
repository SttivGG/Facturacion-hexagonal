export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  costo: number | string;
  precioVenta: number | string;
  moneda: string;
  proveedorId: string | null;
  activo: boolean;
  imagenId: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}
export const roles = [
  "CLIENTE",
  "PROVEEDOR",
  "TRABAJADOR",
  "ADMINISTRADOR",
] as const;
export type Rol = (typeof roles)[number];
export const roleNames: Record<Rol, string> = {
  CLIENTE: "Cliente",
  PROVEEDOR: "Proveedor",
  TRABAJADOR: "Trabajador",
  ADMINISTRADOR: "Administrador",
};
export interface Persona {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string | null;
  correo: string | null;
  telefono: string | null;
  telefonoAlternativo: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  pais: string | null;
  fechaNacimiento: string | null;
  observaciones: string | null;
  roles: Rol[];
  activo: boolean;
  fechaCreacion: string;
  fechaActualizacion: string;
}
export interface Factura {
  id: number;
  numeroFactura: string;
  clienteId: string;
  vendedorId: string | null;
  clienteNombre: string;
  clienteDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  subtotal: number | string;
  impuestos: number | string;
  total: number | string;
  totalPagado: number | string;
  saldoPendiente: number | string;
  estado: "PENDIENTE" | "PARCIAL" | "PAGADA";
  modalidad: "CREDITO" | "CONTADO";
  detalles: DetalleFactura[];
  pagos: Pago[];
}
export interface DetalleFactura {
  id: number;
  productoId: string;
  sku: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number | string;
  subtotal: number | string;
  total: number | string;
}
export const metodosPago = ["EFECTIVO", "TRANSFERENCIA", "NEQUI"] as const;
export type MetodoPago = (typeof metodosPago)[number];
export interface PagoRequest {
  metodoPago: MetodoPago;
  monto: string;
  referencia?: string | null;
  observaciones?: string | null;
}
export interface Pago extends Omit<PagoRequest, "monto"> {
  id: number;
  facturaId: number;
  fechaPago: string;
  monto: number | string;
}
export interface FacturaRequest {
  clienteId: string;
  vendedorId?: string;
  modalidad: Factura["modalidad"];
  fechaVencimiento?: string;
  detalles: { productoId: string; cantidad: number }[];
  pagosIniciales: PagoRequest[];
}
export type Page =
  | "dashboard"
  | "productos"
  | "personas"
  | "facturas"
  | "venta"
  | "creditos"
  | "predicciones"
  | "apariencia";
