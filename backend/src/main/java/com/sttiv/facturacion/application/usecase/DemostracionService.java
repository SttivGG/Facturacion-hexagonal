package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.port.DemostracionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import static com.sttiv.facturacion.application.prediction.PrediccionException.Codigo.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** No depende del puerto histórico, repositorios ni credenciales de bases de datos. */
public class DemostracionService implements DemostracionUseCase {
    private final boolean enabled;
    private final DemostracionPort predictor;
    private final AtomicBoolean entrenando = new AtomicBoolean();
    public DemostracionService(boolean enabled, DemostracionPort predictor) { this.enabled = enabled; this.predictor = predictor; }
    @Override public Prediccion.Estado estado() {
        if (!enabled) return new Prediccion.Estado(false, false, false, false, "DEMO_DESHABILITADA", null, null,
                "La demostración está deshabilitada; activa ML_ENABLED y ML_DEMO_ENABLED solo en el entorno académico local");
        try { return predictor.estadoDemo(); }
        catch (PrediccionException ex) {
            return new Prediccion.Estado(true, false, false, entrenando.get(), "SERVICIO_NO_DISPONIBLE", null, null, ex.getMessage());
        }
    }
    private void habilitado() {
        if (!enabled) throw new PrediccionException(DEMO_DESHABILITADA, "La demostración académica está deshabilitada");
    }
    @Override public Prediccion.Modelo entrenar() {
        habilitado();
        if (!entrenando.compareAndSet(false, true)) throw new PrediccionException(ENTRENAMIENTO_EN_CURSO, "Ya hay un entrenamiento de demostración en curso");
        try { return predictor.entrenarDemo(); }
        finally { entrenando.set(false); }
    }
    @Override public Prediccion.Ventas ventas(int horizonte) {
        if (horizonte != 7 && horizonte != 14) throw new PrediccionException(HORIZONTE_INVALIDO, "El horizonte debe ser 7 o 14 días");
        habilitado();
        return predictor.ventasDemo(horizonte);
    }
}
