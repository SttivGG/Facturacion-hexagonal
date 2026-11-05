package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.application.command.PersonaCommand;
import com.sttiv.facturacion.domain.model.RolPersona;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.Set;

public record PersonaRequest(@NotBlank String tipoDocumento, @NotBlank String numeroDocumento,
        @NotBlank String nombres, String apellidos, String correo, String telefono,
        String telefonoAlternativo, String direccion, String ciudad, String departamento,
        String pais, LocalDate fechaNacimiento, String observaciones, Set<@NotNull RolPersona> roles) {
    public PersonaCommand aCommand() {
        return new PersonaCommand(tipoDocumento, numeroDocumento, nombres, apellidos, correo,
                telefono, telefonoAlternativo, direccion, ciudad, departamento, pais, fechaNacimiento, observaciones);
    }
}
