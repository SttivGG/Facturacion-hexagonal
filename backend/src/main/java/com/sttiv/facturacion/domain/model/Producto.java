package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import java.math.BigDecimal;
import java.time.Instant;

public record Producto(String id, String sku, String nombre, String descripcion, String categoria,
        BigDecimal costo, BigDecimal precioVenta, String proveedorId, boolean activo, String imagenId,
        Instant fechaCreacion, Instant fechaActualizacion) {

    public Producto {
        if (sku == null || sku.isBlank() || nombre == null || nombre.isBlank()) {
            throw new DatosInvalidosException("SKU y nombre son obligatorios");
        }
        sku = sku.trim();
        nombre = nombre.trim();
        validarImporte(costo, "costo");
        validarImporte(precioVenta, "precioVenta");
    }

    private static void validarImporte(BigDecimal importe, String campo) {
        if (importe == null || importe.signum() < 0) {
            throw new DatosInvalidosException(campo + " debe ser mayor o igual a cero");
        }
        // 32 enteros + 2 decimales caben exactamente en Decimal128 (34 dígitos).
        BigDecimal normalizado = importe.stripTrailingZeros();
        if (normalizado.scale() > 2 || normalizado.precision() - normalizado.scale() > 32) {
            throw new DatosInvalidosException(campo + " admite hasta 32 enteros y 2 decimales COP");
        }
    }

    public Producto desactivar(Instant ahora) {
        return new Producto(id, sku, nombre, descripcion, categoria, costo, precioVenta,
                proveedorId, false, imagenId, fechaCreacion, ahora);
    }

    public Producto conImagen(String nuevaImagenId, Instant ahora) {
        return new Producto(id, sku, nombre, descripcion, categoria, costo, precioVenta,
                proveedorId, activo, nuevaImagenId, fechaCreacion, ahora);
    }
}
