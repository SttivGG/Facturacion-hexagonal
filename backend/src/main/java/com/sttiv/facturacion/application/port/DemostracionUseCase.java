package com.sttiv.facturacion.application.port;

import com.sttiv.facturacion.application.prediction.Prediccion;

public interface DemostracionUseCase {
    Prediccion.Estado estado();
    Prediccion.Modelo entrenar();
    Prediccion.Ventas ventas(int horizonte);
}
