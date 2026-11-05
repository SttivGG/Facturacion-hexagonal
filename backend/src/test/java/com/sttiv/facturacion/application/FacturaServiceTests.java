package com.sttiv.facturacion.application;

import com.sttiv.facturacion.*;
import com.sttiv.facturacion.application.command.*;
import com.sttiv.facturacion.application.usecase.FacturaService;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.FacturaRepositoryPort;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.sttiv.facturacion.FacturasFixtures.*;

class FacturaServiceTests {
    final PersonasEnMemoria personas = new PersonasEnMemoria();
    final CatalogoEnMemoria productos = new CatalogoEnMemoria();
    final FacturaRepositoryPort persistencia = mock(FacturaRepositoryPort.class);
    final FacturaService servicio = new FacturaService(persistencia, personas, productos, CLOCK);
    final Persona cliente = cliente();
    final String productoId = UUID.randomUUID().toString();

    @BeforeEach void preparar() {
        personas.guardar(cliente);
        productos.guardar(producto(productoId, "10000.25", true));
        when(persistencia.crear(any())).thenAnswer(inv -> inv.getArgument(0));
    }
    FacturaCommand credito(PagoCommand... pagos) { return FacturasFixtures.credito(cliente.id(), productoId, pagos); }
    FacturaCommand cambiar(ModalidadVenta modalidad, LocalDate vencimiento, List<FacturaCommand.Linea> lineas, List<PagoCommand> pagos) {
        return new FacturaCommand(cliente.id(), null, modalidad, vencimiento, lineas, pagos);
    }
    @Test void creditoSinInicialCalculaImportesExactos() {
        var f = servicio.crear(credito());
        assertEquals(new BigDecimal("20000.50"), f.subtotal());
        assertEquals(f.subtotal(), f.total()); assertEquals(new BigDecimal("0.00"), f.impuestos());
        assertEquals(f.total(), f.saldoPendiente()); assertEquals(EstadoFactura.PENDIENTE, f.estado());
        assertEquals("Cliente ficticio Prueba", f.clienteNombre()); assertNull(f.vendedorId());
    }
    @Test void contadoConDosMetodosSePagaExactamente() {
        var f = servicio.crear(cambiar(ModalidadVenta.CONTADO, null, credito().detalles(), List.of(
                new PagoCommand(MetodoPago.EFECTIVO, new BigDecimal("10000.25"), null, null),
                new PagoCommand(MetodoPago.TRANSFERENCIA, new BigDecimal("10000.25"), "TR-1", null))));
        assertEquals(EstadoFactura.PAGADA, f.estado()); assertEquals(new BigDecimal("0.00"), f.saldoPendiente());
        assertEquals(2, f.pagos().size());
    }
    @Test void contadoRequierePagosExactos() {
        for (var pagos : List.of(List.<PagoCommand>of(), List.of(pago("1")))) {
            assertThrows(DatosInvalidosException.class, () -> servicio.crear(cambiar(ModalidadVenta.CONTADO, null, credito().detalles(), pagos)));
        }
        verify(persistencia, never()).crear(any());
    }
    @Test void creditoConInicialParcial() {
        var f = servicio.crear(credito(pago("5000.10")));
        assertEquals(EstadoFactura.PARCIAL, f.estado()); assertEquals(new BigDecimal("15000.40"), f.saldoPendiente());
    }
    @Test void creditoPuedePagarseDesdeLaCreacion() {
        assertEquals(EstadoFactura.PAGADA, servicio.crear(credito(pago("20000.50"))).estado());
    }
    @Test void abonosPosterioresCompletanCredito() {
        var f = servicio.crear(credito()).registrarPago(pago("0.10").aPago(AHORA));
        assertEquals(new BigDecimal("20000.40"), f.saldoPendiente()); assertEquals(EstadoFactura.PARCIAL, f.estado());
        var pagada = f.registrarPago(pago("20000.40").aPago(AHORA));
        assertEquals(EstadoFactura.PAGADA, pagada.estado()); assertEquals(2, pagada.pagos().size());
        assertThrows(ConflictoFacturaException.class, () -> pagada.registrarPago(pago("1").aPago(AHORA)));
    }
    @Test void rechazaSobrepagosInicialesYPosteriores() {
        assertThrows(ConflictoFacturaException.class, () -> servicio.crear(credito(pago("20000.51"))));
        var f = servicio.crear(credito());
        assertThrows(ConflictoFacturaException.class, () -> f.registrarPago(pago("20000.51").aPago(AHORA)));
    }
    @Test void creditoRequiereVencimientoNoPasado() {
        for (LocalDate fecha : new LocalDate[]{null, LocalDate.of(2026, 11, 3)}) {
            assertThrows(DatosInvalidosException.class, () -> servicio.crear(cambiar(ModalidadVenta.CREDITO, fecha, credito().detalles(), List.of())));
        }
    }
    @Test void consolidaProductosSinVolverAConsultarPrecios() {
        var f = servicio.crear(cambiar(ModalidadVenta.CREDITO, credito().fechaVencimiento(), List.of(
                new FacturaCommand.Linea(productoId, 2), new FacturaCommand.Linea(productoId, 3)), List.of()));
        assertEquals(1, f.detalles().size()); assertEquals(5, f.detalles().getFirst().cantidad());
        assertEquals(new BigDecimal("50001.25"), f.total());
    }
    @Test void rechazaCantidadesNulasNegativasYCero() {
        for (Integer cantidad : new Integer[]{null, 0, -1}) {
            assertThrows(DatosInvalidosException.class, () -> servicio.crear(cambiar(ModalidadVenta.CREDITO,
                    credito().fechaVencimiento(), List.of(new FacturaCommand.Linea(productoId, cantidad)), List.of())));
        }
        verify(persistencia, never()).crear(any());
    }
    @Test void rechazaOverflowAlConsolidar() {
        assertThrows(DatosInvalidosException.class, () -> servicio.crear(cambiar(ModalidadVenta.CREDITO,
                credito().fechaVencimiento(), List.of(new FacturaCommand.Linea(productoId, Integer.MAX_VALUE),
                        new FacturaCommand.Linea(productoId, 1)), List.of())));
    }
    @Test void rechazaProductosAusentesEInactivosAntesDeEscribir() {
        productos.productos.clear();
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.crear(credito()));
        productos.guardar(producto(productoId, "1", false));
        assertThrows(ConflictoFacturaException.class, () -> servicio.crear(credito()));
        verify(persistencia, never()).crear(any());
    }
    @Test void rechazaClientesAusentesInactivosYSinRol() {
        personas.datos.clear();
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.crear(credito()));
        for (var persona : List.of(persona(cliente.id(), false, Set.of(RolPersona.CLIENTE)),
                persona(cliente.id(), true, Set.of(RolPersona.PROVEEDOR)))) {
            personas.guardar(persona);
            assertThrows(ConflictoFacturaException.class, () -> servicio.crear(credito()));
        }
        verify(persistencia, never()).crear(any());
    }
    @Test void vendedorOpcionalValidaExistenciaEstadoYRoles() {
        UUID id = UUID.randomUUID();
        var c = new FacturaCommand(cliente.id(), id, ModalidadVenta.CREDITO, credito().fechaVencimiento(), credito().detalles(), List.of());
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.crear(c));
        personas.guardar(persona(id, true, Set.of(RolPersona.CLIENTE)));
        assertThrows(ConflictoFacturaException.class, () -> servicio.crear(c));
        personas.guardar(persona(id, false, Set.of(RolPersona.TRABAJADOR)));
        assertThrows(ConflictoFacturaException.class, () -> servicio.crear(c));
        for (var rol : List.of(RolPersona.TRABAJADOR, RolPersona.ADMINISTRADOR)) {
            personas.guardar(persona(id, true, Set.of(rol))); assertEquals(id, servicio.crear(c).vendedorId());
        }
    }
    @Test void precioNombreYSkuHistoricosNoCambianConElCatalogo() {
        var f = servicio.crear(credito());
        productos.guardar(producto(productoId, "99999.99", true));
        assertEquals(new BigDecimal("10000.25"), f.detalles().getFirst().precioUnitario());
        assertEquals(new BigDecimal("20000.50"), f.total());
    }
    @Test void sumaProductosDistintosConCentavosSinDouble() {
        productos.guardar(producto("otro", "0.10", true));
        var f = servicio.crear(cambiar(ModalidadVenta.CREDITO, credito().fechaVencimiento(), List.of(
                new FacturaCommand.Linea(productoId, 1), new FacturaCommand.Linea("otro", 3)), List.of()));
        assertEquals(new BigDecimal("10000.55"), f.total());
    }
    @Test void dineroRechazaFraccionesNegativosCeroYMetodoAusente() {
        for (String monto : List.of("0", "-1", "1.001")) {
            assertThrows(DatosInvalidosException.class, () -> servicio.crear(credito(pago(monto))));
        }
        assertThrows(DatosInvalidosException.class, () -> new Pago(null, null, AHORA, BigDecimal.ONE, null, null, null));
    }
    @Test void consultarAusenteYDelegarAbonoAtomico() {
        when(persistencia.buscarPorId(12L)).thenReturn(Optional.empty());
        assertThrows(RecursoNoEncontradoException.class, () -> servicio.consultar(12L));
        servicio.registrarPago(12L, pago("1"));
        verify(persistencia).registrarPago(eq(12L), argThat(p -> p.monto().equals(new BigDecimal("1.00"))));
    }
}
