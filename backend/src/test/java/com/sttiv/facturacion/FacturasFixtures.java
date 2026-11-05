package com.sttiv.facturacion;

import com.sttiv.facturacion.application.command.*;
import com.sttiv.facturacion.domain.model.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class FacturasFixtures {
    public static final Instant AHORA = Instant.parse("2026-11-04T15:00:00Z");
    public static final Clock CLOCK = Clock.fixed(AHORA, ZoneOffset.UTC);
    private FacturasFixtures() { }
    public static Persona cliente() { return persona(UUID.randomUUID(), true, Set.of(RolPersona.CLIENTE)); }
    public static Persona persona(UUID id, boolean activo, Set<RolPersona> roles) {
        return new Persona(id, "FASE5_TEST", UUID.randomUUID().toString(), "Cliente ficticio", "Prueba",
                null, null, null, null, null, null, null, null, null, roles, activo, AHORA, AHORA);
    }
    public static Producto producto(String id, String precio, boolean activo) {
        return new Producto(id, "FASE5-" + id, "Producto ficticio", null, null, BigDecimal.ZERO,
                new BigDecimal(precio), null, activo, null, AHORA, AHORA);
    }
    public static PagoCommand pago(String monto) { return new PagoCommand(MetodoPago.NEQUI, new BigDecimal(monto), "TEST", null); }
    public static FacturaCommand credito(UUID cliente, String producto, PagoCommand... pagos) {
        return new FacturaCommand(cliente, null, ModalidadVenta.CREDITO, LocalDate.of(2099, 12, 15),
                List.of(new FacturaCommand.Linea(producto, 2)), List.of(pagos));
    }
    public static Factura factura(Persona cliente) {
        return Factura.emitir(cliente, null, ModalidadVenta.CREDITO, LocalDate.of(2099, 12, 15), AHORA,
                List.of(DetalleFactura.desde(producto(UUID.randomUUID().toString(), "10000.25", true), 2)), List.of());
    }
}
