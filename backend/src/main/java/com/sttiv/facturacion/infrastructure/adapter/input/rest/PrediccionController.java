package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.port.PrediccionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

/** Administración académica local. Compose publica Spring y Nginx solo en loopback. */
@RestController
@RequestMapping("/api/predicciones")
public class PrediccionController {
    private final PrediccionUseCase useCase;
    public PrediccionController(PrediccionUseCase useCase) { this.useCase = useCase; }
    @GetMapping("/estado") public Prediccion.Estado estado() { return useCase.estado(); }
    @PostMapping("/entrenar") public Prediccion.Modelo entrenar() { return useCase.entrenar(); }
    @GetMapping("/ventas") public Prediccion.Ventas ventas(@RequestParam(defaultValue = "7") int horizonte) { return useCase.ventas(horizonte); }
    @ExceptionHandler(PrediccionException.class) public ResponseEntity<ProblemDetail> error(PrediccionException ex) {
        return respuestaError(ex);
    }
    static ResponseEntity<ProblemDetail> respuestaError(PrediccionException ex) {
        var status = switch (ex.codigo()) {
            case DATOS_INSUFICIENTES -> HttpStatus.UNPROCESSABLE_ENTITY;
            case DATOS_INVALIDOS, HORIZONTE_INVALIDO -> HttpStatus.BAD_REQUEST;
            case MODELO_NO_ENTRENADO, ENTRENAMIENTO_EN_CURSO -> HttpStatus.CONFLICT;
            default -> HttpStatus.SERVICE_UNAVAILABLE;
        };
        var detail = ProblemDetail.forStatusAndDetail(status, ex.getMessage());
        detail.setProperty("codigo", ex.codigo().name());
        return ResponseEntity.status(status).body(detail);
    }
}
