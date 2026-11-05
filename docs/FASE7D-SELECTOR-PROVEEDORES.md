# Fase 7D — Selector de proveedores en productos

> Actualización: la [corrección del combobox de Nexo](FASE7D-CORRECCION-COMBOBOX.md) sustituye el grupo de radios descrito en esta implementación inicial. Incluye validación y capturas del selector actual.

## Alcance

Se sustituye el texto libre «ID del proveedor» por una selección de personas registradas. El contrato de productos conserva `proveedorId: String`, opcional, y no cambia el documento de MongoDB. No se modifican facturación, Druid, Docker ni esquemas de datos.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `frontend/src/components/ProviderSelector.tsx` | Consulta, filtro, selección, resolución histórica, reintento y búsqueda por documento. |
| `frontend/src/components/ProductEditor.tsx` | Integra el selector y la creación de proveedores, conservando formulario e imagen. |
| `frontend/src/components/PersonEditor.tsx` | Añade `initialRole`, opcional y con valor predeterminado `CLIENTE`; Productos utiliza `PROVEEDOR`. Conserva las mejoras previas de ubicaciones. |
| `frontend/src/api.ts` | Añade `api.person(id, signal)` sobre el GET existente por ID. |
| `frontend/src/styles/providers.css` | Estilos limitados al selector, con tokens de Nexo Design System, Urbanist, naranja, foco y movimiento reducido. |
| `backend/.../application/usecase/ProductoService.java` | Valida asociaciones nuevas o modificadas mediante `PersonaRepositoryPort`. |
| `backend/.../infrastructure/config/ProductoConfiguration.java` | Inyecta el puerto de personas en el servicio. |
| `backend/src/test/.../ProductoProveedorTests.java` | Casos de validación y compatibilidad histórica. |
| `backend/src/test/.../ProductoServiceTests.java`, `ProductoControllerTests.java` | Ajustan la inyección y prueban respuestas HTTP y regresiones de productos e imágenes. |
| `backend/src/test/.../MongoProductoAdapterTests.java`, `GridFsImagenAdapterTests.java` | Comprueban mapeo, precisión monetaria, referencias y bytes/MIME de imágenes. |
| `frontend/tests/providers.spec.ts` | Pruebas del flujo completo con API interceptada y almacenamiento en memoria. |
| `frontend/tests/providers-live.spec.ts` | Lectura de proveedores reales; bloquea cualquier escritura. Requiere activación explícita. |
| `scripts/Test-ProveedoresReadOnly.mjs` | Captura y compara conteos y SHA-256 de MongoDB, GridFS y Cassandra. |

`Products.tsx`, `PersonSelector.tsx`, los DTO y `PersonaRepositoryPort` se inspeccionaron y conservan sus contratos. Se reutilizan `Field`, `Button`, `Overlay`, `Confirm`, `ApiError`, las notificaciones de Productos y el editor de Personas.

## Funcionamiento

Al abrir el editor se consulta `GET /api/personas/rol/PROVEEDOR`. Solo se ofrecen personas activas con rol `PROVEEDOR`, aunque una respuesta contenga otros registros. Cada opción muestra nombre completo, tipo y número de documento y ciudad cuando existe. La búsqueda local ignora mayúsculas y tildes. Las consultas se cancelan al cerrar el editor; los resultados de peticiones canceladas no actualizan la selección.

El grupo utiliza radios nativos, etiquetas completas y un nombre accesible. Tab permite entrar y salir del grupo; las flechas cambian de opción. Las etiquetas tienen un área táctil de al menos 52 px de alto y foco visible. La lista permite desplazamiento y conserva el orden y los elementos seleccionados para mantener el foco. Incluye carga, error, reintento y lista vacía. «Sin proveedor» envía `null`; seleccionar una persona envía su UUID en el mismo `proveedorId`.

### Límite de la consulta

El backend devuelve **hasta 100 personas por rol, incluidas las inactivas**. El aviso permanece visible incluso cuando llegan menos registros: no se presenta la lista como catálogo completo. Nombre y ciudad se buscan únicamente entre los registros cargados, además de la referencia actual y las personas incorporadas en este flujo.

Para localizar una persona fuera del límite, el selector reutiliza `GET /api/personas/documento/{tipo}/{numero}`. Esta consulta utiliza el índice existente por documento en Cassandra y comprueba estado y rol antes de seleccionar. Un resultado inexistente, inactivo, sin rol o fallido no borra la selección anterior. No se añade un escaneo de Cassandra, `ALLOW FILTERING` ni una supuesta búsqueda global de nombres. Una futura búsqueda global por nombre o ciudad requerirá un modelo de consulta e índices adecuados, o paginación real del índice por rol; queda fuera de esta mejora.

### Creación de proveedores

La lista vacía muestra «No hay proveedores registrados. Puedes crear uno desde Personas.» El botón «Registrar proveedor en Personas» abre el `PersonEditor` existente con rol `PROVEEDOR` preseleccionado. Después de guardar una persona activa con ese rol, se selecciona su UUID.

El editor de Personas es un diálogo nativo hermano del diálogo de Productos y sus formularios no se anidan. El diálogo superior vuelve inerte el inferior. Al cerrarse Personas, el foco vuelve a la opción actual del proveedor. El formulario de producto sigue montado: conserva campos, archivo elegido y vista previa. La confirmación de descarte tampoco desmonta `ProductEditor`. Si se retira el rol Proveedor al crear la persona, se informa y no se asigna automáticamente.

## MongoDB y Cassandra

MongoDB conserva productos, importes Decimal128 y la referencia `proveedorId`; GridFS conserva imágenes. Cassandra conserva la persona canónica, sus roles y los índices por documento y rol. `proveedorId` es una referencia lógica entre almacenes, no una clave foránea ni una copia del nombre del proveedor.

El frontend resuelve la asociación mediante `GET /api/personas/{id}`, independientemente de que aparezca entre los primeros 100. La respuesta canónica por ID prevalece sobre una lista por rol desactualizada. Un proveedor inactivo o sin rol se muestra con su estado histórico; una referencia inexistente o inválida se presenta como no disponible. Ante problemas de conexión se informa que se conserva la asociación y se ofrece reintentar.

## Validación de aplicación

`ProductoService` recibe `PersonaRepositoryPort`; el dominio no depende de Cassandra ni de Spring.

| Operación | Regla |
| --- | --- |
| Crear o cambiar a un proveedor | Exige UUID completo válido, persona existente, activa y con rol `PROVEEDOR`. |
| Crear sin proveedor o retirar asociación | Acepta `null` o vacío; no consulta Cassandra. |
| Editar sin cambiar `proveedorId` | Conserva exactamente la referencia histórica y no consulta Cassandra. |
| UUID inválido, inexistente, inactivo o sin rol | Lanza `DatosInvalidosException`; REST responde 400 antes de guardar en MongoDB. |
| Cassandra no disponible al asignar | Propaga `PersistenciaPersonaException`; el manejador existente responde 503 y no guarda el cambio. |

El formulario ya no recorta referencias antiguas al guardar. Se pueden editar nombre, precios, categoría e imagen aunque el proveedor histórico sea inválido, esté inactivo, haya perdido el rol o Cassandra no responda. Retirarlo requiere seleccionar explícitamente «Sin proveedor». La subida y el reemplazo de imágenes mantienen su compensación y reintento existentes; un guardado parcial usa el ID del producto ya creado.

La comprobación es de aplicación y no introduce una transacción distribuida entre Cassandra y MongoDB. Las referencias históricas pueden dejar de estar activas después de una asignación; no se eliminan por ello.

## Verificación

Fecha: 5 de noviembre de 2026. El frontend se prueba en Vite local, puerto 5174, sin reemplazar los contenedores existentes. Las escrituras del nuevo backend se verifican con puertos en memoria, MockMvc y mocks de los adaptadores. La prueba real consulta el backend existente únicamente mediante GET.

| Caso solicitado | Cobertura |
| --- | --- |
| 1. Carga de proveedores reales | Prueba optativa de navegador contra el backend local y GET del script de verificación. |
| 2–3. Excluir inactivos y otros roles | Filtro del selector, consulta por documento y validación del servicio. |
| 4–5. Seleccionar y guardar UUID | Radios, cuerpo de POST/PUT y repositorio de prueba. |
| 6. Producto sin proveedor | `null` en frontend/backend y ausencia de llamadas a personas. |
| 7–9. Editar, cambiar y retirar | Resolución por ID, sustitución del UUID y eliminación explícita. |
| 10–11. Inexistente y desactivado | HTTP 400 para nuevas asignaciones, visualización y conservación histórica. |
| 12. Conexión Cassandra | HTTP 503 sin guardar, reintento y conservación de la selección. |
| 13. Asociaciones antiguas | Referencias inválidas, espacios originales, fuera del límite, sin rol e inactivas; sin consulta al mantenerlas. |
| 14. Accesibilidad | Teclado, flechas, foco, etiquetas, tacto, escritorio/tableta/móvil, temas, movimiento reducido y orientación horizontal. |
| 15. Productos e imágenes | Multipart, MIME/bytes, formatos, tamaño, reemplazo, compensación, reintento sin duplicado, mapeo Mongo y precisión monetaria. |

Las pruebas controladas usan fixtures exclusivamente en memoria; el componente de producción no contiene proveedores simulados. No se ejecutan las suites optativas que crean registros reales.

### Comandos

Desde `backend`:

```powershell
mvn.cmd -q test
mvn.cmd -q '-Dtest=ProductoProveedorTests,ProductoServiceTests,ProductoControllerTests,MongoProductoAdapterTests,GridFsImagenAdapterTests' test
```

Desde `frontend`, con Vite local en 5174 (`npm.cmd run dev -- --port 5174`):

```powershell
npm.cmd run build
$env:UI_BASE_URL='http://127.0.0.1:5174'
$env:PROVIDER_READ_ONLY_TESTS='1'
npx.cmd playwright test tests/providers.spec.ts tests/providers-live.spec.ts
```

Desde la raíz, antes y después de las verificaciones de lectura real:

```powershell
node scripts/Test-ProveedoresReadOnly.mjs capture
node scripts/Test-ProveedoresReadOnly.mjs verify
```

El script solo consulta las colecciones `productos`, `fs.files`, `fs.chunks` y las tablas `personas_por_id`, `id_por_documento`, `personas_por_rol`. Guarda conteos y hashes, sin documentos ni credenciales, en `docs/FASE7D-VERIFICACION-DATOS.json`.

### Resultados

- Compilación TypeScript y Vite: correcta.
- Backend: 141 pruebas aprobadas y 5 pruebas optativas de MySQL omitidas, sin errores ni fallos; total consolidado de la suite completa y las pruebas adicionales de adaptadores.
- Navegador: 57 comprobaciones del selector aprobadas, correspondientes a 18 escenarios controlados y una carga real de solo lectura en cada resolución: escritorio 1440 × 1000, tableta 768 × 1024 y móvil 375 × 812. El escenario de 100 registros también comprueba temas claro/oscuro, movimiento reducido y orientación horizontal 844 × 390. Resultado consolidado de la suite y la repetición del caso visual tras ajustar sus localizadores de prueba.
- Regresión del editor compartido de Personas: 2 pruebas adicionales aprobadas sobre cambio/limpieza de departamento y rechazo de ubicaciones sin confirmar. Total: 59 comprobaciones de navegador.
- Lectura real: el endpoint devolvió un proveedor activo registrado; se comprobó su presentación en el selector con cualquier escritura bloqueada.
- `git diff --check`: correcto.
- Integridad: todas las huellas SHA-256 antes/después coinciden (`unchanged: true` en el informe). Se mantuvieron 4 productos, 3 archivos y 21 fragmentos GridFS, además de 4 personas, 4 entradas por documento y 4 entradas por rol en Cassandra. La comparación incluye el contenido completo de los documentos y fragmentos, no solo los conteos.

Al preparar el commit se exportó además una copia exacta de los archivos seleccionados en el índice, sin los cambios pendientes de otras fases. Esa copia compiló correctamente y pasó 105 pruebas backend (5 optativas MySQL omitidas) y los 18 escenarios controlados del selector en escritorio. Los totales anteriores de 141 y 59 corresponden al espacio de trabajo con las fases previas presentes.

## Compatibilidad y límites

No se cambia la estructura MongoDB, los DTO ni las rutas existentes. Las comprobaciones de referencias nuevas se ejecutan antes de persistir; los productos históricos no requieren limpieza ni migración. Durante la implementación inicial se respetó la restricción de no hacer commits ni push. La preparación posterior del commit fue solicitada por el usuario. Los cambios de fases anteriores presentes en el espacio de trabajo se conservaron fuera del commit de la fase 7D.
