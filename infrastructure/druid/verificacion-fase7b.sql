-- Importes en centavos BIGINT. Mantener facturas, detalles y pagos separados.
-- Fecha de emisión UTC: adaptar los límites al día que se quiera consultar.
SELECT numero_factura, modalidad, estado, total_centavos,
       total_pagado_centavos, saldo_pendiente_centavos
FROM nexo_facturas
WHERE __time >= TIMESTAMP '2026-11-05 00:00:00'
  AND __time < TIMESTAMP '2026-11-06 00:00:00'
ORDER BY __time;

SELECT COUNT(*) AS facturas,
       SUM(total_centavos) AS total_facturado_centavos,
       SUM(total_pagado_centavos) AS total_cobrado_centavos,
       SUM(saldo_pendiente_centavos) AS saldo_pendiente_centavos
FROM nexo_facturas;

SELECT modalidad, COUNT(*) AS facturas, SUM(total_centavos) AS ventas_centavos
FROM nexo_facturas GROUP BY modalidad;

-- SKU/nombre y precio corresponden al momento de la venta, conservado por MySQL.
SELECT producto_id, sku, nombre_producto, SUM(cantidad) AS unidades,
       SUM(total_centavos) AS ventas_centavos
FROM nexo_factura_detalles GROUP BY producto_id, sku, nombre_producto;

SELECT metodo_pago, COUNT(*) AS pagos, SUM(monto_centavos) AS cobrado_centavos
FROM nexo_pagos GROUP BY metodo_pago;

-- Los pagos se agrupan por la fecha del cobro, que puede diferir de la emisión.
SELECT TIME_FLOOR(__time, 'P1D') AS dia_cobro_utc,
       SUM(monto_centavos) AS cobrado_centavos
FROM nexo_pagos GROUP BY TIME_FLOOR(__time, 'P1D');

-- Identidades sin duplicados. Desactivar aproximación en el contexto de consulta:
-- {"useApproximateCountDistinct":false}
SELECT COUNT(*) AS filas, COUNT(DISTINCT factura_id) AS ids FROM nexo_facturas;
SELECT COUNT(*) AS filas, COUNT(DISTINCT detalle_id) AS ids FROM nexo_factura_detalles;
SELECT COUNT(*) AS filas, COUNT(DISTINCT pago_id) AS ids FROM nexo_pagos;

-- Nunca sumar total_centavos de facturas después de unir directamente detalles/pagos:
-- cada relación uno a muchos repetiría ese total.
