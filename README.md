# Facturación Hexagonal

Sistema académico con Java 21, Spring Boot 4.1.2, Maven y arquitectura hexagonal. Productos e imágenes GridFS en MongoDB 8.0, personas y roles en Cassandra 4.1.12, ventas y pagos en MySQL 8.4. La fase 5 permite facturas de contado o crédito, pagos mixtos y abonos concurrentes. Se conserva `/api/health`. La fase 6A añade el frontend Nexo con React, TypeScript, Vite y Tailwind CSS. Inventario, Druid, DIAN y autenticación siguen fuera del alcance.

## Frontend Nexo — Fases 6A y 6B

Interfaz de cristal claro reconstruida en la Fase 6A.1 siguiendo la composición de Sorvo: barra compacta de iconos, header flotante, hero fotográfico, actividad y tarjetas pastel con acento naranja. Usa Urbanist y tres fondos fotográficos optimizados, con tema claro por defecto, modo oscuro y controles de desenfoque/opacidad. Dashboard con indicadores reales, productos en tarjetas o tabla con imágenes GridFS, personas por rol y búsqueda por documento, creación/edición en paneles laterales, desactivación lógica y confirmaciones superpuestas. Las preferencias se guardan en el navegador. La fase 6B incorpora punto de venta, facturas, créditos, abonos y comprobantes imprimibles.

| Ruta | Función |
| --- | --- |
| `/ventas/nueva` | Catálogo activo, carrito, cliente por documento, vendedor opcional, contado mixto y crédito con inicial opcional |
| `/facturas` | Historial con búsqueda y filtros locales por estado, modalidad y fechas |
| `/facturas/:id` | Detalle histórico, pagos, saldo y comprobante para imprimir |
| `/creditos` | Cartera de crédito, vencimientos, estados y registro de abonos |

Se conservan los enlaces hash de la fase anterior. La vista previa usa centavos enteros con BigInt; Spring Boot calcula los importes definitivos. Las escrituras se bloquean mientras se procesan y no se reintentan automáticamente. Ante una respuesta incierta, se ofrece comprobar el historial. Antes de confirmar un abono se consulta nuevamente el saldo. El comprobante usa únicamente los datos guardados en la factura y muestra el identificador del vendedor cuando existe, porque la API no expone su nombre histórico.

Auditoría de contratos: [FASE6B-AUDITORIA.md](docs/FASE6B-AUDITORIA.md). Ejecución, capturas y límites: [FASE6B-VERIFICACION.md](docs/FASE6B-VERIFICACION.md).

Comparación visual, capturas y verificación: [FASE6A-REDISENO-SORVO.md](docs/FASE6A-REDISENO-SORVO.md).

Con las bases y el backend ya en ejecución:

```powershell
docker compose build facturacion-frontend
docker compose up -d --no-deps --no-build --wait facturacion-frontend
```

Abre **http://localhost:5173**. El proxy Nginx comunica `/api` con Spring Boot dentro de la red Docker; no necesita CORS ni publica puertos de bases. `FRONTEND_PORT` permite cambiar el puerto local. El servicio no modifica los volúmenes ni reconstruye el backend al iniciarlo con `--no-deps`.

Para desarrollo con Node 24 y el backend accesible en el puerto 8080:

```powershell
cd frontend
npm ci
npm run dev
```

El servidor Vite también usa un proxy `/api`. Si cambias el puerto del backend, configura `API_PROXY_TARGET` en ese proceso antes de iniciar Vite. `npm run build` comprueba TypeScript y genera `frontend/dist`.

La API de Personas entrega hasta 100 registros por rol, incluyendo inactivos; las personas sin roles se consultan por documento. La interfaz indica ese límite y el dashboard identifica sus conteos de clientes como registros consultados. Un fallo de conexión muestra un error y permite reintentar; no se rellena con datos ficticios.

Arquitectura, alcance y pruebas: [FASE6A-FRONTEND.md](docs/FASE6A-FRONTEND.md).

Pruebas del frontend con Chrome instalado y Docker disponible:

```powershell
cd frontend
npm run build
$env:UI_MUTATION_TESTS = '1'
npm run test:e2e
npm run test:integration
```

`test:e2e` cubre escritorio, tablet y móvil; los escenarios de ventas simulan los contratos HTTP. `UI_MUTATION_TESTS=1` habilita también las pruebas existentes de altas/ediciones de productos y personas con limpieza propia. `test:integration` usa las tres bases reales a través del proxy HTTP: crea un cliente y producto ficticios, factura un crédito desde la interfaz, registra dos abonos, verifica PAGADA, reinicia el backend y comprueba persistencia. Finalmente elimina solo los registros ficticios de esa ejecución y compara conteos/hashes con la línea base. Conserva los volúmenes y datos del negocio.

## Compilar y probar

Requiere JDK 21 o superior. El Wrapper fija Maven 3.10.0 y compila con `--release 21`.

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress clean verify
```

En Linux/macOS: `cd backend && sh ./mvnw --batch-mode --no-transfer-progress clean verify`.

La suite incluye las 53 pruebas anteriores y pruebas nuevas de reglas de facturación, contratos HTTP, persistencia JPA, rollback y concurrencia. Las pruebas ordinarias usan dobles de MongoDB/Cassandra y H2 para JPA. Cinco pruebas adicionales se habilitan expresamente contra MySQL con `Test-MySqlDocker.ps1`. Los scripts de extremo a extremo usan las tres bases reales. Informes en `backend/target/surefire-reports/`; JAR en `backend/target/facturacion-hexagonal-0.0.1-SNAPSHOT.jar`.

La fase 5 añade los starters JPA y Flyway, `flyway-mysql` y Connector/J, con versiones administradas por Spring Boot; H2 solo se utiliza en pruebas.

## Ventas y facturación — Fase 5

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/api/facturas` | 201, factura completa y cabecera `Location` |
| GET | `/api/facturas` | 200, historial completo por ID descendente |
| GET | `/api/facturas/{id}` | 200, detalles y pagos históricos |
| GET | `/api/facturas/cliente/{clienteId}` | 200, historial del UUID indicado |
| POST | `/api/facturas/{id}/pagos` | 200, factura con saldo e historial actualizados |

Solo se envían identificadores, cantidades, modalidad, vencimiento y datos de pago. El backend calcula precios, totales, saldo y estado. Los importes son `BigDecimal` en COP, con dos decimales y sin redondeo; impuestos cero. La cantidad debe ser un entero positivo; se consolidan productos repetidos. Máximo 1000 líneas y 100 pagos iniciales por solicitud.

El cliente debe existir en Cassandra, estar activo y tener rol `CLIENTE`. El vendedor es opcional; si se indica, necesita rol `TRABAJADOR` o `ADMINISTRADOR` y estado activo. Los productos deben existir y estar activos en MongoDB. La factura guarda una copia de documento/nombre del cliente y SKU/nombre/precio del producto; consultar el historial no depende de que el catálogo siga igual.

Ejemplo de crédito usando IDs reales obtenidos mediante las APIs existentes:

```powershell
$base = 'http://localhost:8080'
# $persona y $producto son respuestas reales de POST /api/personas y /api/productos.
$datosFactura = @{
    clienteId = $persona.id; modalidad = 'CREDITO'; fechaVencimiento = '2099-12-15'
    detalles = @(@{productoId = $producto.id; cantidad = 2})
    pagosIniciales = @() # También admite abonos iniciales positivos hasta el total.
}
$factura = Invoke-RestMethod "$base/api/facturas" -Method Post -ContentType 'application/json' -Body ($datosFactura | ConvertTo-Json -Depth 8)
Invoke-RestMethod "$base/api/facturas/$($factura.id)"
Invoke-RestMethod "$base/api/facturas/$($factura.id)/pagos" -Method Post -ContentType 'application/json' -Body (@{
    metodoPago = 'NEQUI'; monto = $factura.saldoPendiente; referencia = 'ABONO-001'
} | ConvertTo-Json)
```

Para contado, utiliza `modalidad='CONTADO'` y uno o varios pagos iniciales cuya suma sea exactamente el total calculado con los precios del catálogo. Los métodos admitidos son `EFECTIVO`, `TRANSFERENCIA` y `NEQUI`. Crédito requiere vencimiento igual o posterior al día de emisión en Colombia; admite pagos iniciales y posteriores hasta completar el saldo. Los estados se calculan como `PENDIENTE`, `PARCIAL` o `PAGADA`. El vencimiento no impide recibir abonos atrasados.

Errores `ProblemDetail`: 400 para datos inválidos, decimales excesivos, cantidades fraccionarias o contado incompleto; 404 para personas, productos o facturas inexistentes; 409 para personas sin rol/estado requerido, productos inactivos, sobrepagos o facturas que ya no admiten abonos. No hay endpoints para editar importes ni estado.

### Persistencia y transacciones

MySQL usa `facturas`, `factura_detalles` y `pagos`, con InnoDB, claves foráneas, índices y restricciones. Los importes usan `DECIMAL(50,2)`, suficiente para los precios de hasta 32 enteros del catálogo y sus cantidades. Los identificadores externos no tienen claves foráneas entre motores. `numeroFactura=FAC-{id}` se asigna a partir del `AUTO_INCREMENT`; no se consulta un máximo y los números pueden tener saltos tras rollback.

Flyway ejecuta [V1__facturacion.sql](backend/src/main/resources/db/migration/V1__facturacion.sql) al arrancar, incluso con el volumen MySQL ya existente. Guarda el historial de migraciones y Hibernate valida el esquema; no usa `ddl-auto=update` ni inicializadores exclusivos de un volumen nuevo. En esquemas no vacíos sin historial se registra baseline 0 y se aplica V1. Si hay tablas previas con los mismos nombres y otro esquema, el arranque falla para permitir su revisión sin sobrescribirlas. La limpieza Flyway está deshabilitada. Referencia: [inicialización de bases de datos de Spring Boot](https://docs.spring.io/spring-boot/how-to/data-initialization.html).

El datasource reutiliza `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD`. Compose espera la salud de MySQL y usa `facturacion-mysql:3306`, sin publicar 3306 en Windows. No requiere cambios de credenciales ni volúmenes.

`FacturaService` consulta los puertos de Cassandra y MongoDB antes de llamar al adaptador MySQL. `MySqlFacturaAdapter` abre la transacción para guardar cabecera, detalles y pagos iniciales juntos. Cada abono bloquea la cabecera con `SELECT ... FOR UPDATE`, valida el saldo vigente y actualiza pago, saldo y estado en una transacción. Dominio y aplicación no importan Spring, JPA ni clientes de bases. No hay transacciones distribuidas.

### Verificación de la fase 5

Con el backend actualizado y las bases saludables, ejecutar **en secuencia** desde la raíz:

```powershell
pwsh -File ./scripts/Test-MySqlDocker.ps1
pwsh -File ./scripts/Test-FacturasDocker.ps1
pwsh -File ./scripts/Test-ProductosDocker.ps1
pwsh -File ./scripts/Test-PersonasDocker.ps1
```

El primer script ejecuta cinco pruebas JPA con Maven y Java 21 dentro de la red Docker, tomando `.env` sin mostrar credenciales. Usa la caché Maven local y no publica MySQL. Comprueba rollback con inserciones reales, integridad SQL, abonos y numeración concurrentes. El segundo crea datos ficticios en las tres bases, prueba contado/crédito, precios históricos y abonos simultáneos, reinicia solo el backend y compara factura y pagos antes/después. `finally` elimina exclusivamente los datos de esa ejecución. Los scripts de productos y personas verifican las fases anteriores.

Evidencia persistente y resultados reales: [FASE5-VERIFICACION.md](docs/FASE5-VERIFICACION.md). Artefactos de ejecución en `backend/target/fase5-*`. `-OmitirReinicio` en el script de facturas omite la comprobación de persistencia.

Límites: historial completo sin paginación, sin anulación/devolución ni idempotencia por referencia de pago. Una referencia es informativa y puede repetirse. Después de un timeout, consultar el historial antes de reintentar un pago. El estado de productos/personas se valida antes de emitir; puede cambiar mientras se guarda la venta. No hay inventario ni transacciones entre motores. Un producto gratuito no admite una factura exclusivamente de contado: se exigen pagos positivos que cubran exactamente el total.

## Ejecutar con Docker

Requiere Docker Desktop en modo Linux/WSL2 y Docker Compose v2 o superior. En un equipo con 16 GB de RAM se recomienda asignar al menos 6 GB a Docker/WSL2. No necesitas Java instalado en Windows para construir con Docker.

Desde la raíz, crea `.env` **solo si todavía no existe**:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Antes del primer arranque, cambia las contraseñas de ejemplo. Conserva el `.env` de las fases anteriores: las credenciales iniciales ya están almacenadas en los volúmenes. Cambiar `.env` no cambia las contraseñas de una base ya inicializada. No elimines volúmenes para resolver una discrepancia. `.env` está ignorado y sus secretos no se incluyen en la documentación.

```powershell
docker compose config --quiet
docker compose build facturacion-backend facturacion-frontend
docker compose up -d --no-build --wait --wait-timeout 600
docker compose ps
Invoke-RestMethod http://localhost:8080/api/health
```

Para actualizar exclusivamente el backend cuando las bases ya están iniciadas:

```powershell
docker compose build facturacion-backend
docker compose up -d --no-deps --no-build --wait --wait-timeout 120 facturacion-backend
```

La construcción ejecuta `clean verify` con JDK 21 y conserva la caché Maven de BuildKit. La imagen final usa JRE 21 y el usuario `app`. El backend arranca después de las comprobaciones de salud de las bases. Al arrancar asegura el índice único `sku_unico`; una conexión o autenticación MongoDB incorrecta impide completar el arranque. Si ya hay documentos con SKU duplicados, el índice falla: hay que revisar esos datos, sin borrarlos automáticamente.

| Servicio | Dirección interna | Memoria máxima | Puerto en Windows |
| --- | --- | --- | --- |
| `facturacion-frontend` | `facturacion-frontend:8080` | 128 MiB | `127.0.0.1:${FRONTEND_PORT}`, 5173 por defecto |
| `facturacion-backend` | `facturacion-backend:8080` | 512 MiB | `127.0.0.1:${BACKEND_PORT}`, 8080 por defecto |
| `facturacion-mongodb` | `facturacion-mongodb:27017` | 768 MiB | Ninguno |
| `facturacion-cassandra` | `facturacion-cassandra:9042` | 2 GiB | Ninguno |
| `facturacion-mysql` | `facturacion-mysql:3306` | 768 MiB | Ninguno |
| `facturacion-cassandra-init` | Inicializador CQL de una ejecución | 256 MiB | Ninguno |

Todos usan la red `facturacion-interna`. Se reutilizan los volúmenes `mongodb-data`, `cassandra-data` y `mysql-data`, con el prefijo del proyecto `facturacion-hexagonal`.

### Configuración MongoDB

`application.properties` utiliza las propiedades `spring.mongodb.*` de Spring Boot 4, con variables separadas para admitir contraseñas con caracteres especiales sin concatenar una URI. Referencia: [documentación oficial de Spring Boot](https://docs.spring.io/spring-boot/reference/data/nosql.html).

| Variable | Valor en Compose |
| --- | --- |
| `MONGODB_HOST` | `facturacion-mongodb` |
| `MONGODB_PORT` | `27017` |
| `MONGODB_DATABASE` | `facturacion_productos` |
| `MONGODB_USERNAME` | `facturacion_admin`, según `.env` existente |
| `MONGODB_PASSWORD` | Contraseña existente en `.env` |
| `MONGODB_AUTH_DATABASE` | `admin` |

No se publica MongoDB en Windows. Ejecutar el JAR fuera de Docker requiere una instancia MongoDB accesible y configurar estas variables en ese proceso; el DNS de Compose solo funciona dentro de su red. Para el entorno del proyecto se utiliza Docker.

## Personas y roles — Fase 4

El dominio `Persona` usa UUID, documento inmutable, datos de contacto, estado, fechas UTC y un conjunto inmutable de roles: `CLIENTE`, `PROVEEDOR`, `TRABAJADOR` y `ADMINISTRADOR`. Tipo/número de documento y nombres son obligatorios. El correo es opcional y se valida cuando se proporciona. Los espacios exteriores de documento y nombres se recortan; el documento distingue mayúsculas/minúsculas. Cada combinación de tipo/número queda reservada incluso después de desactivar la persona.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/api/personas` | 201, persona y cabecera `Location` |
| GET | `/api/personas/{id}` | 200, persona |
| GET | `/api/personas/documento/{tipo}/{numero}` | 200, búsqueda por documento |
| GET | `/api/personas/rol/{rol}` | 200, hasta 100 personas, incluidas inactivas |
| PUT | `/api/personas/{id}` | 200, datos actualizados; documento inmutable |
| PUT | `/api/personas/{id}/roles` | 200, reemplaza el conjunto completo de roles |
| DELETE | `/api/personas/{id}` | 204, desactivación lógica idempotente |

Errores `ProblemDetail` centralizados: 400 para campos, documento modificado, UUID o rol inválidos; 404 para personas inexistentes; 409 para documentos duplicados; 503 cuando Cassandra no confirma la operación o existe una reserva pendiente de recuperación.

```powershell
$base = 'http://localhost:8080'
$datos = @{
    tipoDocumento = 'CC'; numeroDocumento = '900000001'; nombres = 'Ana Ficticia'
    apellidos = 'Ejemplo'; correo = 'ana@example.test'; telefono = '3000000000'
    ciudad = 'Mocoa'; roles = @('CLIENTE', 'PROVEEDOR')
}
$persona = Invoke-RestMethod "$base/api/personas" -Method Post -ContentType 'application/json; charset=utf-8' -Body ($datos | ConvertTo-Json)
$id = $persona.id
Invoke-RestMethod "$base/api/personas/$id"
Invoke-RestMethod "$base/api/personas/documento/CC/900000001"
Invoke-RestMethod "$base/api/personas/rol/PROVEEDOR"
$datos.nombres = 'Ana Actualizada'
Invoke-RestMethod "$base/api/personas/$id" -Method Put -ContentType 'application/json; charset=utf-8' -Body ($datos | ConvertTo-Json)
Invoke-RestMethod "$base/api/personas/$id/roles" -Method Put -ContentType 'application/json' -Body '{"roles":["PROVEEDOR","TRABAJADOR"]}'
Invoke-WebRequest "$base/api/personas/$id" -Method Delete
```

POST admite roles omitidos como conjunto vacío. PUT de información conserva los roles y el estado; para retirarlos todos utiliza `PUT /roles` con `{"roles":[]}`. Identidad, estado y fechas se asignan en el servidor. `id` se representa como UUID textual en JSON y es compatible con el actual `proveedorId` String de productos. El módulo de productos conserva su contrato y todavía no valida personas ni roles.

### Cassandra y arranque

Conexión: `CASSANDRA_HOST=facturacion-cassandra`, `CASSANDRA_PORT=9042`, `CASSANDRA_DATACENTER=datacenter1`; keyspace fijo `facturacion_personas`. Se configuran mediante `spring.cassandra.*`, usando el `CqlSession` del starter ([referencia oficial de Spring Boot](https://docs.spring.io/spring-boot/reference/data/nosql.html#data.nosql.cassandra)). No se publica 9042 en Windows.

`facturacion-cassandra-init` espera la salud de Cassandra y ejecuta [001-personas.cql](infrastructure/cassandra/001-personas.cql), con hasta 20 intentos. Todos los DDL son `IF NOT EXISTS`; el backend depende de la salida 0 del inicializador y no modifica el esquema con Spring. La inicialización conserva las bases y volúmenes de las fases anteriores.

Para la primera actualización desde fase 3, usa el arranque completo indicado arriba; así se ejecuta el nuevo inicializador antes del backend. Una vez creado el esquema, puedes actualizar solo el backend con `--no-deps`.

| Tabla | Clave | Propósito |
| --- | --- | --- |
| `personas_por_id` | Partición `id uuid` | Datos completos, `roles set<text>`, estado y fechas |
| `id_por_documento` | Partición compuesta `(tipo_documento, numero_documento)` | Reserva única `IF NOT EXISTS` y búsqueda del UUID |
| `personas_por_rol` | Partición `rol`, agrupación `persona_id uuid` | Referencias por categoría; recupera los datos canónicos por UUID |

Las consultas principales usan claves, sin `ALLOW FILTERING`. Un lote `LOGGED` de cinco sentencias escribe la persona y reconcilia las cuatro categorías. La reserva LWT del documento es independiente; ante un resultado incierto se conserva y se responde 503. El procedimiento de recuperación y los límites de consistencia están en [FASE4-VERIFICACION.md](docs/FASE4-VERIFICACION.md).

### Pruebas reales de personas

Con los servicios iniciados, desde la raíz:

```powershell
pwsh -File ./scripts/Test-PersonasDocker.ps1 -BaseUrl http://127.0.0.1:8080
pwsh -File ./scripts/Test-ProductosDocker.ps1 -BaseUrl http://127.0.0.1:8080
```

La prueba de personas comprueba API, tablas, documento único ante solicitudes concurrentes y persistencia tras reiniciar solo el backend. En `finally` elimina exclusivamente los UUID asociados a los documentos ficticios aleatorios de esa ejecución y verifica la limpieza de las tres tablas. La prueba de productos conserva su comprobación completa de MongoDB/GridFS y su propio reinicio. No ejecutes ambas pruebas a la vez: cada una reinicia el backend.

Artefactos: `backend/target/fase4-api-checks.txt`, `fase4-cassandra-antes.json`, `fase4-cassandra-despues.json` y los informes Surefire. La opción `-OmitirReinicio` permite omitir esa parte, pero no demuestra persistencia tras reiniciar.

## Modelo y reglas de productos

`Producto` contiene `id`, `sku`, `nombre`, `descripcion`, `categoria`, `costo`, `precioVenta`, `proveedorId`, `activo`, `imagenId`, `fechaCreacion` y `fechaActualizacion`. El dominio no tiene anotaciones de Spring o persistencia.

- SKU y nombre son obligatorios; se recortan sus espacios exteriores. SKU distingue mayúsculas/minúsculas y es único incluso si el producto está inactivo.
- Costo y precio de venta son `BigDecimal`, no negativos y obligatorios. Se admiten hasta 32 enteros y 2 decimales en COP, sin redondeo automático. Se guardan como BSON `Decimal128`, nunca `double`.
- La creación asigna UUID, estado activo y fechas UTC (`Instant`). `PUT` conserva identidad, estado, imagen y fecha de creación. Las fechas se actualizan en el servidor y MongoDB las conserva con precisión de milisegundos.
- `DELETE` cambia `activo` a `false`. Las consultas y el listado incluyen productos inactivos; repetir DELETE es válido. Esta fase no incluye reactivación ni eliminación física por API.
- Proveedor e imagen son opcionales. El catálogo conserva `proveedorId` sin validar personas; facturación valida cliente y vendedor mediante Cassandra.
- No hay inventario ni cantidades disponibles.

## Puertos, adaptadores y casos de uso

Código bajo `backend/src/main/java/com/sttiv/facturacion/`:

| Capa | Archivos y responsabilidad |
| --- | --- |
| `domain/model` | `Producto`: reglas y cambios de estado. `ImagenProducto`: bytes y MIME |
| `domain/exception` | `DatosInvalidosException`, `RecursoNoEncontradoException`, `SkuDuplicadoException` |
| `domain/port` | `ProductoRepositoryPort`: guardar, consultar y listar. `ImagenStoragePort`: guardar, recuperar y eliminar archivos |
| `application/command` | `ProductoCommand`: datos editables del producto |
| `application/port` | `ProductoUseCase`: contrato de entrada de los siete casos de uso |
| `application/usecase` | `ProductoService`: creación, listado, consulta, actualización, desactivación, asociación y consulta de imagen |
| `infrastructure/adapter/input/rest` | `ProductoController`, `HealthController` y `ApiExceptionHandler` |
| `infrastructure/adapter/input/rest/dto` | `ProductoRequest`: validación HTTP. `ProductoResponse`: salida con moneda COP |
| `infrastructure/adapter/output/mongo` | `ProductoDocument`, `SpringDataProductoRepository`, `MongoProductoAdapter` y `GridFsImagenAdapter` |
| `infrastructure/config` | `ProductoConfiguration`: conecta los puertos con los casos de uso y crea el índice único |

El flujo es REST → `ProductoUseCase` → `ProductoService` → puertos de salida → adaptadores MongoDB/GridFS. Dominio y aplicación solo usan Java y contratos internos; no importan `MongoRepository`, `MongoTemplate`, `MultipartFile` ni Spring. El índice único protege además de la comprobación previa de SKU del caso de uso.

## API REST

Base: `http://localhost:8080`. Ajusta la URL si cambias `BACKEND_PORT`.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/health` | 200: `{"status":"OK","sistema":"Facturacion Hexagonal"}` |
| POST | `/api/productos` | 201, producto y cabecera `Location` |
| GET | `/api/productos` | 200, arreglo de productos, incluidos inactivos |
| GET | `/api/productos/{id}` | 200, producto |
| PUT | `/api/productos/{id}` | 200, producto actualizado |
| DELETE | `/api/productos/{id}` | 204 sin cuerpo; desactivación lógica |
| POST | `/api/productos/{id}/imagen` | 200, producto con nueva referencia; multipart, campo `imagen` |
| GET | `/api/productos/{id}/imagen` | 200, bytes y MIME de la imagen |

### Crear y actualizar

Ejemplo en PowerShell:

```powershell
$base = 'http://localhost:8080'
$datos = @{
    sku = 'CAF-001'
    nombre = 'Café molido'
    descripcion = 'Paquete de café'
    categoria = 'Alimentos'
    costo = [decimal]12345.67
    precioVenta = [decimal]19000.99
    proveedorId = $null
}
$producto = Invoke-RestMethod "$base/api/productos" -Method Post -ContentType 'application/json; charset=utf-8' -Body ($datos | ConvertTo-Json)
$id = $producto.id
Invoke-RestMethod "$base/api/productos/$id"
Invoke-RestMethod "$base/api/productos"
$datos.nombre = 'Café molido especial'
Invoke-RestMethod "$base/api/productos/$id" -Method Put -ContentType 'application/json; charset=utf-8' -Body ($datos | ConvertTo-Json)
```

Respuesta de creación ilustrativa:

```json
{
  "id": "7653a741-8b47-43cf-9bc3-1fa6660462a2",
  "sku": "CAF-001",
  "nombre": "Café molido",
  "descripcion": "Paquete de café",
  "categoria": "Alimentos",
  "costo": 12345.67,
  "precioVenta": 19000.99,
  "moneda": "COP",
  "proveedorId": null,
  "activo": true,
  "imagenId": null,
  "fechaCreacion": "2026-11-04T03:00:00Z",
  "fechaActualizacion": "2026-11-04T03:00:00Z"
}
```

`PUT` envía todos los campos editables del mismo contrato que POST; no permite modificar `activo`, IDs ni fechas. Los opcionales omitidos quedan en `null`.

### Cargar, reemplazar y recuperar una imagen

Se admite JPEG (`image/jpeg`), PNG (`image/png`) y WebP (`image/webp`), de 1 byte a 3 MiB (3.145.728 bytes). Se comprueba el MIME y la firma binaria; cambiar solamente la extensión de un archivo no lo hace válido. El límite total de la petición multipart es 4 MiB para permitir sus cabeceras.

En Windows, usando el `$id` creado arriba:

```powershell
curl.exe -i -X POST "$base/api/productos/$id/imagen" -F 'imagen=@C:/imagenes/cafe.png;type=image/png'
curl.exe -f "$base/api/productos/$id/imagen" -o cafe-descargado.png
# La misma operación POST reemplaza la imagen principal:
curl.exe -i -X POST "$base/api/productos/$id/imagen" -F 'imagen=@C:/imagenes/cafe.webp;type=image/webp'
Invoke-WebRequest "$base/api/productos/$id" -Method Delete
```

En Linux/macOS usa `curl` y una ruta local existente. El documento `productos` solo guarda `imagenId`; los archivos están en `fs.files` y `fs.chunks`, sin Base64 dentro del producto. Tras guardar la referencia nueva se elimina la imagen anterior. Si falla guardar la referencia, se intenta eliminar el archivo nuevo conservando el anterior. Desactivar un producto conserva su imagen.

### Errores

Se centralizan con `ProblemDetail` y `application/problem+json`:

- 400: campos obligatorios ausentes, importes inválidos, JSON incorrecto, imagen vacía, formato/MIME incorrecto, tamaño excesivo o parte `imagen` ausente.
- 404: producto inexistente, producto sin imagen o archivo inexistente.
- 409: SKU ya utilizado, incluido conflicto detectado por el índice de MongoDB.

Ejemplo de conflicto:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Ya existe un producto con SKU: CAF-001",
  "instance": "/api/productos"
}
```

Los errores de Bean Validation incluyen además el objeto `errores`, con un mensaje por campo.

## Integración real y evidencia de persistencia

Con los cuatro servicios iniciados, ejecutar desde la raíz con PowerShell 7:

```powershell
pwsh -File ./scripts/Test-ProductosDocker.ps1
# Si BACKEND_PORT es distinto:
pwsh -File ./scripts/Test-ProductosDocker.ps1 -BaseUrl http://localhost:8081
```

El script usa SKU aleatorios `FASE3-TEST-<UUID>-A/B`, prueba la API real, consulta MongoDB autenticándose desde el entorno del contenedor, revisa `Decimal128`, índice único, archivo y chunks, verifica la limpieza de la imagen reemplazada y reinicia únicamente el backend. Después recupera el producto inactivo y los mismos bytes de la imagen para demostrar persistencia.

En `finally` elimina exclusivamente los registros creados por esa ejecución, filtrando por sus UUID **y** SKU, y sus imágenes. No elimina bases, colecciones ni volúmenes. No deja productos de demostración. Usa `-OmitirReinicio` si quieres omitir la comprobación tras reiniciar; la ejecución verificada sí incluye ese reinicio.

Artefactos generados, ignorados por Git y renovados en cada ejecución:

- `backend/target/fase3-api-checks.txt`: comprobaciones HTTP, persistencia y limpieza.
- `backend/target/fase3-mongodb.json`: documento real, tipos BSON, índice y metadatos GridFS antes de la limpieza.
- `backend/target/surefire-reports/`: resultados de las pruebas Java.

El informe de la ejecución de esta fase está en [docs/FASE3-VERIFICACION.md](docs/FASE3-VERIFICACION.md).

## Operación y límites de esta fase

```powershell
docker compose logs --tail 100 facturacion-backend
docker compose logs --tail 100 facturacion-mongodb
docker compose stop
# Iniciar de nuevo sin eliminar datos:
docker compose up -d --no-build --wait --wait-timeout 600
```

No ejecutes `docker compose down -v` ni elimines los volúmenes. `docker compose down` sin `-v` conserva los datos, aunque no es necesario para actualizar el backend. Tampoco se requieren nuevos puertos de bases de datos en Windows.

`/api/health` conserva su contrato y comprueba disponibilidad HTTP; no comprueba continuamente la conexión MongoDB. La creación del índice comprueba la conexión durante el arranque y las operaciones del catálogo la ejercitan durante el uso.

El listado es completo, sin paginación. No hay control de versiones para ediciones concurrentes. MongoDB se ejecuta como nodo independiente y las operaciones entre documentos de producto y GridFS no forman una transacción: una interrupción entre escrituras o un fallo de limpieza puede dejar un archivo huérfano. Se valida la firma del archivo, sin decodificación completa de píxeles ni análisis de malware. Son límites deliberados del alcance académico.

## Publicar en GitHub

Repositorio: [SttivGG/Facturacion-hexagonal](https://github.com/SttivGG/Facturacion-hexagonal).

Con el commit local preparado en `main` y el remoto `origin` configurado, publica desde la raíz:

```powershell
git push -u origin main
```

`.env`, los directorios `target/` y los archivos de herramientas locales quedan excluidos por `.gitignore`. `.env.example` permite configurar una nueva copia sin publicar las credenciales locales.
