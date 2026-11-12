package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.port.DemostracionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

/** Administración exclusivamente académica local, deshabilitada por defecto. */
@RestController
@RequestMapping("/api/predicciones/demo")
public class DemostracionController {
    private final DemostracionUseCase useCase;
    public DemostracionController(DemostracionUseCase useCase) { this.useCase = useCase; }
    @GetMapping("/estado") public Prediccion.Demostracion<Prediccion.Estado> estado() { return Prediccion.Demostracion.de(useCase.estado()); }
    @PostMapping("/entrenar") public Prediccion.Demostracion<Prediccion.Modelo> entrenar() { return Prediccion.Demostracion.de(useCase.entrenar()); }
    @GetMapping("/ventas") public Prediccion.Demostracion<Prediccion.Ventas> ventas(@RequestParam(defaultValue="7") int horizonte) {
        return Prediccion.Demostracion.de(useCase.ventas(horizonte));
    }
    @ExceptionHandler(PrediccionException.class) public ResponseEntity<ProblemDetail> error(PrediccionException ex) {
        // Comparte las convenciones y la traducción de errores con el canal real.
        return PrediccionController.respuestaError(ex);
    }
}
