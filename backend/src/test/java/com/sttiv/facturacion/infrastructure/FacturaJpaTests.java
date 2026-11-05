package com.sttiv.facturacion.infrastructure;

import com.datastax.oss.driver.api.core.CqlSession;
import com.mongodb.client.MongoClient;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.beans.factory.annotation.Autowired;
import com.sttiv.facturacion.infrastructure.analytics.CoordinadorSincronizacion;
import com.sttiv.facturacion.domain.model.FacturacionConfirmada;
import javax.sql.DataSource;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import static com.sttiv.facturacion.FacturasFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
class FacturaJpaTests extends FacturaPersistenciaContract {
    @MockitoBean MongoClient mongoClient;
    @MockitoBean CqlSession cqlSession;
    @MockitoBean PersonaRepositoryPort personas;
    @MockitoSpyBean CoordinadorSincronizacion coordinador;
    @Autowired DataSource dataSource;

    @Test void notificacionAnaliticaSoloDespuesDelCommitFinanciero() throws Exception {
        clearInvocations(coordinador);
        var confirmado = new AtomicBoolean();
        doAnswer(inv -> {
            try (var conexion = dataSource.getConnection(); var sql = conexion.prepareStatement("SELECT COUNT(*) FROM facturas WHERE cliente_id = ?")) {
                sql.setString(1, cliente.id().toString());
                try (var filas = sql.executeQuery()) { filas.next(); confirmado.set(filas.getLong(1) == 1); }
            }
            return inv.callRealMethod();
        }).when(coordinador).cambioConfirmado(any());
        try {
            var f = facturas.crear(factura(cliente));
            assertTrue(confirmado.get(), "Otra conexión ya ve el commit cuando se notifica a analítica");
            facturas.registrarPago(f.id(), pago("1.00").aPago(AHORA));
            verify(coordinador, times(2)).cambioConfirmado(any(FacturacionConfirmada.class));
        } finally { reset(coordinador); }
    }
    @Test void rollbackNoSolicitaSincronizacion() {
        clearInvocations(coordinador);
        doThrow(new IllegalStateException("Fallo antes del commit")).when(repositorio).flush();
        assertThrows(RuntimeException.class, () -> facturas.crear(factura(cliente)));
        verify(coordinador, never()).cambioConfirmado(any());
    }
}
