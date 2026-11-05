package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.port.FacturaUseCase;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.dto.*;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/facturas")
public class FacturaController {
    private final FacturaUseCase facturas;
    public FacturaController(FacturaUseCase facturas) { this.facturas = facturas; }
    @PostMapping public ResponseEntity<FacturaResponse> crear(@Valid @RequestBody FacturaRequest datos) {
        var f = facturas.crear(datos.aCommand());
        return ResponseEntity.created(URI.create("/api/facturas/" + f.id())).body(FacturaResponse.desde(f));
    }
    @GetMapping public List<FacturaResponse> listar() { return facturas.listar().stream().map(FacturaResponse::desde).toList(); }
    @GetMapping("/{id}") public FacturaResponse consultar(@PathVariable Long id) { return FacturaResponse.desde(facturas.consultar(id)); }
    @GetMapping("/cliente/{clienteId}") public List<FacturaResponse> cliente(@PathVariable UUID clienteId) {
        return facturas.buscarPorCliente(clienteId).stream().map(FacturaResponse::desde).toList();
    }
    @PostMapping("/{id}/pagos") public FacturaResponse pagar(@PathVariable Long id, @Valid @RequestBody PagoRequest datos) {
        return FacturaResponse.desde(facturas.registrarPago(id, datos.aCommand()));
    }
}
