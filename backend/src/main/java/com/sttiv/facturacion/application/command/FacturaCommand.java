package com.sttiv.facturacion.application.command;

import com.sttiv.facturacion.domain.model.ModalidadVenta;
import java.time.LocalDate;
import java.util.*;

public record FacturaCommand(UUID clienteId, UUID vendedorId, ModalidadVenta modalidad,
        LocalDate fechaVencimiento, List<Linea> detalles, List<PagoCommand> pagosIniciales) {
    public record Linea(String productoId, Integer cantidad) { }
}
