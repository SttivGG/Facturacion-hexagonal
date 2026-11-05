package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Importe {
    private Importe() { }
    public static BigDecimal normalizar(BigDecimal valor) {
        if (valor == null || valor.signum() < 0 || valor.stripTrailingZeros().scale() > 2
                || valor.precision() - valor.scale() > 48) {
            throw new DatosInvalidosException("Importe inválido: admite hasta 48 enteros y 2 decimales, sin redondeo");
        }
        return valor.setScale(2, RoundingMode.UNNECESSARY);
    }
}
