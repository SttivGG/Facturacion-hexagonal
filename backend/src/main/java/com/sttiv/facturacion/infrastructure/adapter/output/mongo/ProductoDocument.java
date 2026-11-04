package com.sttiv.facturacion.infrastructure.adapter.output.mongo;

import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;
import com.sttiv.facturacion.domain.model.Producto;

@Document("productos")
public record ProductoDocument(@Id String id, String sku, String nombre, String descripcion,
        String categoria, @Field(targetType = FieldType.DECIMAL128) BigDecimal costo,
        @Field(targetType = FieldType.DECIMAL128) BigDecimal precioVenta, String proveedorId,
        boolean activo, String imagenId, Instant fechaCreacion, Instant fechaActualizacion) {
    public static ProductoDocument desde(Producto p) {
        return new ProductoDocument(p.id(), p.sku(), p.nombre(), p.descripcion(), p.categoria(),
                p.costo(), p.precioVenta(), p.proveedorId(), p.activo(), p.imagenId(),
                p.fechaCreacion(), p.fechaActualizacion());
    }
    public Producto aDominio() {
        return new Producto(id, sku, nombre, descripcion, categoria, costo, precioVenta,
                proveedorId, activo, imagenId, fechaCreacion, fechaActualizacion);
    }
}
