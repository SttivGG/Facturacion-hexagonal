package com.sttiv.facturacion.application.command;

import java.time.LocalDate;

public record PersonaCommand(String tipoDocumento, String numeroDocumento, String nombres,
        String apellidos, String correo, String telefono, String telefonoAlternativo,
        String direccion, String ciudad, String departamento, String pais,
        LocalDate fechaNacimiento, String observaciones) { }
