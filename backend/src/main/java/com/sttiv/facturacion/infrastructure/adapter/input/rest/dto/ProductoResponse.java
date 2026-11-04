package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.domain.model.Producto;
import java.math.BigDecimal;
import java.time.Instant;

public record ProductoResponse(String id, String sku, String nombre, String descripcion,
        String categoria, BigDecimal costo, BigDecimal precioVenta, String moneda, String proveedorId,
        boolean activo, String imagenId, Instant fechaCreacion, Instant fechaActualizacion) {
    public static ProductoResponse desde(Producto p) {
        return new ProductoResponse(p.id(), p.sku(), p.nombre(), p.descripcion(), p.categoria(),
                p.costo(), p.precioVenta(), "COP", p.proveedorId(), p.activo(), p.imagenId(),
                p.fechaCreacion(), p.fechaActualizacion());
    }
}
