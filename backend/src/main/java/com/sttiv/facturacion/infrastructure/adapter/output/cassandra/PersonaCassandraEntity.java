package com.sttiv.facturacion.infrastructure.adapter.output.cassandra;

import com.datastax.oss.driver.api.core.cql.Row;
import com.sttiv.facturacion.domain.model.*;
import java.util.Set;
import java.util.stream.Collectors;

/** Traducción del registro CQL; ningún tipo del driver sale de infraestructura. */
final class PersonaCassandraEntity {
    private PersonaCassandraEntity() { }

    static Object[] valores(Persona p) {
        return new Object[]{p.id(), p.tipoDocumento(), p.numeroDocumento(), p.nombres(), p.apellidos(),
                p.correo(), p.telefono(), p.telefonoAlternativo(), p.direccion(), p.ciudad(), p.departamento(),
                p.pais(), p.fechaNacimiento(), p.observaciones(),
                p.roles().stream().map(Enum::name).collect(Collectors.toSet()), p.activo(),
                p.fechaCreacion(), p.fechaActualizacion()};
    }

    static Persona aDominio(Row r) {
        Set<String> roles = r.getSet("roles", String.class);
        return new Persona(r.getUuid("id"), r.getString("tipo_documento"), r.getString("numero_documento"),
                r.getString("nombres"), r.getString("apellidos"), r.getString("correo"), r.getString("telefono"),
                r.getString("telefono_alternativo"), r.getString("direccion"), r.getString("ciudad"),
                r.getString("departamento"), r.getString("pais"), r.getLocalDate("fecha_nacimiento"),
                r.getString("observaciones"), roles == null ? Set.of() : roles.stream()
                    .map(RolPersona::valueOf).collect(Collectors.toSet()),
                r.getBoolean("activo"), r.getInstant("fecha_creacion"), r.getInstant("fecha_actualizacion"));
    }
}
