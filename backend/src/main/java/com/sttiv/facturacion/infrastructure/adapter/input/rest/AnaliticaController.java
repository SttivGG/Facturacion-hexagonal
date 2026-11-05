package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.application.port.SincronizarFacturacionUseCase;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

/** Administración local académica, sin autenticación. No publicar en Internet. */
@RestController
@RequestMapping("/api/analitica")
public class AnaliticaController {
    private final SincronizarFacturacionUseCase sincronizacion;
    public AnaliticaController(SincronizarFacturacionUseCase sincronizacion) { this.sincronizacion = sincronizacion; }
    @PostMapping("/sincronizar") public ResponseEntity<?> sincronizar() {
        var solicitud = sincronizacion.solicitar();
        return ResponseEntity.status(solicitud == SincronizarFacturacionUseCase.Solicitud.DESHABILITADA
                ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.ACCEPTED).body(Map.of("resultado", solicitud));
    }
    @GetMapping("/estado") public EstadoSincronizacion estado() { return sincronizacion.estado(); }
    @GetMapping("/resumen") public ResumenAnalitico resumen() { return sincronizacion.resumen(); }
    @ExceptionHandler(AnalyticsException.class) public ResponseEntity<ProblemDetail> error(AnalyticsException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage()));
    }
}
