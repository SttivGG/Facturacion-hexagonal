# Nexo · Sistema de Facturación Hexagonal

Nexo es un proyecto académico para gestionar productos, personas, ventas de contado o a crédito y sus pagos. Su objetivo es aplicar arquitectura hexagonal e integrar varios motores de persistencia sin acoplar las reglas del negocio a sus clientes o frameworks.

El backend usa Java 21 y Spring Boot 4.1.2. El frontend usa React, TypeScript y Vite. MongoDB almacena productos e imágenes GridFS; Cassandra, personas y roles; MySQL, facturas, detalles y pagos. Apache Druid incorpora ingesta y consultas analíticas mediante el perfil opcional `analytics`.

## Funcionalidades disponibles

- Productos con SKU único, precios en COP, imágenes JPEG/PNG/WebP, edición y desactivación lógica. Las imágenes se guardan en GridFS.
- Personas con documento único, roles Cliente/Proveedor/Trabajador/Administrador, consulta por documento, edición y desactivación. La consulta por rol devuelve hasta 100 registros, incluidos inactivos.
- Selector de proveedores con búsqueda, navegación por teclado, validación de personas activas con rol Proveedor, consulta por documento y conservación de asociaciones históricas. El backend valida las nuevas asignaciones.
- Ubicaciones colombianas con catálogo oficial DIVIPOLA del DANE: 1.122 registros y 33 agrupaciones departamentales. Personas y el registro rápido de clientes comparten selectores buscables; el backend valida las combinaciones sin consultar Internet durante el uso.
- Punto de venta con cliente por documento, vendedor opcional, carrito, pagos mixtos de contado y crédito con vencimiento e inicial opcional.
- Historial de facturas, filtros locales, detalle histórico, comprobante imprimible, cartera y abonos con comprobación del saldo vigente.
- Analítica en Druid con snapshots históricos de MySQL, reconciliación periódica y manual, consulta de estado y resumen agregado. La sincronización se solicita después del commit transaccional y ejecuta una sola ingesta a la vez.

Los importes transaccionales usan `BigDecimal` con dos decimales; el navegador conserva centavos mediante `BigInt`. MySQL guarda los datos históricos del cliente y los productos. Los abonos bloquean la cabecera de la factura dentro de una transacción para evitar sobrepagos concurrentes.

## Arquitectura y tecnologías

| Capa o servicio | Responsabilidad |
| --- | --- |
| Dominio | Modelos y reglas de productos, personas, facturas y pagos; puertos de persistencia |
| Aplicación | Casos de uso y puertos analíticos, sin dependencias de Spring ni de los motores |
| Adaptadores de entrada | Controladores REST y validación de solicitudes |
| Adaptadores de salida | MongoDB/GridFS, Cassandra, MySQL/JPA, catálogo DIVIPOLA y cliente HTTP de Druid |
| Infraestructura | Configuración Spring, Flyway, eventos después del commit y temporizador de reconciliación |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS y Lucide; proxy `/api` en Vite y Nginx |
| Persistencia de negocio | MongoDB 8.0, Cassandra 4.1.12 y MySQL 8.4 |
| Analítica | Apache Druid 38.0.0, ZooKeeper 3.9.4 y PostgreSQL 17.6 para metadatos internos |

Una petición REST llega al caso de uso, que aplica las reglas y consulta sus puertos. Los adaptadores resuelven la persistencia. No hay transacciones distribuidas entre motores. Flyway administra las tablas de facturación y Hibernate valida su esquema; Cassandra usa el inicializador idempotente de `infrastructure/cassandra/`.

```text
backend/
  src/main/java/com/sttiv/facturacion/
    domain/                 Modelos, excepciones y puertos
    application/            Casos de uso, comandos y contratos analíticos
    infrastructure/         REST, adaptadores y configuración
  src/main/resources/       Configuración, migraciones MySQL y DIVIPOLA
  src/test/                 Pruebas de dominio, aplicación, HTTP y persistencia
frontend/
  src/components/           Componentes, formularios y selectores
  src/pages/                Pantallas de Nexo
  src/styles/               Tokens, layout, componentes y responsive
  src/data/                 Copia local de DIVIPOLA
  public/                   Fuentes y fotografías con sus créditos
  tests/                    Pruebas Playwright
infrastructure/             Esquema Cassandra y configuración Druid
scripts/                    Verificaciones Docker y mantenimiento DIVIPOLA
docs/                       Informes técnicos y capturas de Nexo
docker-compose.yml          Servicios, salud, red privada y volúmenes
.env.example                Variables de ejemplo sin secretos reales
```

## Nexo Design System

Nexo Design System es el sistema visual propio de la aplicación. Conserva el naranja `#F58136`, Urbanist, glassmorphism, transparencias, desenfoques, sidebar compacto, header flotante, dashboard, paneles laterales y tablas. Incluye temas claro y oscuro, preferencias persistentes, foco visible, movimiento reducido y adaptación a escritorio, tablet y móvil.

Los buscadores de Facturas y Créditos mantienen su distribución horizontal. Las etiquetas de filtros permanecen encima de sus campos y los controles se alinean por el borde inferior de cada fila.

Las fotografías conservan su procedencia y licencia Unsplash en [CREDITOS.md](frontend/public/media/CREDITOS.md). Urbanist conserva el aviso de sus autores y la [licencia SIL OFL 1.1](frontend/public/fonts/OFL-Urbanist.txt). La denominación del sistema visual no cambia la autoría de esos recursos.

Medidas, capturas y evolución: [Identidad visual de Nexo](docs/FASE6A-IDENTIDAD-VISUAL-NEXO.md).

## Ejecución con Docker Compose

Requiere Docker Desktop con contenedores Linux y Compose v2 o superior. Docker construye Java con JDK 21 y el frontend con Node.js 24; no hace falta instalarlos en el host para ese arranque.

Desde la raíz, crea `.env` solo si no existe:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Antes del primer arranque, sustituye las contraseñas de ejemplo. Si ya hay volúmenes inicializados, conserva las credenciales existentes: editar `.env` no cambia las contraseñas guardadas en las bases. `.env` permanece excluido de Git.

```powershell
docker compose config --quiet
docker compose build facturacion-backend facturacion-frontend
docker compose up -d --no-build --wait --wait-timeout 600
docker compose ps
Invoke-RestMethod http://localhost:8080/api/health
```

El backend espera las bases y el inicializador Cassandra. Los tres motores de negocio permanecen dentro de la red Docker; sus puertos no se publican en Windows. Los volúmenes nombrados conservan datos entre actualizaciones.

Para arrancar el proyecto, usa `docker compose up` con las opciones anteriores. Al iniciar todo el grupo desde Docker Desktop, los contenedores pueden arrancar al mismo tiempo sin esperar las dependencias; Cassandra puede tardar más que el backend. El backend reintenta hasta cinco veces si termina con error para recuperarse de ese arranque simultáneo.

Para actualizar exclusivamente el frontend con el resto de servicios ya iniciado:

```powershell
docker compose up -d --build --no-deps facturacion-frontend
```

Para actualizar solo el backend:

```powershell
docker compose build facturacion-backend
docker compose up -d --no-deps --no-build --wait --wait-timeout 180 facturacion-backend
```

Para detener servicios conservando sus volúmenes:

```powershell
docker compose --profile analytics stop
```

No uses `docker compose down -v` sobre datos que deban conservarse.

## Apache Druid y perfil analytics

La integración está implementada y es opcional. Nexo permite facturar con Druid detenido. `DRUID_ENABLED=false` es el valor inicial; para activarlo, configura `DRUID_ENABLED=true` y una `DRUID_METADATA_PASSWORD` local en `.env` siguiendo `.env.example`.

```powershell
# Inicia analytics y sus dependencias.
docker compose --profile analytics up -d --wait --wait-timeout 600 druid-router
# Aplica DRUID_ENABLED al backend; no recrea bases de negocio.
docker compose up -d --no-deps --no-build --wait --wait-timeout 180 facturacion-backend
docker compose --profile analytics ps
Invoke-RestMethod http://localhost:8888/status/health
Invoke-RestMethod http://localhost:8080/api/analitica/estado
Invoke-RestMethod http://localhost:8080/api/analitica/resumen
```

`DRUID_BASE_URL=http://druid-router:8888` conecta Spring con el Router dentro de Docker. `DRUID_SYNC_INTERVAL=PT1M` configura la reconciliación. PostgreSQL se dedica a metadatos internos; no sustituye MySQL como fuente de facturación. Conserva su contraseña una vez inicializado su volumen.

Los datasources son `nexo_facturas`, `nexo_factura_detalles` y `nexo_pagos`. El backend prepara snapshots consistentes de MySQL y los reemplaza secuencialmente con SQL MSQ. Cada ingesta usa un controlador y un worker (`maxNumTasks=2`). Los importes se convierten a centavos `int64` exactos; una cantidad fuera de rango provoca un error analítico sin cambiar la factura de negocio.

`GET /api/analitica/resumen` consulta Druid; no devuelve un resumen alternativo de MySQL si Druid falla. `GET /api/analitica/estado` muestra el estado de sincronización. `POST /api/analitica/sincronizar` solicita una reconciliación manual y modifica la ingesta; ejecútalo solo cuando corresponda. Estos endpoints administrativos carecen de autenticación y están destinados al entorno local.

Detalles, límites de memoria y verificaciones: [infraestructura Druid](docs/FASE7A-DRUID-INFRAESTRUCTURA.md), [ingesta y consultas](docs/FASE7B-DRUID-INGESTA.md) y [SQL de verificación](infrastructure/druid/verificacion-fase7b.sql).

## URLs principales

| Dirección predeterminada | Uso |
| --- | --- |
| `http://localhost:5173` | Dashboard de Nexo |
| `http://localhost:5173/productos` | Catálogo y proveedores |
| `http://localhost:5173/personas` | Personas, roles y ubicaciones |
| `http://localhost:5173/ventas/nueva` | Punto de venta |
| `http://localhost:5173/facturas` | Historial; `/facturas/{id}` abre el detalle |
| `http://localhost:5173/creditos` | Créditos y pagos |
| `http://localhost:5173/apariencia` | Preferencias visuales |
| `http://localhost:8080/api/health` | Salud del backend |
| `http://localhost:8888` | Consola Druid, con analytics iniciado |

`FRONTEND_PORT`, `BACKEND_PORT` y `DRUID_PORT` permiten cambiar los puertos locales. Se conservan los enlaces hash de las versiones anteriores. La interfaz envía las peticiones de negocio al proxy `/api`.

## Desarrollo y pruebas

Para desarrollar el frontend con Node.js 24 y el backend iniciado:

```powershell
cd frontend
npm ci
npm run dev
```

Vite usa `http://localhost:8080` como destino del proxy; `API_PROXY_TARGET` permite ajustarlo. `npm run build` compila TypeScript y genera la producción en `frontend/dist/`.

Pruebas Java con JDK 21 o superior, desde la raíz:

```powershell
.\backend\mvnw.cmd -f backend/pom.xml --batch-mode --no-transfer-progress verify
```

La suite ordinaria usa repositorios dobles, servidores HTTP locales de prueba y H2. Las cinco pruebas contra MySQL real se omiten si no se habilita `app.mysql.integration`. Los informes quedan en `backend/target/surefire-reports/`.

Verificación DIVIPOLA sin conexión, desde la raíz:

```powershell
node scripts/update-divipola.mjs --check
node --test scripts/divipola.test.mjs
```

Para renovar el catálogo desde la fuente oficial, ejecuta `node scripts/update-divipola.mjs --update`, revisa el diff y reconstruye frontend y backend juntos. El uso normal de los selectores no necesita Internet. Fuente, versión y validaciones: [DIVIPOLA](docs/FASE7C-UBICACIONES-DIVIPOLA.md).

Pruebas de interfaz con Chrome instalado y Nexo en ejecución, desde `frontend/`:

```powershell
npm run build
$env:UI_BASE_URL = 'http://127.0.0.1:5173'
$env:UI_MUTATION_TESTS = '0'
$env:PROVIDER_READ_ONLY_TESTS = '1'
npm run test:e2e
```

Playwright cubre escritorio, tablet y móvil. Ventas, proveedores y ubicaciones usan contratos HTTP simulados para sus escrituras. Las suites de interfaz y rediseño bloquean escrituras reales; la prueba de proveedores reales solo consulta datos. Las pruebas de altas/ediciones reales de `records.spec.ts` requieren `UI_MUTATION_TESTS=1` y permanecen omitidas por defecto.

`npm run test:integration` y los scripts Docker de negocio realizan escrituras y algunos reinician servicios. Aunque varios aíslan y limpian sus registros ficticios, deben revisarse antes de ejecutarse sobre datos existentes. `scripts/Test-DruidIngesta.mjs` crea facturas de prueba persistentes y cambia el estado de analytics; no forma parte de una revisión de solo lectura.

## Informes técnicos

- [Fase 4: personas y Cassandra](docs/FASE4-VERIFICACION.md).
- [Fase 5: facturación y MySQL](docs/FASE5-VERIFICACION.md).
- [Fase 6A: frontend inicial](docs/FASE6A-FRONTEND.md) e [identidad visual](docs/FASE6A-IDENTIDAD-VISUAL-NEXO.md).
- [Fase 6B: contratos](docs/FASE6B-AUDITORIA.md) y [verificación de ventas, créditos y pagos](docs/FASE6B-VERIFICACION.md).
- [Fase 7A: infraestructura Druid](docs/FASE7A-DRUID-INFRAESTRUCTURA.md) y [Fase 7B: ingesta](docs/FASE7B-DRUID-INGESTA.md).
- [Fase 7C: ubicaciones DIVIPOLA](docs/FASE7C-UBICACIONES-DIVIPOLA.md).
- [Fase 7D: selector de proveedores](docs/FASE7D-SELECTOR-PROVEEDORES.md) y [corrección del combobox](docs/FASE7D-CORRECCION-COMBOBOX.md).

Los informes de fases anteriores conservan sus resultados históricos. El README describe las funciones disponibles actualmente. La [revisión de consolidación](docs/CONSOLIDACION-NEXO.md) registra las pruebas finales, las omisiones y la auditoría del contenido preparado para Git.

## Límites académicos

Nexo no incluye autenticación, autorización, inventario, facturación electrónica DIAN, devoluciones ni anulación de facturas. Los impuestos son cero. Los endpoints administrativos y las consolas deben permanecer en localhost.

El historial de facturas no tiene paginación; la consulta de personas por rol puede ser parcial. No hay transacciones distribuidas entre los motores. Una referencia de pago es informativa y no garantiza idempotencia: ante una respuesta incierta hay que consultar la factura y sus pagos antes de repetir una operación.

La analítica usa snapshots locales y almacenamiento Druid de un solo nodo; no ofrece alta disponibilidad ni actualización instantánea. Un fallo analítico no revierte una factura confirmada en MySQL. Las consultas, importes y tareas de sincronización tienen límites configurables documentados en el informe 7B.
