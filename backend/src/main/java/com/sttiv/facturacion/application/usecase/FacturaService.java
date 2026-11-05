package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.command.*;
import com.sttiv.facturacion.application.port.FacturaUseCase;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.*;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class FacturaService implements FacturaUseCase {
    private final FacturaRepositoryPort facturas;
    private final PersonaRepositoryPort personas;
    private final ProductoRepositoryPort productos;
    private final Clock clock;

    public FacturaService(FacturaRepositoryPort facturas, PersonaRepositoryPort personas,
            ProductoRepositoryPort productos, Clock clock) {
        this.facturas = facturas;
        this.personas = personas;
        this.productos = productos;
        this.clock = clock;
    }

    @Override public Factura crear(FacturaCommand c) {
        if (c == null || c.clienteId() == null || c.detalles() == null || c.detalles().isEmpty()
                || c.detalles().size() > 1000 || (c.pagosIniciales() != null && c.pagosIniciales().size() > 100)) {
            throw new DatosInvalidosException("Cliente y entre 1 y 1000 detalles son obligatorios; máximo 100 pagos iniciales");
        }
        Persona cliente = validarPersona(c.clienteId(), Set.of(RolPersona.CLIENTE), "cliente");
        if (c.vendedorId() != null) validarPersona(c.vendedorId(),
                Set.of(RolPersona.TRABAJADOR, RolPersona.ADMINISTRADOR), "vendedor");
        Map<String, Integer> cantidades = new LinkedHashMap<>();
        for (var linea : c.detalles()) {
            if (linea == null || linea.productoId() == null || linea.productoId().isBlank()
                    || linea.productoId().length() > 255 || linea.cantidad() == null || linea.cantidad() <= 0) {
                throw new DatosInvalidosException("Cada detalle requiere producto y cantidad entera positiva");
            }
            try { cantidades.merge(linea.productoId().trim(), linea.cantidad(), Math::addExact); }
            catch (ArithmeticException ex) { throw new DatosInvalidosException("La cantidad consolidada supera el máximo entero"); }
        }
        var detalles = new ArrayList<DetalleFactura>();
        cantidades.forEach((id, cantidad) -> {
            Producto producto = productos.buscarPorId(id).orElseThrow(
                    () -> new RecursoNoEncontradoException("Producto no encontrado: " + id));
            if (!producto.activo()) throw new ConflictoFacturaException("Producto inactivo: " + id);
            detalles.add(DetalleFactura.desde(producto, cantidad));
        });
        var ahora = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        var pagos = c.pagosIniciales() == null ? List.<Pago>of() : c.pagosIniciales().stream().map(p -> {
            if (p == null) throw new DatosInvalidosException("Pago inicial inválido");
            return p.aPago(ahora);
        }).toList();
        // Cassandra y MongoDB se consultan antes de entrar al adaptador transaccional MySQL.
        return facturas.crear(Factura.emitir(cliente, c.vendedorId(), c.modalidad(), c.fechaVencimiento(), ahora, detalles, pagos));
    }

    private Persona validarPersona(UUID id, Set<RolPersona> roles, String tipo) {
        Persona persona = personas.buscarPorId(id).orElseThrow(
                () -> new RecursoNoEncontradoException("Persona no encontrada: " + id));
        if (!persona.activo() || Collections.disjoint(persona.roles(), roles)) {
            throw new ConflictoFacturaException("La persona debe estar activa y tener un rol de " + tipo);
        }
        return persona;
    }
    @Override public Factura consultar(Long id) {
        return facturas.buscarPorId(id).orElseThrow(() -> new RecursoNoEncontradoException("Factura no encontrada: " + id));
    }
    @Override public List<Factura> listar() { return facturas.listar(); }
    @Override public List<Factura> buscarPorCliente(UUID id) { return facturas.buscarPorCliente(id); }
    @Override public Factura registrarPago(Long id, PagoCommand c) {
        if (c == null) throw new DatosInvalidosException("El pago es obligatorio");
        return facturas.registrarPago(id, c.aPago(clock.instant().truncatedTo(ChronoUnit.MILLIS)));
    }
}
