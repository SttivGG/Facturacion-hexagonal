package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.domain.model.RolPersona;
import jakarta.validation.constraints.NotNull;
import java.util.Set;

public record RolesPersonaRequest(@NotNull Set<@NotNull RolPersona> roles) { }
