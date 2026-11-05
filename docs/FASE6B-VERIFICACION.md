# Fase 6B: punto de venta, facturas, créditos y pagos

Implementación y verificación realizadas el 5 de noviembre de 2026. La [auditoría previa](FASE6B-AUDITORIA.md) documenta los DTO, endpoints, reglas y componentes encontrados antes de escribir código.

## Pantallas y contratos

| Ruta | Comportamiento |
| --- | --- |
| `/ventas/nueva` | Catálogo activo de MongoDB, búsqueda por nombre/SKU, categoría, imágenes GridFS o placeholder, carrito con cantidades enteras y eliminación, búsqueda exacta de cliente en Cassandra y alta mediante PersonEditor existente |
| `/facturas` | Historial completo, búsqueda por factura/cliente/documento y filtros locales por modalidad, estado y rango de fechas de emisión en Bogotá |
| `/facturas/:id` | Datos históricos guardados en MySQL, productos, precios, impuestos, vencimiento, pagos, estado, vendedor cuando existe y comprobante imprimible |
| `/creditos` | Facturas CREDITO, incluyendo pendientes, parciales y pagadas; saldo por cobrar de los resultados y registro de abonos |

Se conservan los enlaces antiguos `/#/venta`, `/#/facturas` y `/#/creditos`. Las rutas directas usan el fallback SPA ya configurado en Nginx. El buscador global y los accesos del dashboard abren los módulos disponibles; se retiraron sus anuncios de próxima fase.

La creación envía exclusivamente `clienteId`, `vendedorId` cuando se selecciona, `modalidad`, `fechaVencimiento` para crédito, `detalles` con productoId/cantidad y `pagosIniciales`. No envía precios ni totales. La API acepta los importes decimales de pago como cadenas JSON y los convierte a BigDecimal, comprobado en la integración real.

El cliente debe estar activo y tener rol CLIENTE; el vendedor opcional debe estar activo y tener rol TRABAJADOR o ADMINISTRADOR. La búsqueda por documento evita depender del límite de 100 personas del listado por rol. El alta de cliente reutiliza el servicio HTTP y el formulario de Personas, precarga el documento buscado y selecciona la persona recién creada si cumple el rol.

## Importes, pagos y errores

- Vista previa en centavos enteros con BigInt; preservación de tokens monetarios JSON sin conversión a Number. Se comprueban también importes superiores a la precisión segura de JavaScript.
- Contado permite combinar EFECTIVO, TRANSFERENCIA y NEQUI hasta cubrir exactamente el total. Crédito exige vencimiento desde hoy en Bogotá y admite cero o varios pagos iniciales. Impuestos cero según la regla actual del backend.
- Importes positivos, máximo dos decimales, pagos hasta el total/saldo y cantidades enteras positivas. El backend decide los importes definitivos.
- Confirmación de emisión y abono sobre la pantalla/formulario actual. Bloqueo visual más bloqueo síncrono con ref para evitar doble envío, incluso dos eventos en el mismo ciclo.
- Antes de confirmar un abono se consulta el saldo actual; antes del POST se vuelve a consultar. Si cambió, se solicita revisar y confirmar nuevamente. El control transaccional final sigue en MySQL.
- Sin reintentos automáticos de facturas o pagos. Fallos de red, timeout, respuesta inválida o error del servidor durante una escritura se tratan como resultado incierto, bloquean el formulario y ofrecen comprobar el historial antes de repetir.
- Errores HTTP de validación muestran el detalle y los campos devueltos por la API; conservan los datos ingresados. Los errores de lectura tienen reintento y se distinguen de listas vacías.

## Comprobante y diseño

Se reutilizaron Urbanist, tokens Sorvo, naranja #F58136, paneles glass, sidebar compacto y header flotante. No se cambió el diseño global. El POS usa dos columnas en escritorio y apila catálogo/resumen en pantallas menores. Las tablas se desplazan dentro de su panel sin desbordar la página. Se conservaron modo oscuro y prefers-reduced-motion.

`window.print()` y `@media print` producen un comprobante A4 con encabezado Nexo, cliente, productos históricos, totales, pagos, saldo y vendedorId si existe. La impresión elimina navegación, diálogos y notificaciones; permite repetir encabezados de tabla y partir texto largo. No incluye datos tributarios inventados ni afirmaciones de facturación electrónica.

La API solo guarda el identificador del vendedor; por eso se muestra ese dato, sin consultar o inventar un nombre histórico. El detalle no consulta precios de MongoDB. Las capturas de pruebas visuales usan fixtures identificables; los archivos `integracion-*` documentan registros ficticios reales creados y eliminados durante la integración.

Capturas de las nuevas pantallas:

- [POS escritorio](capturas/fase6b/-ventas-nueva-light-desktop.png), [tablet](capturas/fase6b/-ventas-nueva-light-tablet.png), [móvil](capturas/fase6b/-ventas-nueva-light-mobile.png) y [modo oscuro](capturas/fase6b/-ventas-nueva-dark-desktop.png).
- [Historial](capturas/fase6b/-facturas-light-desktop.png), [créditos](capturas/fase6b/-creditos-light-desktop.png), [detalle](capturas/fase6b/-facturas-42-light-desktop.png).
- [Comprobante PDF con datos de la integración real](capturas/fase6b/integracion-comprobante.pdf).

## Pruebas ejecutadas

1. `npm run build`: TypeScript y Vite aprobados. Imagen Docker reconstruida y frontend actualizado sin modificar Compose, puertos ni volúmenes.
2. `UI_MUTATION_TESTS=1 npm run test:e2e` (variable configurada con sintaxis PowerShell): **99 pruebas aprobadas**, cero omitidas, en escritorio 1440×1000, tablet 768×1024 y móvil 375×812. Incluye 19 escenarios de ventas por tamaño y las pruebas anteriores de dashboard, productos, imágenes, personas, roles, formularios, apariencia y navegación. Las seis ejecuciones de altas/ediciones existentes limpiaron sus propios registros ficticios.
3. `mvn test -q`: **81 pruebas aprobadas**; las cinco de MySQL se habilitaron por separado en el siguiente paso. Ejecución local con Java 22 compilando para Java 21.
4. `pwsh -File scripts/Test-MySqlDocker.ps1`: **5 pruebas aprobadas** en Java 21 dentro de Docker con MySQL 8.4 real; persistencia, rollback y concurrencia. Total backend: **86 aprobadas**. [Resumen por clase](capturas/fase6b/pruebas-backend.json); log completo en `backend/target/fase6b-mysql-tests.log`.
5. `npm run test:integration`: **14 comprobaciones aprobadas**, incluyendo venta desde la interfaz, dos abonos, persistencia después de reiniciar y limpieza. [Resultados, conteos y hashes](capturas/fase6b/integracion-resultados.json).
6. Tras los ajustes de legibilidad y pagos guardados, **9 comprobaciones adicionales aprobadas** para contado, impresión y aspecto en los tres tamaños. [Informe JSON](capturas/fase6b/pruebas-ajustes-finales.json).
7. Verificación final de foco tras seleccionar/crear cliente, emitir factura y cerrar abonos, junto con regresión de descarte, validación de Personas, teclado, movimiento reducido y capturas: **21 pruebas aprobadas**, sin fallos ni omisiones. El foco del cliente se restaura al finalizar el cierre animado del diálogo. [Informe final](capturas/fase6b/pruebas-foco-final.json).

La cobertura de ventas incluye selección/alta de cliente, búsqueda/categoría de productos, carrito, cantidades, cálculo decimal, contado mixto, crédito con/sin inicial, vendedor opcional, validación de pagos, historial/filtros, detalle histórico, registro de abonos, errores HTTP, escrituras inciertas, doble envío, cambio concurrente de saldo e impresión. Se verificó la ausencia de desbordamiento horizontal en ambos temas y movimiento reducido.

## Integración real y limpieza

Se creó el cliente con documento único `FASE6B-<UUID>` y un producto con SKU igual al marcador de ejecución. El POS facturó dos unidades a $10.000,25: total **$20.000,50**, crédito sin inicial, estado PENDIENTE. Desde el detalle se registraron **$5.000,10**: saldo **$15.000,40**, estado PARCIAL. El segundo abono de **$15.000,40** dejó saldo cero, dos pagos y estado PAGADA.

Se reinició únicamente `facturacion-backend`. La consulta posterior y la recarga del detalle conservaron exactamente cabecera, líneas históricas, pagos, importes y estado PAGADA. Se guardaron los valores antes/después en [integracion-factura.json](capturas/fase6b/integracion-factura.json).

La limpieza verificó primero tipo/número de documento e identificador del cliente ficticio. Eliminó en MySQL únicamente pagos, detalles y facturas asociados a ese cliente; eliminó sus índices/filas en Cassandra y el producto por SKU único en MongoDB. La línea base y el resultado final coinciden en conteos y hashes de productos, facturas y los cuatro roles. No se eliminaron registros de negocio, bases ni volúmenes. Los cinco servicios quedaron saludables.

## Reproducción

Con Docker y Chrome disponibles:

```powershell
# Raíz del repositorio
docker compose up -d --build --no-deps facturacion-frontend
pwsh -File scripts/Test-MySqlDocker.ps1

cd frontend
npm run build
$env:UI_MUTATION_TESTS = '1'
npm run test:e2e
npm run test:integration
```

La integración real crea registros ficticios y reinicia el backend. Ejecutarla sin escrituras concurrentes permite comparar fielmente la línea base. Los escenarios simulados de ventas no escriben en las bases. El informe HTML de la ejecución completa queda en `frontend/playwright-report/`.

No se añadió inventario, paginación de servidor, reintentos de escritura, claves de idempotencia, generación avanzada de PDF ni cambios al backend. El límite de idempotencia sigue siendo el de la API actual: una respuesta incierta exige consultar el historial antes de decidir repetir la operación.
