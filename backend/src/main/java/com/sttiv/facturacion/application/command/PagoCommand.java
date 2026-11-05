package com.sttiv.facturacion.application.command;

import com.sttiv.facturacion.domain.model.*;
import java.math.BigDecimal;
import java.time.Instant;

public record PagoCommand(MetodoPago metodoPago, BigDecimal monto, String referencia, String observaciones) {
    public Pago aPago(Instant ahora) { return new Pago(null, null, ahora, monto, metodoPago, referencia, observaciones); }
}
