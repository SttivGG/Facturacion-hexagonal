# Fase 7B — Adaptador analítico de facturación

Verificación real realizada el **5 de noviembre de 2026**. **Fase 7B completada:** una factura de crédito creada desde el punto de venta Nexo se consultó en Apache Druid 38.0.0 y pasó de PENDIENTE a PARCIAL y PAGADA después de sus abonos, con importes exactos. También se verificaron contado, idempotencia, recuperación con Druid apagado, persistencia tras reiniciar y conservación de volúmenes. El usuario autorizó los dos slots necesarios para una única ingesta SQL secuencial.

## Auditoría previa y ajuste autorizado

Se revisaron `docker-compose.yml`, `infrastructure/druid/common.env`, `scripts/Test-DruidDocker.ps1`, el informe FASE7A, `FacturaService`, `FacturaRepositoryPort`, `MySqlFacturaAdapter`, las entidades y mapeadores JPA, `Factura`, `DetalleFactura`, `Pago`, Flyway y las pruebas existentes.

La fase 7A demostró una tarea **nativa `index`**, dos registros, consulta SQL exacta y persistencia tras reiniciar sus siete servicios. No demostró SQL REPLACE. La imagen instalada contiene `druid-multi-stage-query-38.0.0.jar`; sus clases incluyen `maxNumTasks`, `waitUntilSegmentsLoad` y `failOnEmptyInsert`.

Comprobaciones reales del Druid actual:

- Los siete servicios analytics y los cinco procesos permanentes de Nexo estaban saludables al iniciar la auditoría.
- `GET /druid/indexer/v1/totalWorkerCapacity` devolvió `currentClusterCapacity=1`, `usedClusterCapacity=0`, `maximumCapacityWithAutoScale=-1`.
- Se consultó `INFORMATION_SCHEMA.COLUMNS` para `sys.segments`. Druid 38.0.0 expone `is_published`, `is_available`, `is_realtime`, `is_overshadowed` y `shard_spec`; **no** expone `is_tombstone`. La validación excluye tombstones mediante `shard_spec`.

[MSQ requiere al menos dos slots simultáneos](https://druid.apache.org/docs/latest/multi-stage-query/concepts/): un `query_controller` y un `query_worker`. `maxNumTasks=2` no puede ejecutarse con `druid.worker.capacity=1`. Serializar tres consultas no cambia ese mínimo por consulta. El adaptador detecta capacidad insuficiente y falla expresamente antes de enviar reemplazos.

El usuario autorizó **dos slots para SQL REPLACE con una sola sincronización secuencial**. `common.env` fija `druid_worker_capacity=2`; cada consulta mantiene `maxNumTasks=2`. El límite del MiddleManager sube de 896 a **1152 MiB**, incluyendo su JVM y los dos Peon; no se cambian los heaps de 256 MiB ni los límites de memoria directa de 128 MiB de cada Peon, ni buffers o recursos de los demás servicios. Tampoco se modifican WSL2, puertos o montajes. El informe 7A conserva sus mediciones históricas con capacidad uno.

Se comprobó en ejecución `currentClusterCapacity=2`. Las primeras tareas REPLACE de los tres datasources terminaron `SUCCESS`, con confirmación `segmentLoadWaiterStatus.state=SUCCESS`. El ensayo completo mide memoria y concurrencia; sus resultados se registran más adelante.

## Arquitectura

```text
FacturaService → FacturaRepositoryPort → MySqlFacturaAdapter → commit MySQL
                                            │
                                  FacturacionConfirmada
                                            │ AFTER_COMMIT
                                CoordinadorSincronizacion
                                            │
                              SincronizarFacturacionUseCase
                              SincronizarFacturacionService
                                            │
                              PrepararSnapshotFacturacion
                                            │
                          FacturaRepositoryPort.listar (RR)
                                            │
                                HechosFacturacionMapper
                                            │
                                AnalyticsIngestionPort
                                            │
                                DruidAnalyticsAdapter
                              DruidSqlMapper / DruidHttpClient
```

El dominio y la aplicación solo importan Java y contratos propios. `SincronizarFacturacionUseCase` es el puerto de entrada; `AnalyticsIngestionPort` envía el snapshot y devuelve conteos verificados; `AnalyticsConsultaPort` consulta disponibilidad e indicadores. `EstadoSincronizacion` comunica el estado de la coordinación local, incluida la última confirmación completa.

El adaptador MySQL publica un evento dentro de la transacción. El listener `AFTER_COMMIT` programa una tarea y captura errores de programación para evitar transformar un commit financiero correcto en un error de venta. No hace HTTP ni ingesta en el hilo financiero. El trabajo analítico usa un único ejecutor Java. El coordinador Spring añade el temporizador y el arranque; la coordinación de versiones, extracción, envío y resultados está en el caso de uso de aplicación.

## Snapshot y sincronización

`listar()` materializa cabeceras, detalles y pagos dentro de una transacción MySQL de solo lectura `REPEATABLE_READ`. Las relaciones JPA se leen antes de salir del proxy. Los tres conjuntos proceden del mismo snapshot InnoDB; la transacción termina antes de llamar a Druid. No se consultan MongoDB o Cassandra durante la extracción ni para reconstruir datos históricos.

Reglas implementadas:

1. Validar identidades persistidas y únicas, número de factura, detalles y coherencia de totales/pagos.
2. Transformar a hechos inmutables y convertir dinero exactamente.
3. Prevalidar tamaños de las tres peticiones y sumas int64 antes del primer reemplazo.
4. Esperar tareas propias aún activas del prefijo `query-nexo_7b_` después de un reinicio o de una respuesta perdida.
5. Comprobar capacidad MSQ. Enviar facturas, detalles y pagos secuencialmente, esperando cada tarea y su verificación antes de comenzar la siguiente.
6. Esperar `SUCCESS`. Ante `FAILED` o cancelación, consultar `/reports` y mostrar el código de fallo sin copiar el snapshot inline a logs.
7. Verificar mediante SQL `COUNT(*)`, identidades distintas exactas, todas las sumas monetarias y cantidades; comprobar segmentos publicados, disponibles, no eclipsados y servidos fuera de tiempo real.
8. Publicar éxito global y conteos únicamente al confirmar los tres conjuntos. Un fallo deja pendiente el reintento y retira los conteos de la ejecución parcial; conserva la fecha histórica del último éxito completo.

Las peticiones usan esta forma, con columnas y firma explícitas:

```sql
REPLACE INTO "nexo_facturas" OVERWRITE ALL
SELECT TIME_PARSE("timestamp") AS __time, factura_id, numero_factura, ...
FROM TABLE(EXTERN('<fuente inline JSON>', '{"type":"json"}', '<firma JSON>'))
PARTITIONED BY DAY
```

El contexto fija `maxNumTasks=2`, `taskAssignment=auto`, `maxRowsInMemory=1000`, `maxParseExceptions=0`, `waitUntilSegmentsLoad=true`, zona UTC e identificador único. Para conjuntos no vacíos fija `failOnEmptyInsert=true`. Los literales SQL duplican apóstrofes; las filas se codifican primero como JSON y después dentro de la fuente JSON. Los identificadores de columnas/datasources son constantes de infraestructura.

**Sin facturas en MySQL:** resultado `SIN_FACTURAS_ORIGEN_CONSERVADO`, sin reemplazar ni borrar nada y sin afirmar éxito. La extracción nula, duplicada, incoherente o fuera de rango falla antes del envío. Una colección de pagos vacía es válida: si la tabla no existe, se confirma su ausencia en Druid y se informa cero sin inventar registros; si existe, el SQL produce cero filas y REPLACE elimina sus hechos anteriores. No se crean filas centinela. Este último comportamiento está probado con un doble de contrato y pendiente de ensayo real.

**Consistencia eventual:** cada commit incrementa una revisión. Cambios durante la ingesta dejan otra pasada pendiente. El temporizador revisa MySQL cada minuto por defecto; una huella SHA-256 con campos tipados y longitudes evita ingestas cuando el contenido coincide con el último éxito y Druid responde. La llamada manual y el arranque fuerzan reconciliación. Un fallo invalida la huella para que un reintento nunca se omita por coincidir con un éxito antiguo.

Un reinicio de Spring pierde los contadores de estado en memoria, pero fuerza una extracción completa desde MySQL. Druid conserva sus segmentos independientemente del backend. No hay cola externa ni transacción distribuida. **Los tres REPLACE no son atómicos entre sí**: durante una ejecución o tras un fallo parcial pueden verse versiones distintas. Una pasada posterior vuelve a reconciliar los tres.

## Modelo y tipos

Todos los hechos tienen `__time` TIMESTAMP de Druid, a partir de `Instant` UTC ISO 8601. Se particionan por día UTC y mantienen granularidad de evento, sin agregación/rollup en el SELECT.

| Datasource previsto | Granularidad de fila | Columnas |
| --- | --- | --- |
| `nexo_facturas` | Una por factura | `factura_id`, `numero_factura`, `cliente_id`, `modalidad`, `estado`, `fecha_vencimiento`, `subtotal_centavos`, `impuestos_centavos`, `total_centavos`, `total_pagado_centavos`, `saldo_pendiente_centavos` |
| `nexo_factura_detalles` | Una por detalle histórico | `detalle_id`, `factura_id`, `producto_id`, `sku`, `nombre_producto`, `cantidad`, `precio_unitario_centavos`, `subtotal_centavos`, `total_centavos` |
| `nexo_pagos` | Una por pago | `pago_id`, `factura_id`, `numero_factura`, `metodo_pago`, `monto_centavos`, `referencia` nullable |

IDs financieros, cantidades e importes: firma EXTERN `long`, SQL BIGINT, entero con signo de 64 bits. IDs UUID/producto y textos: `string`/VARCHAR. `fecha_vencimiento`: string ISO `yyyy-MM-dd`, nullable, sin asignarle una hora artificial. Emisión de la factura determina el tiempo de cabecera y detalles; `fechaPago` determina el tiempo del pago.

Conversión monetaria: `BigDecimal.movePointRight(2).longValueExact()`, sin `double` ni redondeo. Límite por importe: 92.233.720.368.547.758,07 COP, no negativo. MySQL admite DECIMAL más grandes: si uno no cabe, la factura sigue siendo válida en MySQL y analítica falla claramente antes de escribir. También se suman con `Math.addExact` todas las columnas sumables del snapshot antes de la ingesta, evitando overflow silencioso en sumas BIGINT de Druid. La API devuelve centavos enteros; consumidores JavaScript deben preservar int64 si superan su entero seguro.

Se omiten nombres/documentos de clientes, vendedor, contactos y observaciones. Los nombres de productos y precios se toman de los detalles MySQL. Las referencias de pago se incluyen por contrato; usar referencias ficticias en demostraciones.

## Configuración e inicio

Se conserva el perfil opcional `analytics`, sus siete servicios, los puertos y todos los volúmenes 7A. Backend no depende de salud ni disponibilidad de Druid.

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `DRUID_ENABLED` | `false` | Desactiva eventos, reconciliación e ingesta; backend funciona normalmente |
| `DRUID_BASE_URL` | Compose: `http://druid-router:8888`; Java local: `http://localhost:8888` | URL del Router |
| `DRUID_SYNC_INTERVAL` | `PT1M` | Revisión periódica de cambios |
| `DRUID_HTTP_TIMEOUT` | `PT10S` | Timeout de conexión y cada petición |
| `DRUID_TASK_TIMEOUT` | `PT8M` | Espera de tarea y de publicación/verificación |
| `DRUID_MAX_REQUEST_BYTES` | `1000000` | Límite del cuerpo JSON UTF-8 por datasource, entre 1024 y 2.000.000 |
| `DRUID_POLL_INTERVAL` | `PT2S` | Intervalo de sondeo configurable al ejecutar Java |

Configurar estas claves en `.env`, conservando contraseñas existentes. Para activar la integración definir `DRUID_ENABLED=true`; el valor predeterminado y `.env.example` permanecen en `false`. El servicio Router conserva el nombre real `druid-router`. El ajuste de capacidad ya está incluido en esta fase; el adaptador detectará y rechazará una capacidad accidentalmente inferior a dos antes de enviar tareas.

```powershell
docker compose --profile analytics up -d --no-build --wait --wait-timeout 600 druid-router
docker compose build facturacion-backend facturacion-frontend
docker compose up -d --no-deps --no-build --wait --wait-timeout 180 facturacion-backend facturacion-frontend
docker compose --profile analytics ps
```

Para mantener solo facturación, dejar `DRUID_ENABLED=false` y actualizar únicamente backend. No se requiere detener ni recrear bases.

## API administrativa local

| Método | Ruta | Respuesta |
| --- | --- | --- |
| POST | `/api/analitica/sincronizar` | 202 `ACEPTADA` o `EN_EJECUCION`; si está ocupado, deja otra revisión pendiente. 503 `DESHABILITADA` |
| GET | `/api/analitica/estado` | 200, habilitado, disponibilidad SQL real, en ejecución, pendiente, último resultado/error, fecha del último éxito y conteos verificados disponibles |
| GET | `/api/analitica/resumen` | 200, facturas, facturado/pagado/saldo en centavos, ventas por modalidad, pagos por método. 503 ProblemDetail si está deshabilitado, desconectado o sin facturas analíticas |

Resumen consulta exclusivamente Druid. No usa MySQL como sustituto. Los datos pueden estar transitoriamente desalineados mientras se reemplazan tres datasources; consultar estado para saber si hubo confirmación completa. Disponibilidad indica que Router/Broker responden a `SELECT 1`, no garantiza por sí sola capacidad de ingesta ni confirma un snapshot.

```powershell
$base = 'http://127.0.0.1:8080/api/analitica'
Invoke-RestMethod "$base/estado"
Invoke-RestMethod "$base/sincronizar" -Method Post
Invoke-RestMethod "$base/resumen"
```

**Limitación de acceso:** no hay autenticación; endpoints solo para el entorno académico local. Compose publica backend, frontend y Router en `127.0.0.1`. No exponerlos públicamente ni publicar la red interna con un túnel.

## Consultas reproducibles

[verificacion-fase7b.sql](../infrastructure/druid/verificacion-fase7b.sql) incluye facturas por fecha, total facturado, cobrado y saldo, ventas por modalidad, productos vendidos y pagos por método/fecha. Nunca suma cabeceras después de unir directamente detalles o pagos: esas relaciones multiplicarían los importes.

```powershell
$consulta = @{query='SELECT numero_factura, estado, total_centavos, total_pagado_centavos, saldo_pendiente_centavos FROM nexo_facturas ORDER BY __time'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8888/druid/v2/sql -Method Post -ContentType application/json -Body $consulta
```

## Pruebas y evidencias

Ejecutado durante la implementación:

- Regresión inicial backend: 86 pruebas, cero fallos/errores y cinco omitidas.
- Suite ampliada Windows: 108 pruebas, cero fallos/errores y cinco omitidas (`release 21`, JDK 22.0.1). Construcción final Docker con JDK 21.0.13: **110 pruebas, cero fallos/errores y cinco omitidas; BUILD SUCCESS**. Incluye las dos comprobaciones adicionales de capacidad y pagos vacíos.
- Pruebas nuevas: exactitud y overflow monetario, snapshots históricos sin datos personales, identidades duplicadas, protección de extracción vacía/fallida, reintento tras error, arranque, ausencia de tareas sin cambios, cambios durante la ingesta sin solapamiento, notificación después del commit observada desde otra conexión y ausencia de notificación tras rollback.
- Contratos Druid con servidor HTTP local/dobles: lectura de taskId, tres reemplazos secuenciales, fallo/cancelación y reporte, timeout, tareas huérfanas, validación de segmentos y sumas, límite de tamaño, pagos vacíos y ausencia de éxito con capacidad insuficiente. **Estos contratos no sustituyen una ingesta real en Druid.**
- Frontend: `npm run build` correcto. **Suite desktop final: 31 correctas y dos omitidas, cero fallos (1,3 min)**. Una espera agotada de la primera regresión pasó al repetirse; cinco fallos posteriores de APIs tras reiniciar se debieron al proxy con IP antigua y desaparecieron con la corrección DNS descrita abajo. No se editaron componentes o estilos. Las capturas/PDF versionados generados por las pruebas se restauraron a su contenido anterior.

Las cinco pruebas Java omitidas son integraciones MySQL optativas: se ejecutó el circuito real con el script de esta fase, conservando todas las facturas. Las dos pruebas de navegador omitidas son altas/ediciones CRUD optativas que requieren `UI_MUTATION_TESTS`; la creación real de cliente/producto y venta se comprobó en el ensayo Nexo → Druid.

Como comprobación previa se desplegó únicamente backend con `--no-deps` y `DRUID_ENABLED=false`. Estado devolvió 200 con `habilitado=false`, `disponible=false`, `enEjecucion=false`, `pendiente=false`, `SIN_EJECUTAR`, fecha de éxito nula y conteos vacíos. Sincronizar devolvió 503 `DESHABILITADA`; resumen devolvió 503 controlado. `/api/health` devolvió `OK` y frontend HTTP 200. El historial financiero seleccionado (ID, número, importes, saldo y estado) fue idéntico antes/después. MongoDB y Cassandra siguieron consultables, con un registro cada uno. Los doce contenedores estuvieron saludables, sin crear o borrar datos en esa comprobación previa. El circuito posterior activó `DRUID_ENABLED=true`, incorporó únicamente datos ficticios y conservó la factura original.

Evidencia local ignorada por Git: `backend/target/fase7b-maven.log`, `backend/target/fase7b/docker-build.log`, `backend/target/fase7b/frontend-retry.log`, `containers-initial.txt`, `containers-disabled-final.txt`, `disabled-state.json` y `disabled-regression.json` dentro de `backend/target/fase7b/` salvo el log Maven.

## Archivos de la implementación

| Ubicación | Contenido creado o modificado |
| --- | --- |
| `application/analytics/` | Hechos inmutables, transformación histórica, puertos de ingesta/consulta, estado, resumen y excepción analítica |
| `application/port/SincronizarFacturacionUseCase.java` | Contrato administrativo de entrada |
| `application/usecase/PrepararSnapshotFacturacion.java`, `SincronizarFacturacionService.java` | Extracción y coordinación asíncrona, revisiones, huella y recuperación |
| `domain/model/FacturacionConfirmada.java` | Evento Java sin dependencias de infraestructura |
| `domain/port/FacturaRepositoryPort.java` | Documentación del contrato de snapshot completo reutilizado |
| `infrastructure/adapter/output/mysql/MySqlFacturaAdapter.java` | Lectura consistente y eventos transaccionales de factura/abono |
| `infrastructure/adapter/output/druid/` | Adaptador, cliente HTTP, datasets y SQL REPLACE |
| `infrastructure/analytics/CoordinadorSincronizacion.java` | Ciclo de vida Spring, temporizador y AFTER_COMMIT |
| `infrastructure/config/AnalyticsConfiguration.java`, `DruidProperties.java` | Inyección de dependencias y configuración externa |
| `infrastructure/adapter/input/rest/AnaliticaController.java` | Tres endpoints administrativos y errores controlados |
| `backend/src/main/resources/application.properties`, `.env.example`, `docker-compose.yml` | Variables opcionales de integración y límite de 1152 MiB del MiddleManager; sin dependencia de arranque hacia Druid |
| `infrastructure/druid/common.env` | Dos slots para un controlador y un worker de una única ingesta SQL |
| `backend/src/test/java/` | Pruebas de hechos, coordinador, adaptador/HTTP, REST y commit/rollback; extensión de `FacturaJpaTests` |
| `frontend/nginx.conf` | Resolución DNS Docker del upstream después de reiniciar backend; sin cambios de pantallas o estilos |
| `scripts/Test-DruidIngesta.mjs` | Ensayo real con navegador, mediciones, reinicios, comprobación del proxy y reanudación desde checkpoint |
| `infrastructure/druid/verificacion-fase7b.sql`, `README.md`, este informe | Consultas y documentación |

Las rutas Java de la tabla son relativas a `backend/src/main/java/com/sttiv/facturacion/`. Los archivos de infraestructura 7A que ya estaban modificados o sin seguimiento al comenzar se conservaron; no se hicieron commits ni push.

### Circuito real ejecutado

Con analytics iniciado y `DRUID_ENABLED=true`, ejecutar desde la raíz:

```powershell
node scripts/Test-DruidIngesta.mjs
```

El script crea cliente/producto ficticios, factura de contado por API, factura de crédito desde el punto de venta existente con Chrome real, abono parcial y pago final. Comprueba directamente MySQL y Druid en cada estado; cambia el catálogo para comprobar historia, repite dos snapshots y compara conteos/sumas exactos. Después apaga únicamente analytics, crea una factura, comprueba que MySQL funciona y que el fallo analítico es visible, reinicia Spring con la deuda pendiente, recupera Druid y reintenta. Para demostrar persistencia detiene Spring, reinicia los siete servicios Druid y consulta sus hechos **con Spring todavía detenido**. Luego arranca Spring y confirma la reconciliación y los montajes conservados.

El script **conserva sus tres facturas y sus referencias ficticias**; cada ejecución nueva añade otras tres. En `finally` intenta recuperar analytics y backend si quedaron detenidos. No borra bases, segmentos ni volúmenes. Guarda resultados, consultas antes/después, muestras de memoria/tareas y captura de la venta en `backend/target/fase7b/<UUID>/`. Variables opcionales de prueba: `NEXO_API_URL`, `UI_BASE_URL`, `DRUID_TEST_URL`.

Ejecución verificada, incluyendo las comprobaciones finales del proxy: **12:36:17–13:00:39, America/Bogota**. Run ID: `6b99de3a-fcf5-4bfc-8aeb-f5b45bd9dce9`, resumen final `success=true` y 82 comprobaciones registradas. No se eliminaron las facturas ficticias `FAC-41`, `FAC-42` y `FAC-43`; la factura previa permaneció intacta.

La primera pasada completó el circuito financiero, la recuperación y las consultas de persistencia con Spring detenido. Se interrumpió al intentar arrancar Spring con `docker compose start`, que en este entorno exige el contenedor ausente `facturacion-cassandra-init`. Se corrigió el script para usar `up -d --no-deps --no-build --wait` y se reanudó **el mismo ensayo**, sin volver a crear datos. Se conserva el resumen previo y el error en el historial de reanudación. El cierre terminó con código 0:

```powershell
# Solo después de existir el checkpoint de persistencia Druid de ese ensayo:
node scripts/Test-DruidIngesta.mjs --resume 6b99de3a-fcf5-4bfc-8aeb-f5b45bd9dce9
```

La reanudación valida los archivos anteriores y retoma únicamente la comprobación final de Spring, montajes y resultados; si no existe el checkpoint, falla. No sustituye las etapas anteriores.

| Escenario real solicitado | Estado actual |
| --- | --- |
| Factura de contado confirmada en MySQL y Druid | Correcto: FAC-41, total/pago 1.000.025 centavos, saldo 0 |
| Crédito PENDIENTE → PARCIAL → PAGADA con saldos exactos | Correcto: FAC-42, creada desde Nexo en Chrome; ver tabla siguiente |
| Dos snapshots sin duplicaciones | Correcto: mismos conteos, identidades y sumas en las dos repeticiones |
| Venta con Druid apagado y reconciliación tras reinicio | Correcto: FAC-43 creada con los siete servicios apagados; HTTP 201 en 49 ms; recuperada después del reinicio de Spring |
| Persistencia de hechos tras reiniciar Druid y Spring | Correcto: datos consultados con Spring detenido y de nuevo tras arrancarlo |
| Conteos e importes de negocio antes/después | MySQL 1/2/1 → 4/5/4 facturas/detalles/pagos; la factura original se conserva |
| Datasources `nexo_*` creados por esta fase | `nexo_facturas`, `nexo_factura_detalles`, `nexo_pagos`, con 4/5/4 registros verificados |

Estado de **FAC-42**, con total constante de 2.000.050 centavos (20.000,50 COP), idéntico en MySQL y Druid:

| Momento | Estado | Pago agregado (centavos) | Saldo (centavos) |
| --- | --- | ---: | ---: |
| Sin inicial | PENDIENTE | 0 | 2.000.050 |
| Abono NEQUI de 500.010 | PARCIAL | 500.010 | 1.500.040 |
| Pago TRANSFERENCIA de 1.500.040 | PAGADA | 2.000.050 | 0 |

El precio histórico del detalle quedó en **1.000.025 centavos** y su SKU original, incluso después de cambiar el producto MongoDB a 99.999,99 COP y otro SKU. Los tiempos de emisión, detalles y pagos se comprobaron también con `TIMESTAMP_TO_MILLIS(__time)` frente a las fechas UTC de MySQL/API, sin diferencias.

Idempotencia y persistencia, con todas las sumas comprobadas como enteros exactos:

| Momento | Facturas | Detalles | Pagos | Facturado (centavos) | Cobrado (centavos) | Saldo (centavos) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Antes de las dos repeticiones | 3 | 4 | 4 | 19.950.075 | 19.950.075 | 0 |
| Después de repetición A | 3 | 4 | 4 | 19.950.075 | 19.950.075 | 0 |
| Después de repetición B | 3 | 4 | 4 | 19.950.075 | 19.950.075 | 0 |
| Después de recuperar FAC-43 | 4 | 5 | 4 | 29.950.074 | 19.950.075 | 9.999.999 |
| Después de reiniciar Druid, Spring detenido | 4 | 5 | 4 | 29.950.074 | 19.950.075 | 9.999.999 |
| Después de arrancar Spring y reconciliar | 4 | 5 | 4 | 29.950.074 | 19.950.075 | 9.999.999 |

Los detalles suman 15 unidades y 29.950.074 centavos al final; los pagos suman 19.950.075 centavos. No se sumaron totales de factura después de joins uno a muchos. `/api/analitica/resumen` devolvió esos mismos valores desde Druid y agrupaciones por modalidad y método.

Con Druid apagado, el estado devolvió `disponible=false`, `pendiente=true`, `ultimoResultado=FAILED`, error `Druid no responde o agotó el timeout HTTP` y conteos vacíos, conservando la fecha del éxito anterior. Resumen devolvió 503; la venta continuó funcionando. Al finalizar: `habilitado=true`, `disponible=true`, `enEjecucion=false`, `pendiente=false`, `SUCCESS`, `ultimoError=null`, conteos 4/5/4. Último éxito registrado: `2026-11-05T17:53:51.911741849Z` (12:53:51 America/Bogota).

### Memoria, concurrencia y contenedores

Se recogieron **348 muestras** en el ensayo y sus reanudaciones. Máximos observados: **un controlador, un worker y dos tareas MSQ**, pertenecientes a una sola ingesta. Nunca se lanzaron consultas de ingesta paralelas. Se inspeccionaron las **33 tareas controladoras** de esta prueba: todas `SUCCESS`, con `segmentLoadWaiterStatus.state=SUCCESS`. Cada datasource tenía al final un segmento publicado y disponible en Historical.

Se observó además un periodo de **65 segundos sin cambios MySQL**: el número de tareas controladoras permaneció en 33 antes/después, y el estado siguió `SUCCESS`, sin ejecución ni pendientes. La revisión periódica no produjo otros tres snapshots innecesarios.

| Medición | Resultado |
| --- | --- |
| Slots MiddleManager | 2; cada consulta usa `maxNumTasks=2` |
| Límite MiddleManager | 1152 MiB, antes 896 MiB |
| Heap / memoria directa por Peon | 256 / 128 MiB, sin cambios |
| Máximo MiddleManager muestreado por Docker | 749,6 MiB |
| Pico cgroup MiddleManager antes de la primera parada | 810.905.600 bytes, aproximadamente 773,34 MiB |
| Mayor suma muestreada de los doce contenedores | 4348,107 MiB, aproximadamente 4,25 GiB |
| Memoria visible para Docker | 6.216.564.736 bytes, aproximadamente 5,79 GiB; sin modificar WSL2 |
| Eventos cgroup `oom`, `oom_kill`, `max` | 0 en todas las lecturas guardadas |
| Contenedores finales | 12 saludables, sin OOM ni reinicios automáticos |
| Volúmenes | Mismos nombres y destinos antes y después; bases de negocio sin reiniciar |

El pico cgroup incluye memoria que Docker puede excluir como caché de archivos; la suma de muestras no es un pico global de WSL2. Las mediciones corresponden a cuatro facturas y no garantizan cargas grandes. La suma de límites de todos los servicios continúa excediendo la memoria física asignada a Docker; el despliegue es académico y debe mantenerse con una única ingesta pequeña.

Evidencia principal en `backend/target/fase7b/6b99de3a-fcf5-4bfc-8aeb-f5b45bd9dce9/`:

- `summary.json`, resúmenes previos a reanudar y las comprobaciones 01–10.
- `01-contado.json`, `02-credito-pendiente.json`, `03-credito-parcial.json`, `04-credito-pagada.json`, `08-recuperacion.json`: consultas comparadas MySQL/Druid.
- `05-historico.json`, `06-idempotencia.json`, `07-druid-apagado-estado.json`.
- `09-totales-antes-reinicio.json`, `09-totales-despues-reinicio-druid.json`, contenedores antes/después.
- `credito-nexo.png`, `metrics.ndjson` y `memory-peaks.json`.

Las comprobaciones adicionales están en `backend/target/fase7b/real/`: esquema real de las 29 columnas, fechas UTC, conservación de la factura inicial, tareas/publicación, segmentos finales y montajes. Todos estos artefactos locales están ignorados por Git y no incluyen contraseñas ni nombres/documentos reales.

Logs de cierre: `integration-proxy-final.log` con código 0, `frontend-build-final.log`, `frontend-desktop-fixed.log` (31 correctas), `idle-reconciliation.json` (33 → 33 tareas), `task-publication.json`, `segments-final.json` y `mounts-preserved.json`. El log previo `frontend-desktop-final.log` conserva los cinco errores 502 que motivaron la corrección del proxy.

### Recuperación del proxy después del reinicio

La regresión tras los reinicios detectó HTTP 502 en `/api` a través de Nginx, mientras las mismas APIs en el backend respondían correctamente. Los logs mostraron un upstream con la IP antigua `172.18.0.5`; el DNS Docker ya resolvía `facturacion-backend` a `172.18.0.13`. La configuración anterior resolvía el nombre al arrancar Nginx y mantenía esa dirección.

Se corrigió únicamente `frontend/nginx.conf`: resolver Docker `127.0.0.11`, validez de cinco segundos, timeout de dos segundos y `proxy_pass` con una variable de upstream. Se mantiene la URI original de `/api`. Se reconstruyó el frontend; `nginx -t` pasó y health, productos, personas, facturas, estado y resumen analíticos devolvieron HTTP 200 mediante el puerto 5173. La factura pagada y sus abonos se consultaron también por ese proxy en el ensayo ampliado.

Esta corrección es necesaria para la recuperación exigida por 7B. Los bundles conservaron los mismos nombres con hash de contenido: `index-9dP55i6B.css` e `index-CQ_GvLGi.js`; no se editaron componentes React, estilos o pantallas Nexo. Referencias: [proxy_pass con variables](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) y [resolver](https://nginx.org/en/docs/http/ngx_http_core_module.html#resolver).

## Limitaciones

- Snapshot completo para pocos datos, en memoria y con límite pequeño de petición inline; no apropiado para grandes historiales.
- No se añadió una política de limpieza de versiones antiguas de segmentos; esta fase no acota el crecimiento de deep storage al repetir snapshots.
- Un único backend/escritor. El bloqueo local no coordina varias réplicas; no desplegar múltiples instancias de sincronización.
- Reemplazos independientes: no hay atomicidad entre los tres datasources ni bloqueo de las escrituras financieras mientras se ingesta.
- El hash y el estado son locales; el reinicio fuerza reconstrucción. Si se modifica Druid manualmente conservando el backend activo, usar el endpoint manual para forzar reconciliación incluso sin cambios MySQL.
- Sin facturas en origen se conservan hechos existentes por precaución; vaciar intencionalmente la analítica requiere una operación administrativa distinta.
- Los errores no registran el JSON inline ni reportes completos para evitar información innecesaria en logs. El operador puede consultar el reporte en la consola local usando el taskId.
- No se cambiaron reglas financieras, diseño de Nexo, WSL2, puertos de negocio o volúmenes. No hay commits ni push automáticos.

## Referencias oficiales

- [API SQL de ingesta](https://druid.apache.org/docs/latest/api-reference/sql-ingestion-api/).
- [MSQ: ejecución y mínimo de dos slots](https://druid.apache.org/docs/latest/multi-stage-query/concepts/).
- [Referencia REPLACE, EXTERN y contexto](https://druid.apache.org/docs/latest/multi-stage-query/reference/).
- [Actualizar datos con REPLACE](https://druid.apache.org/docs/latest/tutorials/tutorial-update-data/).
- [API de tareas y reportes](https://druid.apache.org/docs/latest/api-reference/tasks-api/).

Las rutas de documentación versionada 38.0.0 no estuvieron disponibles en la herramienta web durante esta sesión; se usó documentación oficial actual y se contrastaron parámetros, esquema, endpoints y ejecución de SQL REPLACE con la imagen 38.0.0 instalada. Las tareas reales y las consultas de negocio confirmaron la compatibilidad.
