package com.sttiv.facturacion.application.port;

import com.sttiv.facturacion.application.analytics.*;

public interface SincronizarFacturacionUseCase {
    enum Solicitud { ACEPTADA, EN_EJECUCION, DESHABILITADA }
    Solicitud solicitar();
    EstadoSincronizacion estado();
    ResumenAnalitico resumen();
}
