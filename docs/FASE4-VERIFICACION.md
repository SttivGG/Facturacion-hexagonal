# Verificación de la fase 4: personas y roles

Implementación del 4 de noviembre de 2026, hora de Colombia. Alcance: personas en Cassandra, múltiples roles, API REST, integración Docker y comprobación de productos MongoDB/GridFS. No se implementan facturación, pagos, frontend ni autenticación.

## Estructura y responsabilidades

Archivos Java bajo `backend/src/main/java/com/sttiv/facturacion/`:

```text
domain/
  model/Persona.java                     Registro inmutable con validación de documento, nombres y correo
  model/RolPersona.java                  CLIENTE, PROVEEDOR, TRABAJADOR, ADMINISTRADOR
  port/PersonaRepositoryPort.java        Contrato de persistencia y consultas
  exception/DocumentoDuplicadoException.java
  exception/PersistenciaPersonaException.java
application/
  command/PersonaCommand.java            Información personal recibida por los casos de uso
  port/PersonaUseCase.java                Contrato de entrada
  usecase/PersonaService.java             Crear, consultar, editar, roles y desactivar
infrastructure/
  adapter/input/rest/PersonaController.java
  adapter/input/rest/dto/PersonaRequest.java
  adapter/input/rest/dto/PersonaResponse.java
  adapter/input/rest/dto/RolesPersonaRequest.java
  adapter/output/cassandra/CassandraPersonaAdapter.java
  adapter/output/cassandra/PersonaCassandraEntity.java
  config/PersonaConfiguration.java
```

`PersonaCassandraEntity` traduce valores y filas del driver; se utiliza CQL explícito y preparado en vez de repositorios generados o anotaciones de mapeo. El único tipo de persistencia que conoce la aplicación es `PersonaRepositoryPort`. El dominio y la aplicación solo importan Java y clases internas.

Se amplía `ApiExceptionHandler` para documentos duplicados (409), UUID/rol inválidos (400) y resultados de persistencia inciertos (503). Se conserva `ProblemDetail` y el comportamiento de productos. Los beans se conectan mediante `PersonaConfiguration`, usando `Clock` UTC.

Otros archivos:

| Archivo | Responsabilidad |
| --- | --- |
| `infrastructure/cassandra/001-personas.cql` | Keyspace y tres tablas idempotentes |
| `docker-compose.yml` | Inicializador, reintentos y dependencia del backend |
| `backend/pom.xml` | Única dependencia nueva: starter Cassandra administrado por Boot |
| `backend/src/main/resources/application.properties` | Conexión, datacenter, keyspace y consistencia |
| `backend/src/test/java/com/sttiv/facturacion/PersonasEnMemoria.java` | Adaptador de prueba sin bases externas |
| `backend/src/test/java/com/sttiv/facturacion/application/PersonaServiceTests.java` | Reglas y casos de uso |
| `backend/src/test/java/com/sttiv/facturacion/infrastructure/PersonaControllerTests.java` | Contrato REST con MockMvc |
| `backend/src/test/java/com/sttiv/facturacion/infrastructure/CassandraPersonaAdapterTests.java` | LWT, lote de roles y fallos parciales simulados |
| `backend/src/test/java/com/sttiv/facturacion/FacturacionHexagonalApplicationTests.java` | Salud original, contexto con Cassandra simulado |
| `scripts/Test-PersonasDocker.ps1` | API, CQL, concurrencia, reinicio y limpieza real |

## Modelo y reglas

`Persona` contiene UUID `id`; `tipoDocumento`, `numeroDocumento`, `nombres`, `apellidos`, `correo`, `telefono`, `telefonoAlternativo`, `direccion`, `ciudad`, `departamento`, `pais`, `observaciones` como String; `fechaNacimiento` como LocalDate; `roles` como Set de RolPersona; `activo` boolean; `fechaCreacion` y `fechaActualizacion` como Instant.

Solo tipo/número de documento y nombres son obligatorios en los datos de entrada. El correo ausente o en blanco se guarda como null; si se proporciona se comprueba su estructura. La validación de correo es sintáctica, sin comprobar entrega ni DNS. Los demás datos pueden ser null. Roles omitidos al crear equivalen a un conjunto vacío; las repeticiones se eliminan. Los conjuntos se copian y no pueden modificarse externamente.

El documento se recorta y distingue mayúsculas/minúsculas. `CC/123` y `CE/123` son documentos diferentes. `PUT /{id}` exige el mismo tipo/número del registro y conserva identidad, roles, estado y fecha de creación. Solo el endpoint de roles los reemplaza; `[]` retira todas las categorías y null es inválido. Los campos desconocidos como `id`, `activo` o fechas no permiten modificar sus valores del servidor.

DELETE desactiva sin borrar datos, documento ni roles. Es idempotente; las consultas devuelven también personas inactivas. No hay reactivación en esta fase. Las fechas se normalizan a milisegundos antes de devolverlas y guardarlas, de acuerdo con el almacenamiento timestamp de Cassandra. La prueba real detectó y permitió corregir una diferencia inicial de nanosegundos.

La respuesta JSON usa el UUID textual estándar. `persona.id().toString()` es compatible con `proveedorId` String del producto existente; se conserva íntegro el contrato y la lógica de productos. La validación cruzada del rol PROVEEDOR queda para la próxima fase.

## Tablas y consultas CQL

Keyspace `facturacion_personas`, `NetworkTopologyStrategy`, `datacenter1` y factor de replicación 1 para el nodo académico. El [script completo](../infrastructure/cassandra/001-personas.cql) usa únicamente `CREATE ... IF NOT EXISTS`.

| Tabla | Clave de partición | Agrupación | Contenido y consulta |
| --- | --- | --- | --- |
| `personas_por_id` | `id uuid` | Ninguna | Todos los atributos; dato canónico por UUID |
| `id_por_documento` | `(tipo_documento text, numero_documento text)` | Ninguna | UUID reservado para una combinación de documento |
| `personas_por_rol` | `rol text` | `persona_id uuid` | Pertenencia a una categoría |

La última tabla guarda solo claves: evita duplicar datos de contacto. Su listado lee hasta 100 referencias por rol y consulta cada persona por ID; comprueba que el rol siga en la fila canónica. Una persona puede aparecer en cuatro particiones. No hay índices secundarios ni tablas auxiliares.

Consultas principales (los `?` se enlazan con sentencias preparadas):

```sql
SELECT * FROM personas_por_id WHERE id = ?;
SELECT persona_id FROM id_por_documento
WHERE tipo_documento = ? AND numero_documento = ?;
SELECT persona_id FROM personas_por_rol WHERE rol = ? LIMIT ?;

INSERT INTO id_por_documento (tipo_documento, numero_documento, persona_id)
VALUES (?, ?, ?) IF NOT EXISTS;

INSERT INTO personas_por_rol (rol, persona_id) VALUES (?, ?);
DELETE FROM personas_por_rol WHERE rol = ? AND persona_id = ?;
```

La inserción de la persona enumera sus 18 columnas, incluyendo `roles set<text>`, fecha de nacimiento `date` y fechas `timestamp`. No se utiliza `ALLOW FILTERING`. La clave de documento es compuesta dentro de una única partición, adecuada para el LWT de esa combinación.

### Consistencia y recuperación de fallos parciales

1. Al crear, el adaptador reserva el documento mediante `INSERT IF NOT EXISTS` y comprueba `wasApplied()`. Si ya tiene persona, devuelve 409. Una reserva cuya persona todavía no existe produce 503; nunca se crea otra identidad para ese documento.
2. Con la reserva confirmada, escribe un lote `LOGGED` de cinco sentencias: persona completa y una inserción o eliminación para cada uno de los cuatro roles. Las ediciones, desactivaciones y cambios de rol repiten ese lote. Reconciliar todos los roles evita depender de una fotografía anterior del índice.
3. Si Cassandra no confirma una operación, devuelve 503 y registra el UUID para diagnóstico. Conserva la reserva incluso si el lote pudo haberse aplicado: un timeout no demuestra ausencia de escritura.
4. Las lecturas por rol recuperan la fila canónica y omiten referencias cuyo rol ya no está presente. Durante una recuperación todavía pueden faltar referencias nuevas; el índice converge cuando termina el lote o se reconcilia.

El batchlog ayuda a completar las escrituras de un lote aceptado. No proporciona aislamiento entre particiones ni incluye la reserva LWT anterior. Una interrupción puede dejar una reserva sin persona; las lecturas entre tablas pueden observar estados intermedios. No se presenta como una transacción distribuida de aplicación. Véase la [documentación oficial de CQL sobre BATCH](https://cassandra.apache.org/doc/latest/cassandra/developing/cql/dml.html#batch_statement).

Procedimiento manual para este proyecto académico:

1. Recuperar la disponibilidad de Cassandra y suspender temporalmente las escrituras de personas durante la intervención. Consultar por documento y por el UUID del índice o del log; permitir que termine la recuperación del batchlog.
2. Si la persona existe, tomar su fila canónica como referencia. Repetir `PUT /{id}/roles` con sus roles actuales reconcilia las cuatro particiones, incluso si el conjunto no cambia. Verificar las cuatro claves `(rol, persona_id)` con CQL.
3. Si existe únicamente la reserva, comprobar que ya no haya solicitudes ni lotes pendientes. Conservar el UUID reservado y completar manualmente la fila con los datos originales y sus roles, o liberar exclusivamente esa reserva confirmada como huérfana con una eliminación condicional. No liberar automáticamente por antigüedad, ni mientras pueda completarse una escritura anterior.
4. Para liberar una reserva huérfana confirmada: `DELETE FROM id_por_documento WHERE tipo_documento = 'TIPO' AND numero_documento = 'NUMERO' IF persona_id = UUID_RESERVADO;`. Comprobar `[applied]`, ausencia de persona y referencias de roles antes de permitir un nuevo POST.
5. Después de cualquier 503, consultar primero el estado antes de repetir una operación: si la creación terminó, recuperar su UUID por documento; si fue una actualización, comprobar los datos y reconciliar los roles. No cambiar UUID ni documento para intentar eludir una reserva.

La prueba automatizada simula fallo tras reservar y comprueba que no se libera el documento. No se simuló pérdida de disco ni caída de un clúster multinodo. La recuperación de reservas huérfanas es operativa y manual; no se agregó una cola ni una tabla de trabajos.

## API y ejemplos HTTP

Base de la ejecución: `http://127.0.0.1:8080`.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| POST | `/api/personas` | 201, cuerpo y `Location: /api/personas/{uuid}` |
| GET | `/api/personas/{id}` | 200 o 404 |
| GET | `/api/personas/documento/{tipo}/{numero}` | 200 o 404; 503 si la reserva sigue pendiente |
| GET | `/api/personas/rol/{rol}` | 200, arreglo con hasta 100 personas |
| PUT | `/api/personas/{id}` | 200; 400 si cambia el documento |
| PUT | `/api/personas/{id}/roles` | 200, conjunto completo reemplazado |
| DELETE | `/api/personas/{id}` | 204, desactivación lógica |

Ejemplo de creación:

```http
POST /api/personas HTTP/1.1
Content-Type: application/json

{
  "tipoDocumento": "CC",
  "numeroDocumento": "900000001",
  "nombres": "Ana Ficticia",
  "apellidos": "Ejemplo",
  "correo": "ana@example.test",
  "telefono": "3000000000",
  "ciudad": "Mocoa",
  "roles": ["CLIENTE", "PROVEEDOR"]
}
```

Consultar: `GET /api/personas/documento/CC/900000001` y `GET /api/personas/rol/PROVEEDOR`. Para actualizar información, enviar el mismo contrato a `PUT /api/personas/{id}` conservando el documento; los opcionales omitidos quedan null. Los roles enviados allí no cambian la clasificación.

```http
PUT /api/personas/{id}/roles HTTP/1.1
Content-Type: application/json

{"roles":["PROVEEDOR","TRABAJADOR"]}
```

`DELETE /api/personas/{id}` devuelve 204 y permite recuperar después la misma persona con `activo: false`. Campos inválidos, JSON incorrecto, UUID mal formado o rol desconocido devuelven 400; persona ausente, 404; documento duplicado, 409; error de conexión o resultado de persistencia incierto, 503. El formato centralizado es `application/problem+json`.

## Docker y configuración

Se conserva `cassandra:4.1.12` con su volumen original y DNS `facturacion-cassandra`. La conexión usa `CASSANDRA_HOST`, `CASSANDRA_PORT`, `CASSANDRA_DATACENTER`; keyspace fijo `facturacion_personas`. Consistencia `LOCAL_QUORUM`, serial `LOCAL_SERIAL`, timeout de petición y conexión de 10 segundos. Con RF=1 no existe tolerancia a la pérdida del nodo.

El nuevo servicio `facturacion-cassandra-init` monta el directorio CQL en lectura y ejecuta el script una vez que Cassandra está saludable, hasta 20 intentos con pausa de 3 segundos. El backend depende de `service_completed_successfully`. `spring.cassandra.schema-action=none` impide la gestión automática de tablas por Spring. Referencia de conexión: [Spring Boot y Cassandra](https://docs.spring.io/spring-boot/reference/data/nosql.html#data.nosql.cassandra).

Para reproducir desde la raíz, con el `.env` existente:

```powershell
docker compose config --quiet
docker compose build facturacion-backend
docker compose up -d --no-build --wait --wait-timeout 600
pwsh -File ./scripts/Test-PersonasDocker.ps1 -BaseUrl http://127.0.0.1:8080
pwsh -File ./scripts/Test-ProductosDocker.ps1 -BaseUrl http://127.0.0.1:8080
docker compose ps -a
```

No ejecutar los scripts simultáneamente porque ambos reinician el backend. No se publican puertos de bases de datos en Windows. Solo se expone el backend en loopback. No se cambiaron ni reinicializaron volúmenes. Las bases conservaron sus contenedores existentes durante la actualización.

## Resultados de verificación

La compilación local (JDK 22, `release 21`) y Docker (Temurin 21.0.13), con Maven 3.10.0 y Spring Boot 4.1.2, terminaron con `BUILD SUCCESS`.

| Clase de prueba | Ejecutadas | Fallos | Errores | Omitidas |
| --- | ---: | ---: | ---: | ---: |
| `PersonaServiceTests` | 15 | 0 | 0 | 0 |
| `PersonaControllerTests` | 7 | 0 | 0 | 0 |
| `CassandraPersonaAdapterTests` | 5 | 0 | 0 | 0 |
| `ProductoServiceTests` | 18 | 0 | 0 | 0 |
| `ProductoControllerTests` | 6 | 0 | 0 | 0 |
| `MongoProductoAdapterTests` | 1 | 0 | 0 | 0 |
| `FacturacionHexagonalApplicationTests` | 1 | 0 | 0 | 0 |
| **Total** | **53** | **0** | **0** | **0** |

Se cubren creación, normalización, unicidad, ID/documento, edición, identidad inmutable, correo, obligatorios, múltiples roles, retirada total/parcial, categorías, límite de resultados, desactivación, inexistentes y precisión de fechas. Las pruebas del adaptador verifican LWT antes del lote, conflicto sin otra escritura, reserva pendiente, sincronización de categorías y fallo parcial sin liberar documento.

### API real, Cassandra y persistencia

`Test-PersonasDocker.ps1` terminó con código 0 y **72 comprobaciones correctas**, incluido el reinicio. Registro: [fase4-api-comprobaciones.txt](fase4-api-comprobaciones.txt).

Se observaron 201, 200, 204, 400, 404 y 409. Se comprobaron los siete endpoints, datos opcionales y LocalDate, documento inmutable, los cuatro roles simultáneos, retirada de todos los roles, reasignación de PROVEEDOR, desactivación idempotente y conservación del documento único después de desactivar. Dos POST enviados concurrentemente para otro documento devolvieron exactamente un 201 y un 409.

Las consultas directas a `system.local` confirmaron **Cassandra 4.1.12, datacenter1**. `system_schema.tables` confirmó exactamente `id_por_documento`, `personas_por_id` y `personas_por_rol` en el keyspace.

Capturas de las filas reales, tomadas antes de la limpieza:

- [fase4-cassandra-antes.json](fase4-cassandra-antes.json): estado antes de reiniciar el backend.
- [fase4-cassandra-despues.json](fase4-cassandra-despues.json): mismo estado recuperado después del reinicio.

Identidad comprobada: `4f65019c-4a01-4753-ad6a-6ff42c65d074`. Documento ficticio: `FASE4_TEST / FASE4-978e30b0f9d7497d810f391a96bca64b-A`.

```json
{
  "id": "4f65019c-4a01-4753-ad6a-6ff42c65d074",
  "nombres": "Ana Actualizada",
  "ciudad": "Pasto",
  "fecha_nacimiento": "2000-01-02",
  "activo": false,
  "roles": ["PROVEEDOR"],
  "fecha_creacion": "2026-11-04 23:59:13.014Z",
  "fecha_actualizacion": "2026-11-04 23:59:17.542Z"
}
```

Después de reiniciar únicamente `facturacion-backend`, la API devolvió todos los campos idénticos y permitió consultar por documento y PROVEEDOR. CQL confirmó la persona inactiva, el UUID en `id_por_documento`, la pertenencia a PROVEEDOR y la ausencia en CLIENTE. Las bases y volúmenes no se reiniciaron durante esta comprobación.

El `finally` eliminó solo los registros asociados a los dos documentos aleatorios de esa ejecución. Comprobó la ausencia de cada UUID en las cuatro particiones de roles, de cada fila canónica y de sus reservas de documento. Las capturas son evidencia histórica de pruebas ficticias, no registros dejados en la base.

### Regresión real de MongoDB y GridFS

`Test-ProductosDocker.ps1` terminó con código 0 y **44 comprobaciones correctas**, ejecutado después de la integración de personas. Se verificaron catálogo, validaciones, unicidad del SKU, Decimal128 exacto, índice `sku_unico`, carga/reemplazo/lectura de PNG, `fs.files`/`fs.chunks` y eliminación de la imagen anterior.

Se reinició nuevamente solo el backend y se recuperaron el mismo producto inactivo y los mismos bytes de la imagen. La limpieza eliminó exclusivamente dos productos ficticios y una imagen asociados a sus UUID/SKU de prueba.

- [fase4-productos-comprobaciones.txt](fase4-productos-comprobaciones.txt): registro de las 44 comprobaciones de esta ejecución.
- [fase4-mongodb-regresion.json](fase4-mongodb-regresion.json): documento, tipos BSON, índice y metadatos GridFS observados.

Los archivos históricos `fase3-*` en `docs/` se conservan; la evidencia de esta regresión usa nombres `fase4-*`.

### Estado final de contenedores

Comprobación final del 4 de noviembre de 2026, alrededor de las 19:04 en Colombia:

| Servicio | Estado | Publicación en Windows |
| --- | --- | --- |
| `facturacion-backend` | En ejecución, healthy | `127.0.0.1:8080` |
| `facturacion-cassandra` | En ejecución, healthy | Ninguna |
| `facturacion-mongodb` | En ejecución, healthy | Ninguna |
| `facturacion-mysql` | En ejecución, healthy | Ninguna |
| `facturacion-cassandra-init` | Exited (0), ejecución completada | Ninguna |

`GET /api/health` devolvió `{"status":"OK","sistema":"Facturacion Hexagonal"}`. El puerto 9042 permanece exclusivamente dentro de Docker. Se conservaron los contenedores de bases y sus volúmenes originales; se reconstruyó y reemplazó solo el backend y se añadió el inicializador.

`docker compose config --quiet` y `git diff --check` terminaron correctamente. No se realizaron commits ni push. Los datos ficticios de ambas pruebas quedaron limpios.

## Limitaciones conocidas

- Listado limitado a 100 referencias por rol, sin paginación ni orden por nombre; requiere hasta 100 consultas adicionales por UUID. Una sola partición por rol es suficiente para este volumen académico.
- Sin control optimista de versiones ni bloqueo de ediciones concurrentes: las actualizaciones de la misma persona pueden sobrescribirse. La prueba concurrente demuestra unicidad del documento, no aislamiento de ediciones. Durante fallos se debe estabilizar la escritura y reconciliar desde el dato canónico.
- LWT y lote son pasos separados. La reserva pendiente requiere el procedimiento manual descrito arriba. No hay garantía de aislamiento entre tablas ni recuperación frente a pérdida del único disco.
- Cassandra local sin autenticación, un nodo, RF=1. La salud HTTP conserva su contrato y no supervisa continuamente las bases; la preparación de CQL y el índice Mongo verifican conexiones al arrancar.
- `IF NOT EXISTS` inicializa un esquema nuevo y permite repetirlo; no modifica tablas preexistentes incompatibles ni sustituye un sistema de migraciones.
- Los fallos parciales se prueban con mocks; las pruebas reales verifican operaciones normales, concurrencia de creación y reinicio del backend. No se inyectaron fallos destructivos sobre Cassandra ni sus datos.
- No se valida todavía el proveedor de productos contra personas. El correo solo recibe validación de formato.

El entorno local usa JDK 22 con compilación `release 21`; Docker verifica la ejecución con Java 21. Maven muestra un aviso 403 al consultar metadatos de un repositorio snapshot externo, sin impedir `BUILD SUCCESS`.
