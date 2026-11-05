package com.sttiv.facturacion.application.analytics;

public class AnalyticsException extends RuntimeException {
    public AnalyticsException(String mensaje) { super(mensaje); }
    public AnalyticsException(String mensaje, Throwable causa) { super(mensaje, causa); }
}
