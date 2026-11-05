package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import com.sttiv.facturacion.domain.model.*;
import java.util.UUID;

final class FacturaJpaMapper {
    private FacturaJpaMapper() { }
    static FacturaJpaEntity entidad(Factura f) {
        var e = new FacturaJpaEntity();
        // Valor provisional único y no nulo; se sustituye por FAC-ID antes del commit.
        e.numeroFactura = "TMP-" + UUID.randomUUID();
        e.clienteId = f.clienteId().toString();
        e.vendedorId = f.vendedorId() == null ? null : f.vendedorId().toString();
        e.clienteNombre = f.clienteNombre(); e.clienteDocumento = f.clienteDocumento();
        e.fechaEmision = f.fechaEmision(); e.fechaVencimiento = f.fechaVencimiento();
        e.modalidad = f.modalidad(); e.subtotal = f.subtotal(); e.impuestos = f.impuestos(); e.total = f.total();
        actualizarSaldo(e, f);
        for (var d : f.detalles()) {
            var de = new DetalleFacturaJpaEntity();
            de.factura = e; de.productoId = d.productoId(); de.sku = d.sku(); de.nombreProducto = d.nombreProducto();
            de.cantidad = d.cantidad(); de.precioUnitario = d.precioUnitario(); de.subtotal = d.subtotal(); de.total = d.total();
            e.detalles.add(de);
        }
        f.pagos().forEach(p -> e.pagos.add(pago(e, p)));
        return e;
    }
    static void actualizarSaldo(FacturaJpaEntity e, Factura f) {
        e.totalPagado = f.totalPagado(); e.saldoPendiente = f.saldoPendiente(); e.estado = f.estado();
    }
    static PagoJpaEntity pago(FacturaJpaEntity e, Pago p) {
        var pe = new PagoJpaEntity();
        pe.factura = e; pe.fechaPago = p.fechaPago(); pe.monto = p.monto(); pe.metodoPago = p.metodoPago();
        pe.referencia = p.referencia(); pe.observaciones = p.observaciones();
        return pe;
    }
    static Factura dominio(FacturaJpaEntity e) {
        return new Factura(e.id, e.numeroFactura, UUID.fromString(e.clienteId),
                e.vendedorId == null ? null : UUID.fromString(e.vendedorId), e.clienteNombre, e.clienteDocumento,
                e.fechaEmision, e.fechaVencimiento, e.modalidad, e.subtotal, e.impuestos, e.total,
                e.totalPagado, e.saldoPendiente, e.estado,
                e.detalles.stream().map(d -> new DetalleFactura(d.id, d.productoId, d.sku, d.nombreProducto,
                        d.cantidad, d.precioUnitario, d.subtotal, d.total)).toList(),
                e.pagos.stream().map(p -> new Pago(p.id, e.id, p.fechaPago, p.monto,
                        p.metodoPago, p.referencia, p.observaciones)).toList());
    }
}
