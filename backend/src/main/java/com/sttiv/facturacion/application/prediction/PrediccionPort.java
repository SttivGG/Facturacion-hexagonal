package com.sttiv.facturacion.application.prediction;

public interface PrediccionPort {
    Prediccion.Estado estado();
    Prediccion.Modelo entrenar(Prediccion.Entrenamiento datos);
    Prediccion.Ventas ventas(int horizonte);
}
