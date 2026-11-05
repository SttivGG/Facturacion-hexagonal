package com.sttiv.facturacion.infrastructure.adapter.output.druid;

import com.sttiv.facturacion.application.analytics.AnalyticsException;
import com.sttiv.facturacion.infrastructure.config.DruidProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class DruidHttpClient {
    private final DruidProperties config;
    private final HttpClient http;
    private final JsonMapper json;
    public DruidHttpClient(DruidProperties config, JsonMapper json) {
        this.config = config; this.json = json;
        http = HttpClient.newBuilder().connectTimeout(config.httpTimeout()).build();
    }
    public String serializar(Object valor) { return json.writeValueAsString(valor); }
    public JsonNode get(String ruta) { return enviar(ruta, null); }
    public JsonNode post(String ruta, Object cuerpo) { return enviar(ruta, serializar(cuerpo)); }
    public JsonNode sql(String consulta) {
        JsonNode resultado = post("/druid/v2/sql", Map.of("query", consulta, "resultFormat", "object",
                "context", Map.of("useCache", false, "populateCache", false, "sqlTimeZone", "UTC", "useApproximateCountDistinct", false)));
        if (!resultado.isArray()) throw new AnalyticsException("Respuesta SQL Druid inválida");
        return resultado;
    }
    public void validarTamano(Object cuerpo) {
        if (serializar(cuerpo).getBytes(StandardCharsets.UTF_8).length > config.maxRequestBytes()) {
            throw new AnalyticsException("Snapshot excede DRUID_MAX_REQUEST_BYTES; no se enviaron reemplazos");
        }
    }
    private JsonNode enviar(String ruta, String cuerpo) {
        var request = HttpRequest.newBuilder(URI.create(config.baseUrl().toString().replaceAll("/$", "") + ruta))
                .timeout(config.httpTimeout()).header("Accept", "application/json");
        if (cuerpo == null) request.GET();
        else request.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(cuerpo, StandardCharsets.UTF_8));
        try {
            var respuesta = http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (respuesta.statusCode() < 200 || respuesta.statusCode() >= 300) {
                // No reproducir el cuerpo: errores del planificador pueden incluir el snapshot inline.
                throw new AnalyticsException("Druid HTTP " + respuesta.statusCode() + " en " + ruta);
            }
            try { return json.readTree(respuesta.body()); }
            catch (RuntimeException ex) { throw new AnalyticsException("Druid devolvió JSON inválido en " + ruta); }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new AnalyticsException("Operación Druid interrumpida; se reconciliará nuevamente", ex);
        } catch (IOException ex) {
            throw new AnalyticsException("Druid no responde o agotó el timeout HTTP", ex);
        }
    }
}
