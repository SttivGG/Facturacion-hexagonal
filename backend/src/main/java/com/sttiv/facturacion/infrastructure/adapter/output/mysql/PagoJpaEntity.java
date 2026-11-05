package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import com.sttiv.facturacion.domain.model.MetodoPago;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "pagos")
public class PagoJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "factura_id", nullable = false)
    FacturaJpaEntity factura;
    @Column(nullable = false) Instant fechaPago;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal monto;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) MetodoPago metodoPago;
    @Column(length = 255) String referencia;
    @Column(length = 2000) String observaciones;
    protected PagoJpaEntity() { }
}
