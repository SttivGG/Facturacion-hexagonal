package com.sttiv.facturacion.infrastructure.adapter.output.cassandra;

import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import java.util.*;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CassandraPersonaAdapter implements PersonaRepositoryPort {
    private static final Logger LOG = LoggerFactory.getLogger(CassandraPersonaAdapter.class);
    private final CqlSession session;
    private final PreparedStatement porId, porDocumento, porRol, reservar, insertar, agregarRol, retirarRol;

    public CassandraPersonaAdapter(CqlSession session) {
        this.session = session;
        porId = session.prepare("SELECT * FROM personas_por_id WHERE id = ?");
        porDocumento = session.prepare("SELECT persona_id FROM id_por_documento WHERE tipo_documento = ? AND numero_documento = ?");
        porRol = session.prepare("SELECT persona_id FROM personas_por_rol WHERE rol = ? LIMIT ?");
        reservar = session.prepare("INSERT INTO id_por_documento (tipo_documento, numero_documento, persona_id) VALUES (?, ?, ?) IF NOT EXISTS");
        insertar = session.prepare("""
                INSERT INTO personas_por_id (id, tipo_documento, numero_documento, nombres, apellidos,
                    correo, telefono, telefono_alternativo, direccion, ciudad, departamento, pais,
                    fecha_nacimiento, observaciones, roles, activo, fecha_creacion, fecha_actualizacion)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """);
        agregarRol = session.prepare("INSERT INTO personas_por_rol (rol, persona_id) VALUES (?, ?)");
        retirarRol = session.prepare("DELETE FROM personas_por_rol WHERE rol = ? AND persona_id = ?");
    }

    @Override public Persona crear(Persona p) {
        return ejecutar(() -> {
            ResultSet reserva = session.execute(reservar.bind(p.tipoDocumento(), p.numeroDocumento(), p.id()));
            if (!reserva.wasApplied()) {
                Row existente = reserva.one();
                if (existente != null && buscarPorId(existente.getUuid("persona_id")).isEmpty()) {
                    throw new PersistenciaPersonaException("Documento reservado con registro pendiente de recuperación", null);
                }
                throw new DocumentoDuplicadoException();
            }
            // La reserva no se libera ante un timeout: la escritura puede haberse confirmado.
            return guardar(p);
        }, p.id());
    }

    @Override public Persona guardar(Persona p) {
        return ejecutar(() -> {
            var lote = BatchStatement.builder(DefaultBatchType.LOGGED)
                    .addStatement(insertar.bind(PersonaCassandraEntity.valores(p)));
            // Reconciliar los cuatro roles permite repetir la operación sin depender del estado anterior.
            for (RolPersona rol : RolPersona.values()) {
                lote.addStatement((p.roles().contains(rol) ? agregarRol : retirarRol).bind(rol.name(), p.id()));
            }
            session.execute(lote.build());
            return p;
        }, p.id());
    }

    @Override public Optional<Persona> buscarPorId(UUID id) {
        return ejecutar(() -> Optional.ofNullable(session.execute(porId.bind(id)).one())
                .map(PersonaCassandraEntity::aDominio), id);
    }

    @Override public Optional<Persona> buscarPorDocumento(String tipo, String numero) {
        return ejecutar(() -> {
            Row indice = session.execute(porDocumento.bind(tipo, numero)).one();
            if (indice == null) return Optional.empty();
            Optional<Persona> p = buscarPorId(indice.getUuid("persona_id"));
            if (p.isEmpty()) throw new PersistenciaPersonaException("Documento reservado con registro pendiente de recuperación", null);
            return p;
        }, null);
    }

    @Override public List<Persona> buscarPorRol(RolPersona rol, int limite) {
        return ejecutar(() -> {
            List<Persona> resultado = new ArrayList<>();
            for (Row indice : session.execute(porRol.bind(rol.name(), limite))) {
                // La fila canónica evita servir información duplicada o roles retirados durante un lote pendiente.
                buscarPorId(indice.getUuid("persona_id")).filter(p -> p.roles().contains(rol)).ifPresent(resultado::add);
            }
            return List.copyOf(resultado);
        }, null);
    }

    private <T> T ejecutar(Supplier<T> operacion, UUID id) {
        try { return operacion.get(); }
        catch (DocumentoDuplicadoException | PersistenciaPersonaException ex) { throw ex; }
        catch (RuntimeException ex) {
            LOG.error("Fallo Cassandra en operación de personas. ID para recuperación: {}", id, ex);
            throw new PersistenciaPersonaException("No se pudo confirmar la operación en Cassandra; consulte el estado antes de reintentar", ex);
        }
    }
}
