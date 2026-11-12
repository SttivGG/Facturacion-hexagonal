package com.sttiv.facturacion.infrastructure.adapter.output.ml;

import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.infrastructure.config.MlProperties;
import static com.sttiv.facturacion.application.prediction.PrediccionException.Codigo.*;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.json.JsonMapper;

public class MlHttpAdapter implements PrediccionPort, DemostracionPort {
    private final MlProperties config;
    private final JsonMapper json;
    private final HttpClient http;
    public MlHttpAdapter(MlProperties config, JsonMapper json) {
        this.config = config; this.json = json;
        http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(config.httpTimeout()).build();
    }
    @Override public Prediccion.Estado estado() { return send("/estado", null, Prediccion.Estado.class); }
    @Override public Prediccion.Modelo entrenar(Prediccion.Entrenamiento datos) { return send("/entrenar", datos, Prediccion.Modelo.class); }
    @Override public Prediccion.Ventas ventas(int horizonte) { return send("/ventas?horizonte=" + horizonte, null, Prediccion.Ventas.class); }
    @Override public Prediccion.Estado estadoDemo() { return send("/demo/estado", null, Prediccion.Estado.class); }
    @Override public Prediccion.Modelo entrenarDemo() { return send("/demo/entrenar", java.util.Map.of(), Prediccion.Modelo.class); }
    @Override public Prediccion.Ventas ventasDemo(int horizonte) { return send("/demo/ventas?horizonte=" + horizonte, null, Prediccion.Ventas.class); }
    private <T> T send(String path, Object body, Class<T> type) {
        var request = HttpRequest.newBuilder(URI.create(config.baseUrl().toString().replaceAll("/$", "") + path))
                .timeout(config.httpTimeout()).header("Accept", "application/json");
        if (body == null) request.GET();
        else request.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8));
        try {
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                var problem = json.readTree(response.body());
                PrediccionException.Codigo code;
                try { code = PrediccionException.Codigo.valueOf(problem.path("codigo").asText()); }
                catch (IllegalArgumentException ex) { code = SERVICIO_NO_DISPONIBLE; }
                throw new PrediccionException(code, problem.path("detail").asText("El servicio ML no está disponible"));
            }
            var payload = json.readTree(response.body());
            if (path.startsWith("/demo/")) {
                if (!"DEMOSTRACION".equals(payload.path("modo").asText()) || !payload.path("datosSimulados").asBoolean())
                    throw new IllegalArgumentException("Respuesta de demostración sin procedencia");
                payload = payload.path("resultado");
            } else if (payload.has("modo") || payload.has("datosSimulados")) {
                throw new IllegalArgumentException("Respuesta de otro modo en el canal real");
            }
            var result = json.treeToValue(payload, type);
            if (result == null) throw new IllegalArgumentException("Respuesta vacía");
            if (result instanceof Prediccion.Estado state && state.estado() == null)
                throw new IllegalArgumentException("Estado incompleto");
            if (result instanceof Prediccion.Modelo model && (model.version() == null || model.metricas() == null || model.fechaEntrenamiento() == null))
                throw new IllegalArgumentException("Modelo incompleto");
            if (result instanceof Prediccion.Ventas sales && (sales.modelo() == null || sales.predicciones() == null
                    || sales.predicciones().size() != sales.horizonte() || sales.historico() == null || sales.totalProyectado() == null))
                throw new IllegalArgumentException("Predicción incompleta");
            return result;
        } catch (PrediccionException ex) { throw ex; }
        catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new PrediccionException(SERVICIO_NO_DISPONIBLE, "Solicitud al servicio ML interrumpida");
        } catch (IOException | RuntimeException ex) {
            throw new PrediccionException(SERVICIO_NO_DISPONIBLE, "El servicio ML no responde, agotó el tiempo de espera o devolvió una respuesta inválida");
        }
    }
}
