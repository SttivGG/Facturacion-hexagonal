package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.domain.model.*;
import java.time.*;
import java.util.*;

public record PersonaResponse(UUID id, String tipoDocumento, String numeroDocumento, String nombres,
        String apellidos, String correo, String telefono, String telefonoAlternativo,
        String direccion, String ciudad, String departamento, String pais, LocalDate fechaNacimiento,
        String observaciones, Set<RolPersona> roles, boolean activo, Instant fechaCreacion, Instant fechaActualizacion) {
    public static PersonaResponse desde(Persona p) {
        return new PersonaResponse(p.id(), p.tipoDocumento(), p.numeroDocumento(), p.nombres(), p.apellidos(),
                p.correo(), p.telefono(), p.telefonoAlternativo(), p.direccion(), p.ciudad(), p.departamento(),
                p.pais(), p.fechaNacimiento(), p.observaciones(), p.roles(), p.activo(), p.fechaCreacion(), p.fechaActualizacion());
    }
}
