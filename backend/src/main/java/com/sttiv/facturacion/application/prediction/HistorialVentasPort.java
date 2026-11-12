package com.sttiv.facturacion.application.prediction;

import java.time.LocalDate;
import java.util.List;

public interface HistorialVentasPort {
    /** Días con actividad en [desde, hasta), según America/Bogota. Sin entidades ni pagos. */
    List<Prediccion.Dia> consultar(LocalDate desde, LocalDate hasta);
}
