# Consolidación de Nexo

Revisión realizada el 5 de noviembre de 2026 sobre la rama `main`.

## Alcance del commit

Se consolidan los cambios locales posteriores a `f5b9084`: infraestructura y adaptadores Druid, sincronización analítica de facturas, catálogo DIVIPOLA, validación de ubicaciones, corrección del combobox de proveedores y alineación de buscadores y filtros de Facturas y Créditos.

El selector inicial de proveedores ya pertenecía a `f5b9084`. Esta consolidación incorpora sus mejoras posteriores, no presenta su implementación original como nueva.

La limpieza de identidad actualiza README, informes, nombres de pruebas y metadatos de resultados históricos. El informe visual se conserva como [FASE6A-IDENTIDAD-VISUAL-NEXO.md](FASE6A-IDENTIDAD-VISUAL-NEXO.md). Se retiran dos scripts de inspección comercial y dos archivos de evidencia del demo anterior. Se mantienen las capturas propias de Nexo.

El script `frontend/scripts/fetch-design-assets.mjs` permanece porque documenta y obtiene las fotografías de Unsplash y la fuente Urbanist que usa Nexo. No se ejecutó durante esta revisión. Los archivos WebP, la fuente WOFF2 y su licencia no se modificaron. La [procedencia de las fotografías](../frontend/public/media/CREDITOS.md) y la [licencia SIL OFL 1.1 de Urbanist](../frontend/public/fonts/OFL-Urbanist.txt) se conservan.

## Compilación y pruebas

| Verificación | Resultado |
| --- | --- |
| Maven `verify` | 146 casos: 141 aprobados, 5 omitidos; sin fallos ni errores; JAR generado |
| TypeScript y Vite `npm run build` | Correcto |
| Suite completa Playwright | 204 casos: 197 aprobados, 7 omitidos; sin fallos ni pruebas inestables |
| DIVIPOLA `--check` | Dos copias idénticas; 1.122 registros; SHA-256 correcto |
| Pruebas Node de DIVIPOLA | 2 aprobadas |
| Enlaces Markdown locales e imports relativos | Sin destinos inexistentes |
| Referencias textuales y nombres antiguos | Sin coincidencias en archivos candidatos a Git |
| `git diff --check` | Correcto |
| Compose, incluido perfil `analytics` | Configuración válida; 12 contenedores saludables |

La suite Java usa dobles de MongoDB/Cassandra, H2 y servidores HTTP locales de prueba. Las cinco pruebas omitidas requieren habilitar expresamente MySQL real. Maven se ejecutó con Java 22 y el proyecto mantiene `release 21`; no se cambiaron dependencias ni el POM.

Playwright cubrió escritorio (1440 × 1000), tablet (768 × 1024) y móvil (375 × 812), incluidos ambos temas, movimiento reducido, productos, personas, proveedores, ubicaciones, punto de venta, facturas, créditos y abonos. Las escrituras de ventas, proveedores y ubicaciones se resolvieron mediante contratos HTTP simulados. La comprobación de proveedores reales bloqueó las escrituras.

Se omitieron las seis pruebas de creación/edición real de productos y personas mediante `UI_MUTATION_TESTS=0`. La séptima omisión corresponde al caso táctil en el proyecto de escritorio; ese caso sí se ejecutó en tablet y móvil. No se ejecutaron `test:integration`, los scripts de escritura de bases, el ensayo de ingesta Druid ni pruebas de reinicio o eliminación de segmentos.

Comandos principales, desde la raíz salvo indicación:

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress verify
cd ..
node scripts/update-divipola.mjs --check
node --test scripts/divipola.test.mjs
docker compose --profile analytics config --quiet
docker compose --profile analytics ps
cd frontend
npm run build
```

Para conservar las capturas históricas, la suite completa se ejecutó desde `target/revision-final/frontend/`, usando la configuración y las pruebas originales:

```powershell
$env:UI_BASE_URL = 'http://127.0.0.1:5173'
$env:UI_MUTATION_TESTS = '0'
$env:PROVIDER_READ_ONLY_TESTS = '1'
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = '../playwright.json'
node '../../../frontend/node_modules/@playwright/test/cli.js' test --config '../../../frontend/playwright.config.ts' --reporter=list,json --output='../playwright-results'
```

Los informes Surefire permanecen en `backend/target/surefire-reports/`. Los resultados JSON, logs y capturas nuevas de esta revisión quedan en `target/revision-final/`, excluido de Git. Los resultados históricos versionados conservan sus cifras; la limpieza solo actualiza sus etiquetas de identidad.

## Comprobación real de Druid

Se consultaron `/api/analitica/estado`, `/api/analitica/resumen`, la salud del Router y consultas SQL `SELECT`. No se llamó a `/api/analitica/sincronizar` ni se enviaron tareas de ingesta.

Las 4 facturas, 5 detalles y 4 pagos coinciden con la API de negocio. Los identificadores analíticos no están duplicados. El resumen coincide exactamente con los importes de las facturas: 29.950.074 centavos facturados, 19.950.075 pagados y 9.999.999 pendientes. El estado de sincronización informa `SUCCESS`.

Durante la carga de pruebas, una primera consulta del resumen respondió 503 por timeout. La repetición y las consultas SQL posteriores finalizaron correctamente, sin cambiar configuración, servicios ni ingesta. Esta revisión no comprueba recuperación frente a reinicios ni una nueva ingestión completa; sus evidencias históricas permanecen en el [informe 7B](FASE7B-DRUID-INGESTA.md).

## Diseño y datos

La limpieza no añade cambios a componentes, tokens ni reglas CSS. Las modificaciones funcionales y visuales incluidas en el commit ya estaban pendientes al inicio. Se conservan el acento `#F58136`, Urbanist, glassmorphism, fondos, bordes, espaciados y preferencias.

El build limpio se comparó con el frontend Docker existente en 42 combinaciones: siete pantallas, ambos temas y tres tamaños. La retirada de evidencia externa elimina una utilidad Tailwind sin consumidores (`.shadow`) y sus inicializadores internos. Las medidas y estilos calculados de los componentes de Nexo permanecen iguales en las 42 comparaciones; las pruebas visuales también verifican el diseño. No se modificó el frontend en ejecución para realizar esta comparación.

La revisión de candidatos no detectó secretos, valores sensibles del `.env` local ni archivos de bases, volúmenes, certificados privados o dependencias generadas. `.env.example` conserva únicamente valores de ejemplo. `.gitignore` añade exclusiones para claves privadas, logs, cachés y configuración AWS local, sin borrar esos archivos.

Las capturas nuevas pendientes y el comprobante PDF corresponden a las fixtures de pruebas. Las capturas tomadas sobre datos reales durante esta revisión quedan en la carpeta ignorada de resultados. No se incorporan volcados de personas o bases de datos al commit.

Se verificaron los conteos y hashes de lectura de productos, facturas y personas por los cuatro roles. No se realizaron escrituras de negocio, reinicios de contenedores ni cambios de volúmenes. Los servicios conservan los identificadores registrados al inicio.

## Preparación de Git

Al inicio, `main` estaba al día con `origin/main`; se comprobó mediante `git fetch --no-tags origin main`. La preparación conserva la rama y el historial. El staging incluye únicamente fuentes, configuración de ejemplo, infraestructura, documentación y evidencia propia revisada. Los chequeos del diff y del contenido staged preceden al commit local.

La publicación de la rama queda a cargo del usuario. No se ejecuta `git push`.
