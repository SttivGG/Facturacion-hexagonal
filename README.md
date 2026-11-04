# Facturación Hexagonal

Sistema académico con Java 21, Spring Boot 4.1.2, Maven y arquitectura hexagonal. La fase 3 implementa el catálogo de productos en MongoDB 8.0 e imágenes principales en GridFS. Se conserva `/api/health` y la infraestructura de las fases anteriores. Cassandra 4.1.12 y MySQL 8.4 siguen disponibles para próximas fases; todavía no hay personas, facturas, pagos, inventario, Druid, frontend ni autenticación de usuarios.

## Compilar y probar

Requiere JDK 21 o superior. El Wrapper fija Maven 3.10.0 y compila con `--release 21`.

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress clean verify
```

En Linux/macOS: `cd backend && sh ./mvnw --batch-mode --no-transfer-progress clean verify`.

Las 26 pruebas automatizadas cubren reglas del dominio, casos de uso, contrato HTTP, imágenes y traducción de conflictos del índice. La prueba original de salud conserva sus aserciones y carga el contexto completo con un cliente MongoDB simulado. Las pruebas no necesitan una base de datos. Los informes quedan en `backend/target/surefire-reports/` y el JAR en `backend/target/facturacion-hexagonal-0.0.1-SNAPSHOT.jar`.

Solo se añadió `spring-boot-starter-data-mongodb`; se reutilizan las dependencias de validación y pruebas existentes.

## Ejecutar con Docker

Requiere Docker Desktop en modo Linux/WSL2 y Docker Compose v2 o superior. En un equipo con 16 GB de RAM se recomienda asignar al menos 6 GB a Docker/WSL2. No necesitas Java instalado en Windows para construir con Docker.

Desde la raíz, crea `.env` **solo si todavía no existe**:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Antes del primer arranque, cambia las contraseñas de ejemplo. Conserva el `.env` de las fases anteriores: las credenciales iniciales ya están almacenadas en los volúmenes. Cambiar `.env` no cambia las contraseñas de una base ya inicializada. No elimines volúmenes para resolver una discrepancia. `.env` está ignorado y sus secretos no se incluyen en la documentación.

```powershell
docker compose config --quiet
docker compose build facturacion-backend
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
| `facturacion-backend` | `facturacion-backend:8080` | 512 MiB | `127.0.0.1:${BACKEND_PORT}`, 8080 por defecto |
| `facturacion-mongodb` | `facturacion-mongodb:27017` | 768 MiB | Ninguno |
| `facturacion-cassandra` | `facturacion-cassandra:9042` | 2 GiB | Ninguno |
| `facturacion-mysql` | `facturacion-mysql:3306` | 768 MiB | Ninguno |

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

## Modelo y reglas

`Producto` contiene `id`, `sku`, `nombre`, `descripcion`, `categoria`, `costo`, `precioVenta`, `proveedorId`, `activo`, `imagenId`, `fechaCreacion` y `fechaActualizacion`. El dominio no tiene anotaciones de Spring o persistencia.

- SKU y nombre son obligatorios; se recortan sus espacios exteriores. SKU distingue mayúsculas/minúsculas y es único incluso si el producto está inactivo.
- Costo y precio de venta son `BigDecimal`, no negativos y obligatorios. Se admiten hasta 32 enteros y 2 decimales en COP, sin redondeo automático. Se guardan como BSON `Decimal128`, nunca `double`.
- La creación asigna UUID, estado activo y fechas UTC (`Instant`). `PUT` conserva identidad, estado, imagen y fecha de creación. Las fechas se actualizan en el servidor y MongoDB las conserva con precisión de milisegundos.
- `DELETE` cambia `activo` a `false`. Las consultas y el listado incluyen productos inactivos; repetir DELETE es válido. Esta fase no incluye reactivación ni eliminación física por API.
- Proveedor e imagen son opcionales. No se comprueba el proveedor contra Cassandra porque ese módulo aún no existe.
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
