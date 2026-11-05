package com.sttiv.facturacion.application.analytics;

import java.time.Instant;
import java.util.Map;

public record EstadoSincronizacion(boolean habilitado, boolean disponible, boolean enEjecucion,
        boolean pendiente, String ultimoResultado, Instant ultimaSincronizacionExitosa,
        String ultimoError, Map<String, Long> registrosVerificados) { }
