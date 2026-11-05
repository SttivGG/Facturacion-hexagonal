package com.sttiv.facturacion.application.analytics;

import java.util.*;

/** Snapshot inmutable, sin tipos de Spring, HTTP ni del motor analítico. */
public record HechosAnaliticos(List<Map<String, Object>> facturas,
        List<Map<String, Object>> detalles, List<Map<String, Object>> pagos) {
    public HechosAnaliticos {
        facturas = copiar(facturas); detalles = copiar(detalles); pagos = copiar(pagos);
    }
    private static List<Map<String, Object>> copiar(List<Map<String, Object>> filas) {
        return filas.stream().map(f -> Collections.unmodifiableMap(new LinkedHashMap<>(f))).toList();
    }
}
