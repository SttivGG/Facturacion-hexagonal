package com.sttiv.facturacion.application.prediction;

/** Predicción sintética aislada. No recibe ni consulta historia transaccional. */
public interface DemostracionPort {
    Prediccion.Estado estadoDemo();
    Prediccion.Modelo entrenarDemo();
    Prediccion.Ventas ventasDemo(int horizonte);
}
