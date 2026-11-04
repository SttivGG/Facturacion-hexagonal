# Verificación de la fase 3

Ejecución del 3 de noviembre de 2026, hora de Colombia (los documentos MongoDB muestran el 4 de noviembre en UTC).

## Compilación y pruebas Java

- Java local: Oracle JDK 22.0.1, compilación `release 21`.
- Docker: Temurin 21.0.13, Maven 3.10.0, Spring Boot 4.1.2.
- `backend/mvnw.cmd --batch-mode --no-transfer-progress verify`: `BUILD SUCCESS`.
- `docker compose build facturacion-backend`: `BUILD SUCCESS`, incluidas las pruebas.

| Clase de prueba | Ejecutadas | Fallos | Errores | Omitidas |
| --- | ---: | ---: | ---: | ---: |
| `ProductoServiceTests` | 18 | 0 | 0 | 0 |
| `ProductoControllerTests` | 6 | 0 | 0 | 0 |
| `MongoProductoAdapterTests` | 1 | 0 | 0 | 0 |
| `FacturacionHexagonalApplicationTests` | 1 | 0 | 0 | 0 |
| **Total** | **26** | **0** | **0** | **0** |

Se verificaron creación con precisión decimal, datos inválidos, SKU duplicados al crear/actualizar y después de desactivar, consulta y actualización, conservación de fechas y referencia de imagen, desactivación lógica, recursos inexistentes, carga/reemplazo/recuperación de imágenes, JPEG/PNG/WebP, tamaño máximo y reversión del archivo nuevo ante fallo al guardar su referencia. El adaptador traduce `DuplicateKeyException` a la excepción del dominio; MockMvc comprueba los códigos y contratos HTTP. La prueba original de salud conserva todas sus aserciones y usa un cliente MongoDB simulado.

## API real en Docker

Comando completado con código de salida 0:

```powershell
pwsh -File ./scripts/Test-ProductosDocker.ps1 -BaseUrl http://127.0.0.1:8080
```

Resultado: **44 comprobaciones correctas**. Registro completo: [fase3-api-comprobaciones.txt](fase3-api-comprobaciones.txt).

Se probaron los siete endpoints de productos y el endpoint original de salud. Se observaron HTTP 201, 200, 204, 400, 404 y 409 según el caso. La prueba real de imágenes utilizó un PNG de 68 bytes, comparó su recuperación byte por byte, lo reemplazó y comprobó la eliminación del archivo anterior y sus chunks. También rechazó GIF, contenido falso declarado como PNG, archivo vacío y un archivo de 3 MiB + 1 byte.

Se reinició únicamente `facturacion-backend`. Después del reinicio, la API recuperó el mismo producto inactivo y el mismo archivo GridFS. Las bases de datos y sus volúmenes no se reiniciaron ni reconstruyeron.

## Evidencia directa de MongoDB

Consulta autenticada mediante `docker compose exec -T facturacion-mongodb mongosh`, usando las credenciales del entorno del contenedor. Base: `facturacion_productos`.

Documento observado antes de limpiar los datos de prueba:

```json
{
  "_id": "f7455220-d9ad-411f-838d-259e6909eb1b",
  "sku": "FASE3-TEST-29bbee9a5a564c34aaa484d983040930-A",
  "costo": { "$numberDecimal": "12345.67" },
  "precioVenta": { "$numberDecimal": "19000.99" },
  "activo": false,
  "imagenId": "6aeaad070e7d961b26f75dac"
}
```

La agregación `$type` devolvió `decimal` para ambos importes. El índice `sku_unico` tenía clave `{sku: 1}` y `unique: true`. `fs.files` contenía la imagen `6aeaad070e7d961b26f75dac`, longitud 68 y MIME `image/png`; `fs.chunks` contenía un chunk asociado. El archivo reemplazado y sus chunks ya no existían. El producto no contenía los bytes ni Base64 de la imagen.

Documento, tipos, índice y metadatos completos: [fase3-mongodb-evidencia.json](fase3-mongodb-evidencia.json). Esta copia conserva la evidencia aunque `clean` elimine `backend/target`.

## Limpieza y estado final

El bloque `finally` eliminó **2 productos y 1 imagen de prueba**, filtrando por UUID y SKU generados en esa ejecución. Verificó que ya no existieran esos documentos, archivos ni chunks. Los productos se habían desactivado mediante API antes de esa limpieza técnica; no hay endpoint de borrado físico.

Se mantienen los puertos y volúmenes existentes. No se modificó `.env` ni se imprimieron sus contraseñas. Los cuatro servicios quedaron saludables. No se hicieron commits ni push.

## Incidencias y límites

- El primer sondeo posterior al reinicio tenía un plazo HTTP de dos segundos, insuficiente para `localhost` en este entorno. Se sustituyó por un cliente con plazo de cinco segundos y la ejecución final se hizo con IPv4 explícita. El backend permanecía saludable; no fue un fallo de persistencia.
- Se corrigieron durante la preparación del script la construcción del arreglo de SKU de PowerShell y la conversión de la longitud BSON de GridFS. La ejecución final completó todas las comprobaciones y la limpieza.
- Maven mostró el aviso ya existente de metadatos HTTP 403 en `ow2-snapshot`; Mockito/Byte Buddy mostró avisos sobre carga dinámica de agentes. No impidieron compilar, probar ni empaquetar.
- El listado no tiene paginación; no se resuelven ediciones simultáneas mediante versiones. La validación de imágenes comprueba MIME y firma, sin decodificar los píxeles. Producto y GridFS no forman una transacción en este MongoDB independiente; una interrupción entre escrituras puede dejar archivos huérfanos.
- La carpeta recibida no tiene `.git`; no fue posible producir un diff Git. Los archivos, pruebas y evidencias están disponibles localmente.
