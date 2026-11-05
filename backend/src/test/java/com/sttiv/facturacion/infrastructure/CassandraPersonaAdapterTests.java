package com.sttiv.facturacion.infrastructure;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.infrastructure.adapter.output.cassandra.CassandraPersonaAdapter;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CassandraPersonaAdapterTests {
    CqlSession session;
    CassandraPersonaAdapter adapter;
    PreparedStatement reserva, insertar, agregar, retirar, porId;
    BoundStatement reservaBound, idBound;
    Persona persona;
    @BeforeEach void preparar() {
        session = mock(CqlSession.class);
        reserva = mock(PreparedStatement.class); insertar = mock(PreparedStatement.class);
        agregar = mock(PreparedStatement.class); retirar = mock(PreparedStatement.class); porId = mock(PreparedStatement.class);
        reservaBound = mock(BoundStatement.class); idBound = mock(BoundStatement.class);
        when(session.prepare(anyString())).thenAnswer(inv -> {
            String cql = inv.getArgument(0);
            if (cql.contains("IF NOT EXISTS")) return reserva;
            if (cql.startsWith("INSERT INTO personas_por_id")) return insertar;
            if (cql.startsWith("INSERT INTO personas_por_rol")) return agregar;
            if (cql.startsWith("DELETE")) return retirar;
            if (cql.startsWith("SELECT *")) return porId;
            return mock(PreparedStatement.class);
        });
        when(insertar.bind(any(Object[].class))).thenReturn(mock(BoundStatement.class));
        when(agregar.bind(anyString(), any(UUID.class))).thenReturn(mock(BoundStatement.class));
        when(retirar.bind(anyString(), any(UUID.class))).thenReturn(mock(BoundStatement.class));
        when(reserva.bind(anyString(), anyString(), any(UUID.class))).thenReturn(reservaBound);
        when(porId.bind(any(UUID.class))).thenReturn(idBound);
        adapter = new CassandraPersonaAdapter(session);
        persona = new Persona(UUID.randomUUID(), "CC", "123", "Ana", null, null, null, null, null,
                null, null, null, null, null, Set.of(RolPersona.CLIENTE, RolPersona.PROVEEDOR),
                true, Instant.now(), Instant.now());
    }
    @Test void reservaDocumentoConLwtAntesDelLote() {
        ResultSet resultado = mock(ResultSet.class);
        when(resultado.wasApplied()).thenReturn(true);
        when(session.execute(reservaBound)).thenReturn(resultado);
        assertThat(adapter.crear(persona)).isEqualTo(persona);
        var orden = inOrder(session);
        orden.verify(session).execute(reservaBound);
        orden.verify(session).execute(any(BatchStatement.class));
        verify(session).prepare(contains("IF NOT EXISTS"));
    }
    @Test void duplicadoNoEscribeOtraPersona() {
        ResultSet resultado = mock(ResultSet.class);
        when(session.execute(reservaBound)).thenReturn(resultado);
        Row indice = mock(Row.class);
        when(resultado.one()).thenReturn(indice);
        when(indice.getUuid("persona_id")).thenReturn(persona.id());
        ResultSet lectura = mock(ResultSet.class);
        when(session.execute(idBound)).thenReturn(lectura);
        Row fila = mock(Row.class);
        when(lectura.one()).thenReturn(fila);
        when(fila.getUuid("id")).thenReturn(persona.id());
        when(fila.getString("tipo_documento")).thenReturn("CC");
        when(fila.getString("numero_documento")).thenReturn("123");
        when(fila.getString("nombres")).thenReturn("Ana");
        when(fila.getInstant("fecha_creacion")).thenReturn(persona.fechaCreacion());
        when(fila.getInstant("fecha_actualizacion")).thenReturn(persona.fechaActualizacion());
        assertThatThrownBy(() -> adapter.crear(persona)).isInstanceOf(DocumentoDuplicadoException.class);
        verify(session, never()).execute(any(BatchStatement.class));
    }
    @Test void reservaSinFilaCanonicaExigeRecuperacion() {
        ResultSet resultado = mock(ResultSet.class); Row fila = mock(Row.class);
        when(resultado.one()).thenReturn(fila); when(fila.getUuid("persona_id")).thenReturn(persona.id());
        when(session.execute(reservaBound)).thenReturn(resultado);
        when(session.execute(idBound)).thenReturn(mock(ResultSet.class));
        assertThatThrownBy(() -> adapter.crear(persona)).isInstanceOf(PersistenciaPersonaException.class)
                .hasMessageContaining("recuperación");
        verify(session, never()).execute(any(BatchStatement.class));
    }
    @Test void loteLoggedSincronizaTodosLosRolesIncluidosLosRetirados() {
        adapter.guardar(persona);
        var captor = ArgumentCaptor.forClass(BatchStatement.class);
        verify(session).execute(captor.capture());
        assertThat(captor.getValue().getBatchType()).isEqualTo(DefaultBatchType.LOGGED);
        assertThat(captor.getValue().size()).isEqualTo(5);
        verify(agregar).bind("CLIENTE", persona.id()); verify(agregar).bind("PROVEEDOR", persona.id());
        verify(retirar).bind("TRABAJADOR", persona.id()); verify(retirar).bind("ADMINISTRADOR", persona.id());
    }
    @Test void timeoutNoLiberaReservaNiOcultaResultadoIncierto() {
        ResultSet resultado = mock(ResultSet.class); when(resultado.wasApplied()).thenReturn(true);
        when(session.execute(reservaBound)).thenReturn(resultado);
        when(session.execute(any(BatchStatement.class))).thenThrow(new RuntimeException("timeout simulado"));
        assertThatThrownBy(() -> adapter.crear(persona)).isInstanceOf(PersistenciaPersonaException.class)
                .hasMessageContaining("consulte");
        verify(session, never()).prepare(startsWith("DELETE FROM id_por_documento"));
    }
}
