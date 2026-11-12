package com.sttiv.facturacion.application.prediction;

public class PrediccionException extends RuntimeException {
    public enum Codigo { DESHABILITADO, DEMO_DESHABILITADA, SERVICIO_NO_DISPONIBLE, DATOS_INSUFICIENTES, DATOS_INVALIDOS,
        MODELO_NO_ENTRENADO, ENTRENAMIENTO_EN_CURSO, HORIZONTE_INVALIDO }
    private final Codigo codigo;
    public PrediccionException(Codigo codigo, String message) { super(message); this.codigo = codigo; }
    public Codigo codigo() { return codigo; }
}
