package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.domain.port.FacturaRepositoryPort;

/** La extracción termina antes de cualquier conexión al motor analítico. */
public class PrepararSnapshotFacturacion {
    private final FacturaRepositoryPort facturas;
    public PrepararSnapshotFacturacion(FacturaRepositoryPort facturas) { this.facturas = facturas; }
    public HechosAnaliticos obtener() { return new HechosFacturacionMapper().transformar(facturas.listar()); }
}
