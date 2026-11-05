package com.sttiv.facturacion.application;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.domain.model.*;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import static com.sttiv.facturacion.FacturasFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

class HechosFacturacionTests {
    public static Factura confirmada() {
        var f = factura(cliente());
        var d = f.detalles().getFirst();
        return new Factura(1L, "FAC-1", f.clienteId(), null, "Nombre privado", "Documento privado",
                f.fechaEmision(), f.fechaVencimiento(), f.modalidad(), f.subtotal(), f.impuestos(), f.total(),
                f.totalPagado(), f.saldoPendiente(), f.estado(), List.of(new DetalleFactura(2L, d.productoId(),
                "O'Brien \\ café", d.nombreProducto(), d.cantidad(), d.precioUnitario(), d.subtotal(), d.total())), List.of());
    }
    @Test void snapshotHistoricoSinDatosPersonalesNiRedondeo() {
        var hechos = new HechosFacturacionMapper().transformar(List.of(confirmada()));
        assertEquals(2000050L, hechos.facturas().getFirst().get("total_centavos"));
        assertEquals(1000025L, hechos.detalles().getFirst().get("precio_unitario_centavos"));
        assertEquals("O'Brien \\ café", hechos.detalles().getFirst().get("sku"));
        assertFalse(hechos.toString().contains("Nombre privado"));
        assertFalse(hechos.toString().contains("Documento privado"));
        assertFalse(hechos.toString().contains("observaciones"));
        assertThrows(UnsupportedOperationException.class, () -> hechos.facturas().getFirst().put("estado", "OTRO"));
    }
    @Test void centavosExactosYLimitesSinDouble() {
        assertEquals(Long.MAX_VALUE, HechosFacturacionMapper.centavos(new BigDecimal("92233720368547758.07")));
        assertThrows(IllegalArgumentException.class, () -> HechosFacturacionMapper.centavos(new BigDecimal("92233720368547758.08")));
        assertThrows(IllegalArgumentException.class, () -> HechosFacturacionMapper.centavos(new BigDecimal("0.001")));
        assertThrows(IllegalArgumentException.class, () -> HechosFacturacionMapper.centavos(new BigDecimal("-1")));
    }
    @Test void rechazaIdentidadesDuplicadasYDatosSinConfirmar() {
        var f = confirmada();
        assertThrows(IllegalStateException.class, () -> new HechosFacturacionMapper().transformar(List.of(f, f)));
        assertThrows(IllegalStateException.class, () -> new HechosFacturacionMapper().transformar(List.of(factura(cliente()))));
        assertTrue(new HechosFacturacionMapper().transformar(List.of()).facturas().isEmpty());
    }
}
