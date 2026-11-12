package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.port.PrediccionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import static com.sttiv.facturacion.application.prediction.PrediccionException.Codigo.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class PrediccionService implements PrediccionUseCase {
    private final boolean enabled;
    private final HistorialVentasPort historial;
    private final PrediccionPort predictor;
    private final Clock clock;
    private final AtomicBoolean entrenando = new AtomicBoolean();
    public PrediccionService(boolean enabled, HistorialVentasPort historial, PrediccionPort predictor, Clock clock) {
        this.enabled = enabled; this.historial = historial; this.predictor = predictor; this.clock = clock;
    }
    @Override public Prediccion.Estado estado() {
        if (!enabled) return new Prediccion.Estado(false, false, false, false, "DESHABILITADO", null, null, "El módulo ML está deshabilitado");
        try { return predictor.estado(); }
        catch (PrediccionException ex) {
            return new Prediccion.Estado(true, false, false, entrenando.get(), "SERVICIO_NO_DISPONIBLE", null, null, ex.getMessage());
        }
    }
    private void habilitado() {
        if (!enabled) throw new PrediccionException(DESHABILITADO, "El módulo ML está deshabilitado");
    }
    @Override public Prediccion.Modelo entrenar() {
        habilitado();
        if (!entrenando.compareAndSet(false, true)) throw new PrediccionException(ENTRENAMIENTO_EN_CURSO, "Ya hay un entrenamiento en curso");
        try {
            LocalDate hasta = LocalDate.now(clock.withZone(ZoneId.of("America/Bogota")));
            var rows = historial.consultar(hasta.minusDays(1095), hasta);
            if (rows.isEmpty()) throw new PrediccionException(DATOS_INSUFICIENTES, "No hay facturación histórica completa; se necesitan al menos 56 días");
            var amounts = new TreeMap<LocalDate, String>();
            for (var row : rows) {
                if (row.fecha().isBefore(hasta.minusDays(1095)) || !row.fecha().isBefore(hasta))
                    throw new PrediccionException(DATOS_INVALIDOS, "Fecha histórica fuera del período permitido");
                var value = new BigDecimal(row.total()).setScale(2);
                if (value.signum() < 0 || value.compareTo(new BigDecimal("1000000000000.00")) > 0)
                    throw new PrediccionException(DATOS_INVALIDOS, "El total diario debe estar entre 0 y 10^12 COP para ML");
                if (amounts.put(row.fecha(), value.toPlainString()) != null)
                    throw new PrediccionException(DATOS_INVALIDOS, "El historial contiene fechas duplicadas");
            }
            var complete = new ArrayList<Prediccion.Dia>();
            for (var day = amounts.firstKey(); day.isBefore(hasta); day = day.plusDays(1))
                complete.add(new Prediccion.Dia(day, amounts.getOrDefault(day, "0.00")));
            if (complete.size() < 56) throw new PrediccionException(DATOS_INSUFICIENTES, "Se necesitan al menos 56 días completos desde la primera factura");
            return predictor.entrenar(new Prediccion.Entrenamiento(List.copyOf(complete)));
        } finally { entrenando.set(false); }
    }
    @Override public Prediccion.Ventas ventas(int horizonte) {
        if (horizonte != 7 && horizonte != 14) throw new PrediccionException(HORIZONTE_INVALIDO, "El horizonte debe ser 7 o 14 días");
        habilitado();
        return predictor.ventas(horizonte);
    }
}
