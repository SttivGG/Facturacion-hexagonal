package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import java.math.BigDecimal;
import java.time.Instant;

public record Pago(Long id, Long facturaId, Instant fechaPago, BigDecimal monto,
        MetodoPago metodoPago, String referencia, String observaciones) {
    public Pago {
        monto = Importe.normalizar(monto);
        if (monto.signum() <= 0 || metodoPago == null || fechaPago == null) {
            throw new DatosInvalidosException("El pago requiere monto positivo, método y fecha");
        }
        if ((referencia != null && referencia.length() > 255)
                || (observaciones != null && observaciones.length() > 2000)) {
            throw new DatosInvalidosException("Referencia admite 255 caracteres y observaciones 2000");
        }
    }
}
