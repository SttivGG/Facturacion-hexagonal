package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

public record Persona(UUID id, String tipoDocumento, String numeroDocumento, String nombres,
        String apellidos, String correo, String telefono, String telefonoAlternativo,
        String direccion, String ciudad, String departamento, String pais, LocalDate fechaNacimiento,
        String observaciones, Set<RolPersona> roles, boolean activo,
        Instant fechaCreacion, Instant fechaActualizacion) {
    private static final Pattern CORREO = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public Persona {
        if (id == null || fechaCreacion == null || fechaActualizacion == null) {
            throw new DatosInvalidosException("Identificador y fechas son obligatorios");
        }
        tipoDocumento = documento(tipoDocumento);
        numeroDocumento = documento(numeroDocumento);
        if (nombres == null || nombres.isBlank()) throw new DatosInvalidosException("Los nombres son obligatorios");
        nombres = nombres.trim();
        correo = correo == null || correo.isBlank() ? null : correo.trim();
        if (correo != null && !CORREO.matcher(correo).matches()) {
            throw new DatosInvalidosException("El correo tiene un formato inválido");
        }
        if (roles != null && roles.stream().anyMatch(java.util.Objects::isNull)) throw new DatosInvalidosException("Rol inválido");
        roles = roles == null ? Set.of() : Set.copyOf(roles);
    }

    public static String documento(String valor) {
        if (valor == null || valor.isBlank()) throw new DatosInvalidosException("Tipo y número de documento son obligatorios");
        return valor.trim();
    }

    public Persona conRoles(Set<RolPersona> nuevos, Instant ahora) {
        if (nuevos == null) throw new DatosInvalidosException("El conjunto de roles es obligatorio");
        return new Persona(id, tipoDocumento, numeroDocumento, nombres, apellidos, correo, telefono,
                telefonoAlternativo, direccion, ciudad, departamento, pais, fechaNacimiento,
                observaciones, nuevos, activo, fechaCreacion, ahora);
    }

    public Persona desactivar(Instant ahora) {
        return new Persona(id, tipoDocumento, numeroDocumento, nombres, apellidos, correo, telefono,
                telefonoAlternativo, direccion, ciudad, departamento, pais, fechaNacimiento,
                observaciones, roles, false, fechaCreacion, ahora);
    }
}
