package com.sttiv.facturacion.application.analytics;

import java.util.List;

/** Todos los importes son centavos; no se convierten a coma flotante para la API. */
public record ResumenAnalitico(long numeroFacturas, long totalFacturadoCentavos,
        long totalPagadoCentavos, long saldoPendienteCentavos,
        List<VentasModalidad> ventasPorModalidad, List<PagosMetodo> pagosPorMetodo) {
    public record VentasModalidad(String modalidad, long facturas, long totalCentavos) { }
    public record PagosMetodo(String metodoPago, long pagos, long montoCentavos) { }
}
