package com.sttiv.facturacion.domain.exception;

public class SkuDuplicadoException extends RuntimeException {
    public SkuDuplicadoException(String sku) { super("Ya existe un producto con SKU: " + sku); }
}
