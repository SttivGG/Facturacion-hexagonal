package com.sttiv.facturacion.domain.exception;

public class DocumentoDuplicadoException extends RuntimeException {
    public DocumentoDuplicadoException() { super("Ya existe una persona con ese tipo y número de documento"); }
}
