package com.sttiv.facturacion.infrastructure.adapter.output.druid;

import com.sttiv.facturacion.application.analytics.*;
import java.util.*;
import java.util.function.Function;

enum DruidDataset {
    FACTURAS("nexo_facturas", "factura_id", HechosAnaliticos::facturas,
            "timestamp factura_id:L numero_factura cliente_id modalidad estado fecha_vencimiento subtotal_centavos:L impuestos_centavos:L total_centavos:L total_pagado_centavos:L saldo_pendiente_centavos:L"),
    DETALLES("nexo_factura_detalles", "detalle_id", HechosAnaliticos::detalles,
            "timestamp detalle_id:L factura_id:L producto_id sku nombre_producto cantidad:L precio_unitario_centavos:L subtotal_centavos:L total_centavos:L"),
    PAGOS("nexo_pagos", "pago_id", HechosAnaliticos::pagos,
            "timestamp pago_id:L factura_id:L numero_factura metodo_pago monto_centavos:L referencia");

    final String tabla, id;
    final Function<HechosAnaliticos, List<Map<String, Object>>> extraer;
    final LinkedHashMap<String, String> columnas = new LinkedHashMap<>();
    DruidDataset(String tabla, String id, Function<HechosAnaliticos, List<Map<String, Object>>> extraer, String esquema) {
        this.tabla = tabla; this.id = id; this.extraer = extraer;
        for (String campo : esquema.split(" ")) columnas.put(campo.replace(":L", ""), campo.endsWith(":L") ? "long" : "string");
    }
    List<String> sumables() {
        return columnas.keySet().stream().filter(c -> c.endsWith("_centavos") || c.equals("cantidad")).toList();
    }
    Map<String, Long> esperado(List<Map<String, Object>> filas) {
        var esperado = new LinkedHashMap<String, Long>();
        esperado.put("registros", (long) filas.size()); esperado.put("identidades", (long) filas.size());
        for (String c : sumables()) {
            long suma = 0;
            try { for (var fila : filas) suma = Math.addExact(suma, (Long) fila.get(c)); }
            catch (ArithmeticException ex) { throw new AnalyticsException("Suma " + tabla + "." + c + " excede int64; se conserva Druid"); }
            esperado.put(c, suma);
        }
        return esperado;
    }
    String verificacionSql() {
        var sql = new StringBuilder("SELECT COUNT(*) AS registros, COUNT(DISTINCT \"").append(id).append("\") AS identidades");
        for (String c : sumables()) sql.append(", COALESCE(SUM(\"").append(c).append("\"), 0) AS \"").append(c).append("\"");
        return sql.append(" FROM \"").append(tabla).append("\"").toString();
    }
}
