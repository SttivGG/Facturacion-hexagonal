package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "factura_detalles", uniqueConstraints = @UniqueConstraint(
        name = "uk_detalle_producto", columnNames = {"factura_id", "producto_id"}))
public class DetalleFacturaJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "factura_id", nullable = false)
    FacturaJpaEntity factura;
    @Column(nullable = false, length = 255) String productoId;
    @Column(nullable = false, columnDefinition = "LONGTEXT") String sku;
    @Column(nullable = false, columnDefinition = "LONGTEXT") String nombreProducto;
    @Column(nullable = false) int cantidad;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal precioUnitario;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal subtotal;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal total;
    protected DetalleFacturaJpaEntity() { }
}
