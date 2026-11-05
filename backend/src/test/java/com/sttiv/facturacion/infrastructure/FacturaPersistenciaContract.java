package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.domain.exception.ConflictoFacturaException;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.FacturaRepositoryPort;
import com.sttiv.facturacion.infrastructure.adapter.output.mysql.SpringDataFacturaRepository;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static com.sttiv.facturacion.FacturasFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Se ejecuta sin transacción de prueba: cada invocación cruza el proxy real del adaptador. */
abstract class FacturaPersistenciaContract {
    @Autowired FacturaRepositoryPort facturas;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean SpringDataFacturaRepository repositorio;
    final Persona cliente = cliente();

    @AfterEach void limpiarSoloDatosPropios() {
        reset(repositorio);
        String filtro = " IN (SELECT id FROM facturas WHERE cliente_id = ?)";
        jdbc.update("DELETE FROM pagos WHERE factura_id" + filtro, cliente.id().toString());
        jdbc.update("DELETE FROM factura_detalles WHERE factura_id" + filtro, cliente.id().toString());
        jdbc.update("DELETE FROM facturas WHERE cliente_id = ?", cliente.id().toString());
    }
    long filas(String tabla) {
        String sql = tabla.equals("facturas") ? "SELECT COUNT(*) FROM facturas WHERE cliente_id = ?"
                : "SELECT COUNT(*) FROM " + tabla + " WHERE factura_id IN (SELECT id FROM facturas WHERE cliente_id = ?)";
        return jdbc.queryForObject(sql, Long.class, cliente.id().toString());
    }
    @Test void guardaYRecuperaDetalleYPagosIniciales() {
        var base = factura(cliente);
        var inicial = Factura.emitir(cliente, null, ModalidadVenta.CREDITO, base.fechaVencimiento(), AHORA,
                base.detalles(), List.of(pago("5000.10").aPago(AHORA)));
        var creada = facturas.crear(inicial);
        assertEquals("FAC-" + creada.id(), creada.numeroFactura());
        assertNotNull(creada.detalles().getFirst().id()); assertNotNull(creada.pagos().getFirst().id());
        assertEquals(creada.id(), creada.pagos().getFirst().facturaId());
        assertEquals(creada, facturas.buscarPorId(creada.id()).orElseThrow());
        assertEquals(creada, facturas.buscarPorCliente(cliente.id()).getFirst());
    }
    @Test void rollbackDeFacturaDetallesYPagosSiFallaAntesDelCommit() {
        var base = factura(cliente);
        var inicial = Factura.emitir(cliente, null, ModalidadVenta.CREDITO, base.fechaVencimiento(), AHORA,
                base.detalles(), List.of(pago("1.00").aPago(AHORA)));
        AtomicBoolean insertoLasTresTablas = new AtomicBoolean();
        doAnswer(inv -> {
            insertoLasTresTablas.set(filas("facturas") == 1 && filas("factura_detalles") == 1 && filas("pagos") == 1);
            throw new IllegalStateException("Fallo de persistencia simulado antes del commit");
        }).when(repositorio).flush();
        assertThrows(RuntimeException.class, () -> facturas.crear(inicial));
        assertTrue(insertoLasTresTablas.get(), "La falla se inyecta después de las tres inserciones reales");
        assertEquals(0, filas("facturas")); assertEquals(0, filas("factura_detalles")); assertEquals(0, filas("pagos"));
    }
    @Test void restriccionSqlRevierteCabeceraYDetallesYaInsertados() {
        var base = factura(cliente);
        var corrupta = new Factura(null, null, base.clienteId(), null, base.clienteNombre(), base.clienteDocumento(),
                AHORA, base.fechaVencimiento(), base.modalidad(), base.subtotal(), base.impuestos(), base.total(),
                base.totalPagado(), base.saldoPendiente(), base.estado(),
                List.of(base.detalles().getFirst(), base.detalles().getFirst()), List.of());
        assertThrows(RuntimeException.class, () -> facturas.crear(corrupta));
        assertEquals(0, filas("facturas")); assertEquals(0, filas("factura_detalles"));
    }
    @Test void dosAbonosConcurrentesNoSuperanElSaldo() throws Exception {
        var creada = facturas.crear(factura(cliente));
        CountDownLatch listos = new CountDownLatch(2), salida = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> tareas = new ArrayList<>();
            for (int i = 0; i < 2; i++) tareas.add(pool.submit(() -> {
                listos.countDown(); salida.await();
                try { facturas.registrarPago(creada.id(), pago("15000").aPago(AHORA)); return true; }
                catch (ConflictoFacturaException ex) { return false; }
            }));
            assertTrue(listos.await(10, TimeUnit.SECONDS)); salida.countDown();
            int exitos = 0;
            for (var tarea : tareas) if (tarea.get(30, TimeUnit.SECONDS)) exitos++;
            assertEquals(1, exitos);
        } finally { salida.countDown(); }
        var parcial = facturas.buscarPorId(creada.id()).orElseThrow();
        assertEquals(new BigDecimal("5000.50"), parcial.saldoPendiente()); assertEquals(1, parcial.pagos().size());
        assertThrows(ConflictoFacturaException.class, () -> facturas.registrarPago(creada.id(), pago("5000.51").aPago(AHORA)));
        var pagada = facturas.registrarPago(creada.id(), pago("5000.50").aPago(AHORA));
        assertEquals(EstadoFactura.PAGADA, pagada.estado()); assertEquals(2, pagada.pagos().size());
        assertEquals(new BigDecimal("0.00"), pagada.saldoPendiente());
    }
    @Test void numeracionUnicaConCreacionesConcurrentes() throws Exception {
        Set<String> numeros = new HashSet<>();
        try (var pool = Executors.newFixedThreadPool(4)) {
            List<Future<Factura>> tareas = new ArrayList<>();
            for (int i = 0; i < 12; i++) tareas.add(pool.submit(() -> facturas.crear(factura(cliente))));
            for (var tarea : tareas) {
                var f = tarea.get(30, TimeUnit.SECONDS);
                assertEquals("FAC-" + f.id(), f.numeroFactura()); assertTrue(numeros.add(f.numeroFactura()));
            }
        }
        assertEquals(12, numeros.size());
    }
}
