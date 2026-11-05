# Fase 7A — Infraestructura Apache Druid

Verificación realizada el **5 de noviembre de 2026**, sobre el commit de referencia `855f9093f56bad7c0af56dd220b8ae01957a06b3`. La ingesta, las consultas SQL, la persistencia tras reiniciar y la limpieza del datasource temporal se comprobaron con Docker real. Esta fase no incorpora un adaptador Java ni modifica facturación o el frontend.

## Auditoría previa

Antes de editar se revisaron Compose, las claves de `.env` y `.env.example` sin imprimir sus contraseñas, los montajes existentes, imágenes, puertos, memoria y disponibilidad HTTP.

| Comprobación | Resultado inicial |
| --- | --- |
| Equipo | Windows 11, 16 GB RAM; Ryzen 5 2600X indicado por el usuario |
| Docker | Desktop 4.91.0, Engine 29.8.0, contexto `desktop-linux` |
| Recursos visibles por Docker | 6.216.564.736 bytes, aproximadamente 5,79 GiB; 4 CPU |
| `.wslconfig` existente | `memory=6GB`, `processors=4`, `swap=2GB`, `autoMemoryReclaim=gradual` |
| Memoria libre en Windows | Aproximadamente 4,55 GiB durante la auditoría |
| Nexo | Cinco contenedores activos y saludables; aproximadamente 2,7 GiB en conjunto |
| Inicializador Cassandra | Servicio de ejecución única; no es un proceso permanente |
| Backend | `/api/health`: HTTP 200, `status=OK` |
| Frontend | HTTP 200 en `127.0.0.1:5173` |
| Facturación | Una factura existente, consultable antes del cambio |
| Puerto 8888 | Libre |
| Otros puertos Windows | 5173 y 8080 usados por Nexo; listeners existentes en 27017 y 3306; 9042 sin listener observado |

Los puertos de las bases de Nexo no están publicados por este Compose. Los listeners adicionales de Windows no generan conflicto con Druid, que solo publica 8888. No se modificó la configuración de Windows, Docker Desktop ni WSL2.

Volúmenes de negocio conservados:

- `facturacion-hexagonal_mongodb-data` → `/data/db`.
- `facturacion-hexagonal_cassandra-data` → `/var/lib/cassandra`.
- `facturacion-hexagonal_mysql-data` → `/var/lib/mysql`.

MongoDB conserva también su montaje anónimo preexistente en `/data/configdb`. Los contenedores de negocio no se recrearon durante la integración.

## Versiones y despliegue elegido

Se usa **Apache Druid 38.0.0**, con los ajustes pequeños de `nano-quickstart` y límites explícitos para cada JVM. Se inspeccionó `/druid.sh` en el código de esa versión: recibe nombres de servicio como `coordinator`, `broker` o `middleManager`. `nano-quickstart` se selecciona mediante `DRUID_SINGLE_NODE_CONF`; no se pasa como comando.

La configuración oficial nano permite ejecutar **Coordinator y Overlord en una sola JVM**, iniciada con `command: [coordinator]`. Se necesitan otros cuatro procesos Druid y dos dependencias. PostgreSQL está dedicado a los metadatos de Druid; MySQL conserva las facturas, detalles y pagos de Nexo.

| Servicio Compose | Imagen | Responsabilidad | Puerto interno |
| --- | --- | --- | --- |
| `druid-metadata` | `postgres:17.6-alpine` | Metadatos, segmentos publicados e historial de tareas | 5432 |
| `druid-zookeeper` | `zookeeper:3.9.4` | Descubrimiento y coordinación | 2181 |
| `druid-coordinator` | `apache/druid:38.0.0` | Coordinator y Overlord | 8081 |
| `druid-broker` | `apache/druid:38.0.0` | SQL y distribución de consultas | 8082 |
| `druid-historical` | `apache/druid:38.0.0` | Carga y consulta de segmentos persistidos | 8083 |
| `druid-middlemanager` | `apache/druid:38.0.0` | Ejecuta una JVM Peon por tarea; capacidad máxima 1 | 8091 y puertos de tareas internos |
| `druid-router` | `apache/druid:38.0.0` | Consola web y proxy de SQL/administración | 8888 |

Todos pertenecen al perfil **`analytics`** y a `facturacion-interna`. Cada proceso anuncia su nombre de servicio Docker mediante `druid.host`, con `DRUID_SET_HOST_IP=0`. Ningún servicio de Nexo depende de ellos.

Solo Router publica **`127.0.0.1:8888:8888`**, configurable con `DRUID_PORT`. Los puertos que una imagen declara con `EXPOSE` no son publicaciones en Windows. ZooKeeper tiene deshabilitado su servidor administrativo.

Las etiquetas se verificaron con `docker manifest inspect` y las imágenes se descargaron. Digests obtenidos en esta ejecución:

| Imagen | Digest descargado |
| --- | --- |
| Druid 38.0.0 | `sha256:4156a8ca87b855ff6c14f9d95529149b64fe56e25cb394d3043957efae0b9054` |
| PostgreSQL 17.6 Alpine | `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94` |
| ZooKeeper 3.9.4 | `sha256:dfa9ba46d14bd52bcb3c1dac3ba91f179cf4cebf7ee576e1c2df09c68fc1d30d` |

## Memoria

La configuración común está en `infrastructure/druid/common.env`; los límites de JVM y contenedor están en Compose. Los valores siguientes son MiB. Las JVM Druid usan `Xms=64m`, dos procesadores visibles y dos hilos de compilación.

| Proceso | Heap máximo | Memoria directa máxima | Límite del contenedor | Muestra tras la ingesta |
| --- | ---: | ---: | ---: | ---: |
| Coordinator + Overlord | 256 | 64 | 512 | 265 |
| Broker | 256 | 128 | 576 | 325 |
| Historical | 256 | 128 | 576 | 264 |
| MiddleManager | 64 | 64 | 896, incluido Peon | 214 sin tarea activa |
| Peon de ingesta o limpieza | 256, inicial 64 | 128 | Comparte los 896 del MiddleManager | Proceso transitorio |
| Router | 128 | 64 | 320 | 204 |
| ZooKeeper | 64, inicial 32 | 32 | 192 | 92 |
| PostgreSQL | No aplica | No aplica | 192 | 56 |

El total de límites de analytics es **3.264 MiB, aproximadamente 3,19 GiB**. Incluye espacio para memoria nativa y la tarea transitoria. Los buffers de procesamiento son de 16 MiB, con un hilo y dos buffers de mezcla; Historical limita su caché de segmentos a 1 GB y su caché de consultas a 16 MiB. PostgreSQL usa `shared_buffers=32MB` y hasta 30 conexiones.

Las muestras de `docker stats` situaron analytics alrededor de **1,3–1,4 GiB sin tarea activa**, y Nexo más analytics alrededor de **4 GiB**. Tras el reinicio y la tarea de limpieza, `memory.peak` del MiddleManager marcó 405.188.608 bytes, unos 386 MiB; esa lectura no mide el pico global ni el pico de la ingesta anterior al reinicio. No se observaron contenedores terminados por OOM ni reinicios automáticos en la prueba.

Los límites máximos sumados de Nexo y analytics exceden los 5,79 GiB disponibles para Docker. La demostración de dos filas funcionó con ambos activos, pero no garantiza concurrencia o cargas grandes. Se mantiene una sola tarea simultánea y se recomienda detener analytics cuando no se use. Ante falta de memoria, cerrar otras cargas y ejecutar demostraciones pequeñas; cualquier aumento global de WSL2 requiere una decisión explícita del usuario.

## Persistencia

Los nueve volúmenes nuevos reciben el prefijo `facturacion-hexagonal_`:

| Volumen lógico | Montaje | Contenido |
| --- | --- | --- |
| `druid-metadata-data` | `/var/lib/postgresql/data` | Base de metadatos PostgreSQL |
| `druid-zookeeper-data` | `/data` | Snapshots ZooKeeper |
| `druid-zookeeper-log` | `/datalog` | Log de transacciones ZooKeeper |
| `druid-shared` | `/opt/shared` en Coordinator, Historical y MiddleManager | Deep storage de segmentos y logs de tareas |
| `druid-coordinator-var` | `/opt/druid/var` | Trabajo local del coordinador |
| `druid-broker-var` | `/opt/druid/var` | Trabajo local del broker |
| `druid-historical-var` | `/opt/druid/var` | Caché de segmentos y trabajo de Historical |
| `druid-middlemanager-var` | `/opt/druid/var` | Directorios de tareas y trabajo de Peon |
| `druid-router-var` | `/opt/druid/var` | Trabajo local de Router |

El deep storage compartido y PostgreSQL permiten recuperar los datos aunque se pierda la caché de un proceso. El uso de un volumen local compartido corresponde a este despliegue de un solo equipo.

## Inicio, salud y apagado

Desde la raíz, conserva el `.env` existente y añade las claves de `.env.example` para analytics: `DRUID_PORT=8888` y una `DRUID_METADATA_PASSWORD` local. La sesión de implementación generó una contraseña aleatoria únicamente en el `.env` ignorado por Git. Compose ofrece un valor de ejemplo para no impedir el arranque normal de Nexo cuando esas claves no están definidas.

La contraseña se lee en Druid mediante un `EnvironmentVariablePasswordProvider`, evitando que `/druid.sh` imprima el secreto al configurar propiedades. No cambies esa clave después de inicializar PostgreSQL sin actualizar también la contraseña del rol en la base persistida.

```powershell
# Nexo sin activar analytics; requiere sus imágenes ya construidas:
docker compose up -d --no-build --wait --wait-timeout 600

# Solo Druid y sus dependencias; no inicia ni recrea Nexo:
docker compose --profile analytics up -d --wait --wait-timeout 600 druid-router

# Estado de ambos conjuntos:
docker compose --profile analytics ps
Invoke-RestMethod http://127.0.0.1:8888/status/health
(Invoke-RestMethod http://127.0.0.1:8888/status).version
$sql = @{ query = 'SELECT 1 AS "ok"' } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8888/druid/v2/sql -Method Post -ContentType application/json -Body $sql
```

Abre **http://localhost:8888** desde Windows. `/status/health` comprueba la JVM consultada; el estado saludable de todos los contenedores y la consulta SQL completan la comprobación de disponibilidad. La prueba de ingesta siguiente comprueba el flujo de datos completo.

```powershell
# Detener solamente analytics conservando todos sus datos:
$analytics = @('druid-router', 'druid-middlemanager', 'druid-historical',
    'druid-broker', 'druid-coordinator', 'druid-zookeeper', 'druid-metadata')
docker compose --profile analytics stop $analytics

# Recuperarlo:
docker compose --profile analytics up -d --wait --wait-timeout 600 druid-router

# Detener todo el proyecto sin eliminar volúmenes:
docker compose --profile analytics stop
```

`docker compose --profile analytics down` sin opciones de borrado también conserva los volúmenes. **Nunca ejecutar `docker compose down -v` ni eliminar volúmenes del proyecto.** Desactivar el perfil no detiene contenedores analytics que ya estaban en ejecución; utiliza el comando `stop` con sus nombres.

## Prueba reproducible de ingesta y persistencia

Con analytics saludable, ejecuta desde la raíz con PowerShell 7:

```powershell
pwsh -NoProfile -File ./scripts/Test-DruidDocker.ps1
# Si DRUID_PORT es distinto:
# pwsh -NoProfile -File ./scripts/Test-DruidDocker.ps1 -BaseUrl http://127.0.0.1:8890
```

El script genera un nombre `fase7a_test_<UUID>` nuevo y no admite seleccionar un datasource existente. Envía dos documentos JSON inline mediante una tarea nativa `index`, sin rollup. Espera `SUCCESS`, consulta identificadores, enteros y fechas, y verifica en `sys.segments` que el segmento está publicado, disponible y servido fuera de tiempo real. Después detiene y arranca **los siete componentes analytics**, comprueba sus fechas de inicio y montajes, y repite la consulta exacta.

En `finally`, detiene su propia tarea si sigue activa, marca como no usados únicamente los segmentos de su datasource y ejecuta una tarea `kill` para ese datasource y su intervalo de un día. Espera `SUCCESS` y cero segmentos SQL. No escribe en las bases de negocio. Conserva los informes y el historial de tareas para auditar la prueba.

### Resultado real

Ejecución completa: **09:57:43–09:58:50, America/Bogota, 2026-11-05**.

- Run ID: `c685bb6e1ec7460d9858fdae0b96ff37`.
- Datasource: `fase7a_test_c685bb6e1ec7460d9858fdae0b96ff37`.
- Tarea: `fase7a_ingest_c685bb6e1ec7460d9858fdae0b96ff37`, estado `SUCCESS`.
- Informe: `processed=2`, `processedWithError=0`, `unparseable=0`, `thrownAway=0`, `segmentsPublished=1`.
- Consola HTTP 200; `/status` informó `38.0.0`; `SELECT 1 AS "ok"` devolvió `[{"ok":1}]`.

Consulta ejecutada antes y después del reinicio:

```sql
SELECT registroId, valorCentavos,
       TIMESTAMP_TO_MILLIS(__time) AS timestampMs
FROM "fase7a_test_c685bb6e1ec7460d9858fdae0b96ff37"
ORDER BY __time
```

| registroId | valorCentavos enviado / antes / después | timestampMs antes / después |
| --- | --- | --- |
| `c685bb6e1ec7460d9858fdae0b96ff37-A` | 123456 / 123456 / 123456 | 1793880000000 / 1793880000000 |
| `c685bb6e1ec7460d9858fdae0b96ff37-B` | 789012 / 789012 / 789012 | 1793880060000 / 1793880060000 |

Las fechas enviadas fueron `2026-11-05T12:00:00Z` y `2026-11-05T12:01:00Z`. Se comprobó un segmento con `is_published=1`, `is_available=1`, `is_realtime=0`, y sus archivos en `/opt/shared/segments/<datasource>/.../0/index/`.

Los siete contenedores cambiaron de `StartedAt` al reiniciarse y conservaron sus montajes. Las dos filas coincidieron exactamente después del reinicio: `persistence=true`. La limpieza cambió un segmento a no usado, terminó con `fase7a_kill_c685bb6e1ec7460d9858fdae0b96ff37: SUCCESS` y obtuvo cero segmentos del datasource: `cleanup=true`. La inspección posterior de deep storage no encontró archivos de segmentos temporales.

Durante la preparación se corrigió el tratamiento de arrays SQL vacíos en PowerShell y se cambió el ordenamiento de la consulta scan a `ORDER BY __time`, admitido por Druid. Un primer datasource, `fase7a_test_2e8d466462964a459dba3a79b21c901b`, también tuvo ingesta y limpieza `SUCCESS`. No quedaron segmentos de ninguna de las dos ejecuciones; los intentos detenidos antes de enviar datos solo dejaron evidencia local.

### Evidencia local

Los artefactos están ignorados por Git en `backend/target/fase7a/`. Cada prueba conserva su propia carpeta y no sobrescribe las anteriores. La ejecución completa está en `backend/target/fase7a/c685bb6e1ec7460d9858fdae0b96ff37/`:

- `summary.json`: versión, resultados SQL antes/después, persistencia y limpieza.
- `ingestion-spec.json`, `records-sent.json`, `ingestion-report.json` y estados de las tareas.
- `sql-before-restart.json` y `sql-after-restart.json`.
- `segments-before-restart.json` y `deep-storage-before.txt`.
- `containers-before.json`, `containers-after.json` y `memory-before-restart.txt`.

`baseline.json` registra el estado de Nexo anterior al cambio; `nexo-during-analytics-restart.json` documenta disponibilidad durante el reinicio. `final-regression.json` confirma facturas, identificadores de contenedores y montajes sin cambios, los doce contenedores saludables, cero OOM/reinicios automáticos y ausencia de segmentos temporales. Estos archivos pueden contener datos locales de negocio y no se incorporan al repositorio.

## Regresiones

| Comprobación | Resultado |
| --- | --- |
| `/api/health` | HTTP 200 y contrato original antes, durante y después |
| Frontend y proxy | HTTP 200 en 5173; APIs consultables desde el navegador |
| MongoDB, Cassandra y MySQL | Saludables; mismos contenedores y montajes existentes |
| Facturas | La factura inicial sigue disponible; respuesta del listado idéntica a la línea base |
| Compose normal | Solo seis servicios de Nexo habilitados por defecto, incluido el inicializador |
| Bloque Compose de Nexo | Idéntico al original; sin dependencia hacia analytics |
| Pruebas Java | `mvn --batch-mode --no-transfer-progress test`: 86 casos, 0 fallos, 0 errores, 5 omitidos |
| Pruebas de navegador | Dos pruebas desktop existentes, ambas correctas: dashboard con conteos reales y rutas/imágenes sin escrituras |

Las pruebas Java se ejecutaron con el JDK 22.0.1 disponible en Windows y compilación `release 21`; el contenedor de Nexo continúa usando Java 21. Las cinco pruebas optativas de MySQL no se activaron para evitar escrituras en la base real. Se observaron advertencias de metadatos Maven privados HTTP 401 y de Mockito, sin impedir `BUILD SUCCESS`.

Comandos de regresión sin crear registros de negocio:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
(Invoke-WebRequest http://127.0.0.1:5173).StatusCode
Invoke-RestMethod http://127.0.0.1:8080/api/facturas
docker compose --profile analytics ps
Push-Location backend
mvn --batch-mode --no-transfer-progress test
Pop-Location
Push-Location frontend
npx playwright test --project=desktop --grep 'todas las rutas y las imágenes reales siguen disponibles sin escrituras|dashboard consulta las APIs reales y presenta sus conteos'
Pop-Location
```

## Límites y referencias

Configuración académica de un solo equipo, sin alta disponibilidad ni autenticación Druid, accesible desde Windows solo en localhost. Los servicios comparten la red interna del proyecto. El deep storage es local; conservar datos tras reiniciar no sustituye un respaldo. No se validaron ingestas grandes, múltiples tareas simultáneas o recuperación ante pérdida del disco. La Fase 7B sigue pendiente.

Fuentes oficiales consultadas y contrastadas con la imagen descargada:

- [Druid con Docker](https://druid.apache.org/docs/latest/tutorials/docker/) y [despliegue single server](https://druid.apache.org/docs/latest/operations/single-server.html).
- [Distribución Docker de Druid 38.0.0](https://github.com/apache/druid/tree/druid-38.0.0/distribution/docker) y [script de entrada](https://github.com/apache/druid/blob/druid-38.0.0/distribution/docker/druid.sh).
- [Configuración nano de Druid 38.0.0](https://github.com/apache/druid/tree/druid-38.0.0/examples/conf/druid/single-server/nano-quickstart).
- [API de gestión de segmentos](https://druid.apache.org/docs/latest/api-reference/data-management-api/) y [tareas e informes de ingesta](https://druid.apache.org/docs/latest/ingestion/tasks/).
- [Proveedor de contraseña por variable de entorno](https://github.com/apache/druid/blob/druid-38.0.0/processing/src/main/java/org/apache/druid/metadata/EnvironmentVariablePasswordProvider.java).

No se hicieron commits ni push, no se modificaron tablas MySQL ni módulos MongoDB/Cassandra, y no se añadió código de negocio.
