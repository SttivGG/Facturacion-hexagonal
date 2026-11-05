package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import com.sttiv.facturacion.domain.model.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "facturas")
public class FacturaJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(nullable = false, unique = true, length = 50) String numeroFactura;
    @Column(nullable = false, length = 36) String clienteId;
    @Column(length = 36) String vendedorId;
    @Column(nullable = false, columnDefinition = "LONGTEXT") String clienteNombre;
    @Column(nullable = false, columnDefinition = "LONGTEXT") String clienteDocumento;
    @Column(nullable = false) Instant fechaEmision;
    LocalDate fechaVencimiento;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) ModalidadVenta modalidad;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal subtotal;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal impuestos;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal total;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal totalPagado;
    @Column(nullable = false, precision = 50, scale = 2) BigDecimal saldoPendiente;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) EstadoFactura estado;
    @OneToMany(mappedBy = "factura", cascade = CascadeType.ALL) @OrderBy("id ASC")
    List<DetalleFacturaJpaEntity> detalles = new ArrayList<>();
    @OneToMany(mappedBy = "factura", cascade = CascadeType.ALL) @OrderBy("id ASC")
    List<PagoJpaEntity> pagos = new ArrayList<>();
    protected FacturaJpaEntity() { }
}
