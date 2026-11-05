package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.domain.model.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public record FacturaResponse(Long id, String numeroFactura, UUID clienteId, UUID vendedorId,
        String clienteNombre, String clienteDocumento, Instant fechaEmision, LocalDate fechaVencimiento,
        ModalidadVenta modalidad, BigDecimal subtotal, BigDecimal impuestos, BigDecimal total,
        BigDecimal totalPagado, BigDecimal saldoPendiente, EstadoFactura estado,
        List<DetalleResponse> detalles, List<PagoResponse> pagos) {
    public record DetalleResponse(Long id, String productoId, String sku, String nombreProducto,
            int cantidad, BigDecimal precioUnitario, BigDecimal subtotal, BigDecimal total) { }
    public record PagoResponse(Long id, Long facturaId, Instant fechaPago, BigDecimal monto,
            MetodoPago metodoPago, String referencia, String observaciones) { }
    public static FacturaResponse desde(Factura f) {
        return new FacturaResponse(f.id(), f.numeroFactura(), f.clienteId(), f.vendedorId(), f.clienteNombre(),
                f.clienteDocumento(), f.fechaEmision(), f.fechaVencimiento(), f.modalidad(), f.subtotal(), f.impuestos(),
                f.total(), f.totalPagado(), f.saldoPendiente(), f.estado(),
                f.detalles().stream().map(d -> new DetalleResponse(d.id(), d.productoId(), d.sku(), d.nombreProducto(),
                        d.cantidad(), d.precioUnitario(), d.subtotal(), d.total())).toList(),
                f.pagos().stream().map(p -> new PagoResponse(p.id(), p.facturaId(), p.fechaPago(), p.monto(),
                        p.metodoPago(), p.referencia(), p.observaciones())).toList());
    }
}
