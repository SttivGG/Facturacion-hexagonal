package com.sttiv.facturacion.domain.exception;

public class PersistenciaPersonaException extends RuntimeException {
    public PersistenciaPersonaException(String mensaje, Throwable causa) { super(mensaje, causa); }
}
