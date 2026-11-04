package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

	@GetMapping(value = "/api/health", produces = MediaType.APPLICATION_JSON_VALUE)
	public Map<String, String> health() {
		return Map.of("status", "OK", "sistema", "Facturacion Hexagonal");
	}

}
