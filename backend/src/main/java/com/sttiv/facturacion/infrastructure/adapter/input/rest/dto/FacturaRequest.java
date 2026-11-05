package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.application.command.FacturaCommand;
import com.sttiv.facturacion.domain.model.ModalidadVenta;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;

public record FacturaRequest(@NotNull UUID clienteId, UUID vendedorId, @NotNull ModalidadVenta modalidad,
        LocalDate fechaVencimiento, @NotEmpty @Size(max = 1000) List<@NotNull @Valid Linea> detalles,
        @Size(max = 100) List<@NotNull @Valid PagoRequest> pagosIniciales) {
    public record Linea(@NotBlank @Size(max = 255) String productoId, @NotNull @Positive Integer cantidad) { }
    public FacturaCommand aCommand() {
        return new FacturaCommand(clienteId, vendedorId, modalidad, fechaVencimiento,
                detalles.stream().map(d -> new FacturaCommand.Linea(d.productoId(), d.cantidad())).toList(),
                pagosIniciales == null ? List.of() : pagosIniciales.stream().map(PagoRequest::aCommand).toList());
    }
}
