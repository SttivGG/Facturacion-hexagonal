package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.application.command.PagoCommand;
import com.sttiv.facturacion.domain.model.MetodoPago;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record PagoRequest(@NotNull MetodoPago metodoPago,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 48, fraction = 2) BigDecimal monto,
        @Size(max = 255) String referencia, @Size(max = 2000) String observaciones) {
    public PagoCommand aCommand() { return new PagoCommand(metodoPago, monto, referencia, observaciones); }
}
