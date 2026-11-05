package com.sttiv.facturacion.domain.port;

import com.sttiv.facturacion.domain.model.UbicacionGeografica;

public interface UbicacionCatalogoPort {
    UbicacionGeografica normalizar(UbicacionGeografica ubicacion);
}
