# Fase 6B: auditoría previa

Inspección realizada el 5 de noviembre de 2026 antes de implementar las pantallas.

- React 19, TypeScript, Vite y Tailwind; navegación propia mediante hash, sin biblioteca de rutas. Nginx ya sirve `index.html` para rutas SPA. Se conservarán enlaces antiguos y se añadirán las rutas solicitadas.
- Nexo Design System ya está aplicado: Urbanist local, tokens en `styles/tokens.css`, naranja #F58136, sidebar compacto, header flotante, paneles glass y preferencias de movimiento reducido. La evidencia propia se conserva en `docs/capturas/fase6a1`.
- `api.ts` centraliza fetch, timeout de 20 segundos, errores ProblemDetail (`detail`, `errores`) y preservación de importes JSON como cadenas. No hay reintentos automáticos. Se reutiliza este servicio.
- `ui.tsx` proporciona Button, Overlay, Confirm, Loading, Empty, ErrorNotice, ProductImage y Toast; `forms.tsx` proporciona Field. PersonEditor permite crear personas con rol CLIENTE y se reutilizará desde ventas.
- `FacturaRequest`: clienteId obligatorio; vendedorId opcional; modalidad CONTADO/CREDITO; fechaVencimiento; detalles con productoId y cantidad entera positiva; pagosIniciales con metodoPago, monto, referencia y observaciones. Máximos: 1000 detalles y 100 pagos. No se envían precios ni totales.
- Métodos reales: EFECTIVO, TRANSFERENCIA, NEQUI. Contado exige cobertura exacta. Crédito requiere vencimiento no anterior al día de emisión en Bogotá y admite inicial opcional. Ningún pago puede superar total/saldo; monto positivo con máximo dos decimales.
- FacturaService consulta clientes activos CLIENTE y vendedores activos TRABAJADOR/ADMINISTRADOR. GET `/personas/documento/{tipo}/{numero}` sirve para búsquedas exactas sin depender del límite del listado por rol.
- GET `/facturas` devuelve una lista completa, sin paginación ni filtros de consulta. GET `/facturas/{id}` devuelve la factura completa; POST `/facturas` crea; POST `/facturas/{id}/pagos` devuelve la factura actualizada. Búsquedas y filtros serán locales.
- MySQL conserva nombre/documento del cliente, detalles históricos, pagos, totales, estado y vencimiento. El vendedor solo se expone como vendedorId, sin nombre histórico. El comprobante mostrará ese identificador cuando exista, sin inventar datos ni reemplazarlos con consultas actuales.
- DetalleFactura usa precio histórico por cantidad. Factura.emitir fija impuestos en 0.00. La vista previa replicará esa regla con BigInt en centavos; la respuesta del backend decide los importes definitivos.
- Compose expone frontend 127.0.0.1:5173 y backend 127.0.0.1:8080. Navegador usa `/api` mediante proxy Vite/Nginx. MongoDB, Cassandra y MySQL solo están en la red interna. Los cinco servicios están saludables. No se requieren cambios de infraestructura.
- Se encontraron cambios previos sin confirmar en backend, frontend, documentación y Compose; se conservan.

La integración real usará identificadores ficticios únicos y limpieza limitada a esos registros. Las pruebas de interfaz usarán contratos simulados para cubrir errores y concurrencia sin modificar datos de negocio.
