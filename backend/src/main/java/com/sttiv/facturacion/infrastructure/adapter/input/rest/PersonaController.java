package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.port.PersonaUseCase;
import com.sttiv.facturacion.domain.model.RolPersona;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.dto.*;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/personas")
public class PersonaController {
    private final PersonaUseCase personas;
    public PersonaController(PersonaUseCase personas) { this.personas = personas; }

    @PostMapping public ResponseEntity<PersonaResponse> crear(@Valid @RequestBody PersonaRequest datos) {
        var p = personas.crear(datos.aCommand(), datos.roles());
        return ResponseEntity.created(URI.create("/api/personas/" + p.id())).body(PersonaResponse.desde(p));
    }
    @GetMapping("/{id}") public PersonaResponse consultar(@PathVariable UUID id) {
        return PersonaResponse.desde(personas.consultar(id));
    }
    @GetMapping("/documento/{tipo}/{numero}") public PersonaResponse documento(
            @PathVariable String tipo, @PathVariable String numero) {
        return PersonaResponse.desde(personas.buscarPorDocumento(tipo, numero));
    }
    @GetMapping("/rol/{rol}") public List<PersonaResponse> rol(@PathVariable RolPersona rol) {
        return personas.buscarPorRol(rol).stream().map(PersonaResponse::desde).toList();
    }
    @PutMapping("/{id}") public PersonaResponse actualizar(@PathVariable UUID id,
            @Valid @RequestBody PersonaRequest datos) {
        return PersonaResponse.desde(personas.actualizar(id, datos.aCommand()));
    }
    @PutMapping("/{id}/roles") public PersonaResponse roles(@PathVariable UUID id,
            @Valid @RequestBody RolesPersonaRequest datos) {
        return PersonaResponse.desde(personas.reemplazarRoles(id, datos.roles()));
    }
    @DeleteMapping("/{id}") public ResponseEntity<Void> desactivar(@PathVariable UUID id) {
        personas.desactivar(id);
        return ResponseEntity.noContent().build();
    }
}
