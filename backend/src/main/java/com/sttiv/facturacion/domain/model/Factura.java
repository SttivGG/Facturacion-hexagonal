package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public record Factura(Long id, String numeroFactura, UUID clienteId, UUID vendedorId,
        String clienteNombre, String clienteDocumento, Instant fechaEmision, LocalDate fechaVencimiento,
        ModalidadVenta modalidad, BigDecimal subtotal, BigDecimal impuestos, BigDecimal total,
        BigDecimal totalPagado, BigDecimal saldoPendiente, EstadoFactura estado,
        List<DetalleFactura> detalles, List<Pago> pagos) {
    public Factura {
        detalles = List.copyOf(detalles);
        pagos = List.copyOf(pagos);
    }

    public static Factura emitir(Persona cliente, UUID vendedorId, ModalidadVenta modalidad,
            LocalDate vencimiento, Instant ahora, List<DetalleFactura> detalles, List<Pago> pagos) {
        if (modalidad == null || detalles == null || detalles.isEmpty()) {
            throw new DatosInvalidosException("Modalidad y detalles son obligatorios");
        }
        if (modalidad == ModalidadVenta.CREDITO && vencimiento == null) {
            throw new DatosInvalidosException("La venta a crédito requiere fecha de vencimiento");
        }
        if (vencimiento != null && vencimiento.isBefore(ahora.atZone(ZoneId.of("America/Bogota")).toLocalDate())) {
            throw new DatosInvalidosException("El vencimiento no puede ser anterior a la emisión");
        }
        BigDecimal subtotal = Importe.normalizar(detalles.stream().map(DetalleFactura::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal pagado = Importe.normalizar(pagos.stream().map(Pago::monto).reduce(BigDecimal.ZERO, BigDecimal::add));
        if (pagado.compareTo(subtotal) > 0) throw new ConflictoFacturaException("Los pagos superan el total de la factura");
        if (modalidad == ModalidadVenta.CONTADO && (pagos.isEmpty() || pagado.compareTo(subtotal) != 0)) {
            throw new DatosInvalidosException("La venta de contado requiere pagos que cubran exactamente el total");
        }
        String nombre = cliente.nombres() + (cliente.apellidos() == null || cliente.apellidos().isBlank()
                ? "" : " " + cliente.apellidos());
        return new Factura(null, null, cliente.id(), vendedorId, nombre,
                cliente.tipoDocumento() + " " + cliente.numeroDocumento(), ahora, vencimiento, modalidad,
                subtotal, new BigDecimal("0.00"), subtotal, pagado, subtotal.subtract(pagado),
                estado(subtotal, pagado), detalles, pagos);
    }

    public Factura registrarPago(Pago pago) {
        if (modalidad != ModalidadVenta.CREDITO || estado == EstadoFactura.PAGADA) {
            throw new ConflictoFacturaException("La factura no admite más abonos");
        }
        if (pago.monto().compareTo(saldoPendiente) > 0) {
            throw new ConflictoFacturaException("El pago supera el saldo pendiente");
        }
        BigDecimal pagado = totalPagado.add(pago.monto());
        var nuevos = new ArrayList<>(pagos);
        nuevos.add(pago);
        return new Factura(id, numeroFactura, clienteId, vendedorId, clienteNombre, clienteDocumento,
                fechaEmision, fechaVencimiento, modalidad, subtotal, impuestos, total, pagado,
                total.subtract(pagado), estado(total, pagado), detalles, nuevos);
    }

    private static EstadoFactura estado(BigDecimal total, BigDecimal pagado) {
        return pagado.compareTo(total) == 0 ? EstadoFactura.PAGADA
                : pagado.signum() == 0 ? EstadoFactura.PENDIENTE : EstadoFactura.PARCIAL;
    }
}
