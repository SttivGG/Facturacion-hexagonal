package com.sttiv.facturacion.application.analytics;

import java.util.Map;

public interface AnalyticsIngestionPort {
    /** Retorna únicamente conteos comprobados mediante consultas posteriores a la publicación. */
    Map<String, Long> enviarSnapshot(HechosAnaliticos snapshot);
}
