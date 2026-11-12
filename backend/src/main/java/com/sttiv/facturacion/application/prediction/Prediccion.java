package com.sttiv.facturacion.application.prediction;

import java.time.*;
import java.util.List;

/** Contratos propios: importes decimales exactos como texto en los límites del módulo. */
public final class Prediccion {
    private Prediccion() { }
    public record Dia(LocalDate fecha, String total) { }
    public record Entrenamiento(List<Dia> observaciones) { }
    public record Metricas(String mae, String wape, String maeReferencia, String wapeReferencia,
            String mejoraReferencia, int diasEvaluacion, LocalDate finEntrenamientoEvaluacion,
            LocalDate inicioEvaluacion, LocalDate finEvaluacion) { }
    public record Modelo(String version, String algoritmo, String alpha, Instant fechaEntrenamiento,
            LocalDate inicioDatos, LocalDate finDatos, int observaciones, String totalHistorico, Metricas metricas) { }
    public record Estado(boolean habilitado, boolean disponible, boolean entrenado, boolean entrenando,
            String estado, Instant ultimaFechaEntrenamiento, Modelo modelo, String mensaje) { }
    public record Ventas(int horizonte, String estado, List<Dia> predicciones, String totalProyectado,
            String promedioDiario, List<Dia> historico, Modelo modelo) { }
    /** El canal demo siempre explicita su procedencia, sin cambiar el contrato del canal real. */
    public record Demostracion<T>(String modo, boolean datosSimulados, T resultado) {
        public static <T> Demostracion<T> de(T resultado) { return new Demostracion<>("DEMOSTRACION", true, resultado); }
    }
}
