# Frontend Nexo · Fase 6A

> Este documento conserva la implementación y la evidencia de la Fase 6A inicial. El diseño vigente, su tema claro y las fotografías se documentan en [Fase 6A.1 · Rediseño Sorvo](FASE6A-REDISENO-SORVO.md).

Implementación original en `frontend/`, inspirada en los paneles de vidrio, fondos y controles de apariencia descritos en la [ficha oficial de Sorvo](https://codeandchill.store/templates/sorvo). El demo público no respondió a la inspección de navegador durante esta sesión. No se incorporaron código, imágenes ni recursos propietarios del template.

## Alcance

- Dashboard: productos totales/activos, clientes consultados, número de facturas, importes facturados, pagos y saldo pendiente. Categorías y últimos productos proceden de la API. Últimos cambios usa las fechas de los registros consultados; no pretende ser un registro de auditoría.
- Productos: consulta, búsqueda local por nombre/SKU/categoría, filtro de estado/categoría, tarjetas o tabla, creación/edición, imágenes reales GridFS y desactivación lógica. La selección de archivo valida MIME y tamaño; Spring Boot sigue validando el contenido.
- Personas: consulta por rol, filtros locales, consulta exacta por documento, creación/edición de todos los campos del contrato, cambio de roles y desactivación. El documento permanece inmutable durante la edición.
- Facturas, Nueva venta y Créditos y pagos: pantallas informativas de próxima Fase 6B. No emiten facturas, no registran pagos ni simulan operaciones.
- Apariencia: claro/oscuro, Aurora/Bosque/Horizonte y desenfoque de 8–32 px. Persistencia local validada; no requiere imágenes, fuentes ni servicios externos.
- Sidebar animado con tooltips nativos al contraerlo, panel móvil deslizable, buscador de secciones con Ctrl/Cmd+K y rutas hash compatibles con atrás/adelante.

El catálogo de negocio comienza vacío cuando la API no contiene registros. No hay semillas ni datos de demostración en la aplicación.

## Arquitectura

`src/api.ts` centraliza peticiones, errores ProblemDetail y cancelación/timeout. El lector JSON conserva los tokens monetarios como cadenas decimales antes de parsear, para evitar pérdida de precisión con BigDecimal. Los formularios envían importes como cadenas decimales aceptadas por Jackson. El dashboard suma centavos con BigInt solo para presentación; todos los cálculos de venta permanecen en Spring Boot.

`src/types.ts` refleja los contratos actuales. `src/hooks.ts` gestiona consultas cancelables y preferencias. `src/appearance.tsx` aplica el tema sin esperar al primer pintado de React. `src/components/` contiene botones, estados, confirmaciones, diálogos y editores reutilizables; `src/pages/` contiene las pantallas. Los tokens de superficies, tipografía, colores semánticos, radios, sombras y tiempos están centralizados en `src/styles.css`, con Tailwind 4 integrado por el plugin de Vite.

Los formularios usan `<dialog>` nativo para mantener foco, fondo inerte y navegación de teclado. La confirmación de descarte abre otro diálogo por encima y mantiene el panel y sus campos montados. Cerrar paneles y modales incluye una transición de salida. `prefers-reduced-motion` elimina desplazamientos y retardos. Los cambios de apariencia mantienen la opacidad necesaria para leer.

Guardar información e imagen, o información y roles, requiere dos operaciones porque así es el contrato existente. Si la segunda falla, el panel informa del guardado parcial y permite reintentar sobre el mismo ID, sin volver a crear el registro. No se modificaron contratos ni reglas del backend.

## Límites reales de datos

Personas no tiene endpoint de listado global. Cada rol devuelve hasta 100 personas, incluidas inactivas. El dashboard consulta CLIENTE y etiqueta su conteo como «Clientes consultados»; el directorio indica el límite. Las personas sin roles se localizan por tipo/número de documento. No se añade paginación ficticia ni se presenta esa consulta como un censo completo.

Las listas actuales de productos y facturas son completas y sin paginación; los filtros del frontend operan sobre esos registros. Los indicadores de facturación corresponden al historial completo, sin inventar tendencias, comparaciones o porcentajes de crecimiento. Si un origen falla, se muestra como no disponible o se señala la vista parcial.

## Docker y desarrollo

`facturacion-frontend` compila con Node 24 y sirve los recursos con Nginx sin privilegios. Solo publica `127.0.0.1:5173` por defecto. `/api/` se reenvía al backend existente; las bases y sus volúmenes no cambian. `client_max_body_size 4m` admite el multipart de imágenes de hasta 3 MB del contrato. Los fondos CSS y Lucide se empaquetan localmente.

```powershell
docker compose config --quiet
docker compose build facturacion-frontend
docker compose up -d --no-deps --no-build --wait facturacion-frontend
```

En desarrollo, `cd frontend; npm ci; npm run dev`. Para otro backend, configura `$env:API_PROXY_TARGET = 'http://127.0.0.1:PUERTO'` antes de Vite. Para otro puerto de UI en las pruebas, configura `UI_BASE_URL`.

## Verificación reproducible

Requiere Chrome instalado y frontend/backend disponibles. La suite de interfaz consulta las APIs reales y no altera registros:

```powershell
cd frontend
npm ci
npm run build
npm run test:e2e -- interface.spec.ts
```

Playwright comprueba escritorio 1440×1000, tablet 768×1024 y móvil 375×812: KPIs contra API, dimensiones del contenido, ausencia de desbordamiento global, persistencia de tema/fondo/desenfoque, formularios y descarte, roles, validación, navegación, recuperación de fallo de conexión y movimiento reducido. El fallo de conexión se provoca solo en la prueba; la aplicación no tiene un modo de datos simulados.

Las pruebas de escritura requieren una opción explícita y acceso al Docker Compose de este proyecto:

```powershell
$env:UI_MUTATION_TESTS = '1'
npm run test:e2e -- records.spec.ts --project=desktop
Remove-Item Env:UI_MUTATION_TESTS
```

Estas pruebas crean registros temporales con SKU/documentos UUID únicos desde la interfaz, comprueban imagen GridFS, guardado parcial y reintento, precios superiores a la precisión segura de JavaScript, edición, roles, documento inmutable y desactivación. `finally` elimina exclusivamente sus SKU/documentos y las imágenes asociadas de MongoDB/Cassandra, sin reiniciar servicios. No crean facturas ni tocan MySQL. No deben interrumpirse bruscamente durante su ejecución.

Resultados HTML, trazas y capturas: `frontend/playwright-report/` y `frontend/test-results/` (ignorados por Git). No se realizan commits ni push.

### Resultado de esta implementación · 4 de noviembre de 2026

- Compilación de TypeScript/Vite completada y contenedor de producción construido con éxito.
- Servicio `facturacion-frontend` saludable en `http://localhost:5173`, con `/api` conectado a Spring Boot; no se reiniciaron las bases ni el backend.
- **30 pruebas de Playwright aprobadas** en la última ejecución (1,6 minutos): 24 de interfaz y 6 de escrituras reales, repartidas entre escritorio, tablet y móvil.
- Revisión visual de capturas del dashboard, catálogo, personas y apariencia en los dos temas, y del descarte superpuesto en móvil. El diálogo mantiene el formulario abierto debajo y su altura es compacta.
- Verificados el guardado de imágenes, el reintento sin duplicados, los decimales por encima de la precisión segura de JavaScript, la edición/desactivación y los roles. Las pruebas eliminaron exclusivamente sus propios registros e imágenes al terminar.
- La interfaz no contiene datos de demostración. Los registros de negocio siguen siendo los de la API.
