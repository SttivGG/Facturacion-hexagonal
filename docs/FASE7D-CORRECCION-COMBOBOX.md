# Fase 7D — Corrección del selector de proveedores con combobox

`ProviderSelector` usa un combobox buscable con los tokens existentes de Nexo:
Urbanist, superficies de vidrio, radios, sombras, foco y acentos naranja. Los
estilos se limitan al selector; no se modificó el diseño global.

El menú utiliza la capa superior de Popover para evitar recortes por el panel
lateral, conservando su pertenencia al diálogo modal. Se posiciona arriba o
abajo según el espacio disponible y responde al desplazamiento, al cambio de
tamaño y al viewport visual. Las transiciones respetan movimiento reducido.

La entrada mantiene el foco al navegar con flechas, Home y End. Enter selecciona;
Escape, Tab y el clic externo cierran sin cambiar el proveedor. Una búsqueda sin
coincidencias tampoco elimina la selección al pulsar Enter. Los estados ARIA
incluyen combobox, listbox, option, expanded, selected y activedescendant.

Se mantienen las consultas existentes por rol, ID y documento. Solo las personas
activas con rol PROVEEDOR aparecen como nuevas opciones. Las asociaciones
históricas permanecen en el campo principal, incluso si la referencia no está
disponible. El formulario guarda el UUID, o null al elegir «Sin proveedor».
Se conserva el límite de 100 personas y la consulta adicional por documento.
La creación mediante PersonEditor conserva los datos del producto y devuelve
el foco al combobox.

Validación realizada el 5 de noviembre de 2026:

- Compilación TypeScript/Vite y reconstrucción Docker satisfactorias.
- Suite principal: **63 pruebas aprobadas** en escritorio, tablet y móvil.
  Incluye 3 lecturas reales de proveedores desde la API con escrituras bloqueadas.
- Revisión adicional de capturas y gestos táctiles: **5 pruebas aprobadas**;
  el caso táctil se omite en escritorio. Las capturas se toman al terminar las
  animaciones.
- Verificados errores, carga, ausencia de resultados, 100 registros, temas,
  orientación horizontal, UUID, referencias históricas, creación de personas,
  rechazo del backend y reintento de imagen tras un guardado parcial.
- Frontend recreado con `docker compose up -d --no-deps --force-recreate
  facturacion-frontend`, saludable en http://localhost:5173.
- Sin cambios al backend, bases de datos o configuración de infraestructura.
  Sin commits ni push.

Comandos de pruebas (desde `frontend`, PowerShell):

```powershell
$env:PROVIDER_READ_ONLY_TESTS='1'
npx playwright test tests/providers.spec.ts tests/providers-live.spec.ts
npx playwright test tests/providers.spec.ts --grep 'capturas|táctil' --output=test-results/visual --reporter=list
```

Evidencia visual con datos ficticios dentro de ProductEditor:

| Estado | Escritorio | Tablet | Móvil |
| --- | --- | --- | --- |
| Cerrado | [Ver](capturas/fase7d-selector/desktop-cerrado.png) | [Ver](capturas/fase7d-selector/tablet-cerrado.png) | [Ver](capturas/fase7d-selector/mobile-cerrado.png) |
| Desplegado | [Ver](capturas/fase7d-selector/desktop-desplegado.png) | [Ver](capturas/fase7d-selector/tablet-desplegado.png) | [Ver](capturas/fase7d-selector/mobile-desplegado.png) |
| Búsqueda | [Ver](capturas/fase7d-selector/desktop-busqueda.png) | [Ver](capturas/fase7d-selector/tablet-busqueda.png) | [Ver](capturas/fase7d-selector/mobile-busqueda.png) |
| Seleccionado | [Ver](capturas/fase7d-selector/desktop-seleccionado.png) | [Ver](capturas/fase7d-selector/tablet-seleccionado.png) | [Ver](capturas/fase7d-selector/mobile-seleccionado.png) |
| Sin resultados | [Ver](capturas/fase7d-selector/desktop-vacio.png) | [Ver](capturas/fase7d-selector/tablet-vacio.png) | [Ver](capturas/fase7d-selector/mobile-vacio.png) |
| Modo oscuro | [Ver](capturas/fase7d-selector/desktop-oscuro.png) | [Ver](capturas/fase7d-selector/tablet-oscuro.png) | [Ver](capturas/fase7d-selector/mobile-oscuro.png) |
