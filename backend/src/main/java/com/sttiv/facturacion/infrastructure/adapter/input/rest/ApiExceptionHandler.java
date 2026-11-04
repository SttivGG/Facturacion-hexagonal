package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.domain.exception.*;
import java.util.LinkedHashMap;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(RecursoNoEncontradoException.class)
    ResponseEntity<ProblemDetail> noEncontrado(RecursoNoEncontradoException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage());
    }
    @ExceptionHandler(SkuDuplicadoException.class)
    ResponseEntity<ProblemDetail> duplicado(SkuDuplicadoException ex) {
        return error(HttpStatus.CONFLICT, ex.getMessage());
    }
    @ExceptionHandler(DatosInvalidosException.class)
    ResponseEntity<ProblemDetail> invalido(DatosInvalidosException ex) {
        return error(HttpStatus.BAD_REQUEST, ex.getMessage());
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validacion(MethodArgumentNotValidException ex) {
        var campos = new LinkedHashMap<String, String>();
        ex.getBindingResult().getFieldErrors().forEach(e -> campos.put(e.getField(), e.getDefaultMessage()));
        var detalle = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Datos de producto inválidos");
        detalle.setProperty("errores", campos);
        return ResponseEntity.badRequest().body(detalle);
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ProblemDetail> tamano() {
        return error(HttpStatus.BAD_REQUEST, "La imagen debe tener como máximo 3 MB");
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestPartException.class})
    ResponseEntity<ProblemDetail> peticionInvalida() {
        return error(HttpStatus.BAD_REQUEST, "JSON inválido o parte multipart 'imagen' ausente");
    }
    private ResponseEntity<ProblemDetail> error(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(ProblemDetail.forStatusAndDetail(status, mensaje));
    }
}
