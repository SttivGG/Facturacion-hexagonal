package com.sttiv.facturacion.application.analytics;

import com.sttiv.facturacion.domain.model.Factura;
import java.math.BigDecimal;
import java.util.*;

/** Solo usa los valores históricos que MySQL confirmó. Dinero: centavos signed int64 exactos. */
public final class HechosFacturacionMapper {
    public HechosAnaliticos transformar(List<Factura> origen) {
        Objects.requireNonNull(origen, "La extracción no puede ser null");
        var facturas = new ArrayList<Map<String, Object>>();
        var detalles = new ArrayList<Map<String, Object>>();
        var pagos = new ArrayList<Map<String, Object>>();
        Set<Long> ids = new HashSet<>(), detalleIds = new HashSet<>(), pagoIds = new HashSet<>();
        for (Factura f : origen.stream().sorted(Comparator.comparing(Factura::id)).toList()) {
            identificar(ids, f.id());
            if (f.numeroFactura() == null || !f.numeroFactura().equals("FAC-" + f.id()) || f.detalles().isEmpty()) {
                throw new IllegalStateException("Snapshot financiero inesperado; se conserva analítica anterior");
            }
            if (f.total().compareTo(f.totalPagado().add(f.saldoPendiente())) != 0
                    || f.totalPagado().compareTo(f.pagos().stream().map(p -> p.monto()).reduce(BigDecimal.ZERO, BigDecimal::add)) != 0
                    || f.subtotal().compareTo(f.detalles().stream().map(d -> d.subtotal()).reduce(BigDecimal.ZERO, BigDecimal::add)) != 0) {
                throw new IllegalStateException("Snapshot financiero inconsistente; se conserva analítica anterior");
            }
            facturas.add(fila("timestamp", f.fechaEmision().toString(), "factura_id", f.id(),
                    "numero_factura", f.numeroFactura(), "cliente_id", f.clienteId().toString(),
                    "modalidad", f.modalidad().name(), "estado", f.estado().name(),
                    "fecha_vencimiento", f.fechaVencimiento() == null ? null : f.fechaVencimiento().toString(),
                    "subtotal_centavos", centavos(f.subtotal()), "impuestos_centavos", centavos(f.impuestos()),
                    "total_centavos", centavos(f.total()), "total_pagado_centavos", centavos(f.totalPagado()),
                    "saldo_pendiente_centavos", centavos(f.saldoPendiente())));
            for (var d : f.detalles().stream().sorted(Comparator.comparing(d -> d.id())).toList()) {
                identificar(detalleIds, d.id());
                detalles.add(fila("timestamp", f.fechaEmision().toString(), "detalle_id", d.id(),
                        "factura_id", f.id(), "producto_id", d.productoId(), "sku", d.sku(),
                        "nombre_producto", d.nombreProducto(), "cantidad", (long) d.cantidad(),
                        "precio_unitario_centavos", centavos(d.precioUnitario()),
                        "subtotal_centavos", centavos(d.subtotal()), "total_centavos", centavos(d.total())));
            }
            for (var p : f.pagos().stream().sorted(Comparator.comparing(p -> p.id())).toList()) {
                identificar(pagoIds, p.id());
                if (!f.id().equals(p.facturaId())) throw new IllegalStateException("Pago de otra factura en snapshot");
                pagos.add(fila("timestamp", p.fechaPago().toString(), "pago_id", p.id(), "factura_id", f.id(),
                        "numero_factura", f.numeroFactura(), "metodo_pago", p.metodoPago().name(),
                        "monto_centavos", centavos(p.monto()), "referencia", p.referencia()));
            }
        }
        return new HechosAnaliticos(facturas, detalles, pagos);
    }
    public static long centavos(BigDecimal importe) {
        try {
            long valor = Objects.requireNonNull(importe).movePointRight(2).longValueExact();
            if (valor < 0) throw new ArithmeticException();
            return valor;
        } catch (ArithmeticException ex) {
            throw new IllegalArgumentException("Importe no representable en centavos int64 exactos", ex);
        }
    }
    private static void identificar(Set<Long> ids, Long id) {
        if (id == null || id <= 0 || !ids.add(id)) throw new IllegalStateException("Identidad histórica ausente o duplicada");
    }
    private static Map<String, Object> fila(Object... pares) {
        Map<String, Object> fila = new LinkedHashMap<>();
        for (int i = 0; i < pares.length; i += 2) fila.put((String) pares[i], pares[i + 1]);
        return fila;
    }
}
