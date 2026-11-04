package com.sttiv.facturacion.infrastructure.adapter.input.rest.dto;

import com.sttiv.facturacion.application.command.ProductoCommand;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record ProductoRequest(@NotBlank String sku, @NotBlank String nombre,
        String descripcion, String categoria,
        @NotNull @DecimalMin("0") @Digits(integer = 32, fraction = 2) BigDecimal costo,
        @NotNull @DecimalMin("0") @Digits(integer = 32, fraction = 2) BigDecimal precioVenta,
        String proveedorId) {
    public ProductoCommand aCommand() {
        return new ProductoCommand(sku, nombre, descripcion, categoria, costo, precioVenta, proveedorId);
    }
}
