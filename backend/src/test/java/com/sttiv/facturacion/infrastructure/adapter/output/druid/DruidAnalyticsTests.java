package com.sttiv.facturacion.infrastructure.adapter.output.druid;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.infrastructure.config.DruidProperties;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DruidAnalyticsTests {
    final JsonMapper json = JsonMapper.builder().build();
    final DruidProperties config = new DruidProperties(true, null, null, Duration.ofSeconds(1), Duration.ofMillis(80), Duration.ofMillis(1), 1_000_000);
    final DruidHttpClient http = spy(new DruidHttpClient(config, json));
    JsonNode node(Object valor) { return json.readTree(json.writeValueAsString(valor)); }
    HechosAnaliticos snapshot() {
        var filas = new ArrayList<Map<String, Object>>();
        for (var dataset : DruidDataset.values()) {
            var fila = new LinkedHashMap<String, Object>();
            dataset.columnas.forEach((k, v) -> fila.put(k, v.equals("long") ? 1L : "O'Brien \\ café"));
            fila.put("timestamp", "2026-11-05T15:00:00Z"); filas.add(fila);
        }
        return new HechosAnaliticos(List.of(filas.get(0)), List.of(filas.get(1)), List.of(filas.get(2)));
    }
    void configurar(HechosAnaliticos snapshot) {
        doReturn(node(List.of())).when(http).get("/druid/indexer/v1/tasks");
        doReturn(node(Map.of("currentClusterCapacity", 2))).when(http).get("/druid/indexer/v1/totalWorkerCapacity");
        doReturn(node(Map.of("taskId", "query-nexo_7b_test"))).when(http).post(eq("/druid/v2/sql/task"), any());
        doReturn(node(Map.of("status", Map.of("status", "SUCCESS")))).when(http).get(contains("/status"));
        doAnswer(inv -> {
            String sql = inv.getArgument(0);
            if (sql.contains("INFORMATION_SCHEMA")) return node(List.of(Map.of("TABLE_NAME", "existe")));
            if (sql.contains("sys.segments")) return node(List.of(Map.of("publicados", 1, "disponibles", 1)));
            for (var d : DruidDataset.values()) if (sql.equals(d.verificacionSql())) return node(List.of(d.esperado(d.extraer.apply(snapshot))));
            throw new AssertionError("SQL inesperado: " + sql);
        }).when(http).sql(anyString());
    }
    @Test void tresReemplazosSecuencialesEsperanSuccessYValidanSumasYPublicacion() {
        var s = snapshot(); configurar(s);
        var conteos = new DruidAnalyticsAdapter(http, config).enviarSnapshot(s);
        assertEquals(Map.of("nexo_facturas", 1L, "nexo_factura_detalles", 1L, "nexo_pagos", 1L), conteos);
        var orden = inOrder(http);
        for (var d : DruidDataset.values()) {
            orden.verify(http).post(eq("/druid/v2/sql/task"), argThat(payload -> ((Map<?, ?>) payload).get("query").toString().startsWith("REPLACE INTO \"" + d.tabla + "\" OVERWRITE ALL")));
            orden.verify(http).get("/druid/indexer/v1/task/query-nexo_7b_test/status");
            orden.verify(http).sql(d.verificacionSql());
            orden.verify(http).sql(contains("sys.segments"));
        }
        String sql = new DruidSqlMapper(http).reemplazo(DruidDataset.DETALLES, s.detalles()).get("query").toString();
        assertTrue(sql.contains("O''Brien")); assertTrue(sql.endsWith("PARTITIONED BY DAY"));
    }
    @Test void falloOCancelacionConsultaReporteYNoEnviaElSiguienteDatasource() {
        for (String status : List.of("FAILED", "CANCELED")) {
            configurar(snapshot());
            doReturn(node(Map.of("status", Map.of("status", status)))).when(http).get(contains("/status"));
            doReturn(node(Map.of("multiStageQuery", Map.of("payload", Map.of("status", Map.of("errorReport", Map.of("error", Map.of("errorCode", "NotEnoughMemory"))))))))
                    .when(http).get(contains("/reports"));
            var error = assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config).enviarSnapshot(snapshot()));
            assertTrue(error.getMessage().contains(status)); assertTrue(error.getMessage().contains("NotEnoughMemory"));
            verify(http, times(1)).post(eq("/druid/v2/sql/task"), any());
            clearInvocations(http);
        }
    }
    @Test void timeoutNoSeConfundeConExitoYNoLanzaLaSiguienteTarea() {
        configurar(snapshot());
        doReturn(node(Map.of("status", Map.of("status", "RUNNING")))).when(http).get(contains("/status"));
        assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config).enviarSnapshot(snapshot()));
        verify(http, times(1)).post(eq("/druid/v2/sql/task"), any());
    }
    @Test void esperaTareasHuerfanasAntesDeEnviarReemplazos() {
        configurar(snapshot());
        doReturn(node(List.of(Map.of("id", "query-nexo_7b_huerfana", "type", "query_controller", "statusCode", "RUNNING"))))
                .when(http).get("/druid/indexer/v1/tasks");
        new DruidAnalyticsAdapter(http, config).enviarSnapshot(snapshot());
        var orden = inOrder(http);
        orden.verify(http).get("/druid/indexer/v1/task/query-nexo_7b_huerfana/status");
        orden.verify(http).post(eq("/druid/v2/sql/task"), any());
    }
    @Test void conteosIncorrectosOSegmentosNoDisponiblesImpidenExito() {
        configurar(snapshot());
        doReturn(node(List.of(Map.of("publicados", 1, "disponibles", 0)))).when(http).sql(contains("sys.segments"));
        assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config).enviarSnapshot(snapshot()));
        verify(http, times(1)).post(eq("/druid/v2/sql/task"), any());
    }
    @Test void prevalidacionDeSumaYTamanosImpideReemplazosParciales() {
        var s = snapshot();
        var pago = new LinkedHashMap<>(s.pagos().getFirst()); pago.put("monto_centavos", Long.MAX_VALUE);
        var excesivo = new HechosAnaliticos(s.facturas(), s.detalles(), List.of(pago, s.pagos().getFirst()));
        assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config).enviarSnapshot(excesivo));
        verify(http, never()).post(anyString(), any());
        var detalle = new LinkedHashMap<>(s.detalles().getFirst()); detalle.put("nombre_producto", "x".repeat(1_000_000));
        assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config)
                .enviarSnapshot(new HechosAnaliticos(s.facturas(), List.of(detalle), s.pagos())));
        verify(http, never()).post(anyString(), any());
    }
    @Test void pagosVaciosSinTablaNoGeneranFilasFicticias() {
        var base = snapshot(); var s = new HechosAnaliticos(base.facturas(), base.detalles(), List.of()); configurar(s);
        doReturn(node(List.of())).when(http).sql(contains("INFORMATION_SCHEMA"));
        assertEquals(0L, new DruidAnalyticsAdapter(http, config).enviarSnapshot(s).get("nexo_pagos"));
        verify(http, times(2)).post(eq("/druid/v2/sql/task"), any());
    }
    @Test void capacidadDeUnSlotFallaAntesDeEnviarTareas() {
        configurar(snapshot());
        doReturn(node(Map.of("currentClusterCapacity", 1))).when(http).get("/druid/indexer/v1/totalWorkerCapacity");
        var error = assertThrows(AnalyticsException.class, () -> new DruidAnalyticsAdapter(http, config).enviarSnapshot(snapshot()));
        assertTrue(error.getMessage().contains("dos slots")); verify(http, never()).post(anyString(), any());
    }
    @Test void pagosVaciosExistentesSeReemplazanSinFilaSintetica() {
        var base = snapshot(); var s = new HechosAnaliticos(base.facturas(), base.detalles(), List.of()); configurar(s);
        assertEquals(0L, new DruidAnalyticsAdapter(http, config).enviarSnapshot(s).get("nexo_pagos"));
        verify(http, times(3)).post(eq("/druid/v2/sql/task"), any());
        verify(http).post(eq("/druid/v2/sql/task"), argThat(payload -> ((Map<?, ?>) payload).get("query").toString().contains("WHERE 1 = 0")));
    }
    @Test void httpRealLeeTaskIdYNoExponeCuerpoDeError() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var llamadas = new AtomicInteger();
        server.createContext("/druid/v2/sql/task", intercambio -> {
            assertEquals("POST", intercambio.getRequestMethod());
            assertTrue(new String(intercambio.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).contains("REPLACE"));
            byte[] respuesta = (llamadas.incrementAndGet() == 1 ? "{\"taskId\":\"real-task\"}" : "snapshot privado inline").getBytes(StandardCharsets.UTF_8);
            intercambio.sendResponseHeaders(llamadas.get() == 1 ? 200 : 400, respuesta.length);
            intercambio.getResponseBody().write(respuesta); intercambio.close();
        });
        server.start();
        try {
            var c = new DruidProperties(true, URI.create("http://127.0.0.1:" + server.getAddress().getPort()), null, null, null, null, 0);
            var cliente = new DruidHttpClient(c, json);
            assertEquals("real-task", cliente.post("/druid/v2/sql/task", Map.of("query", "REPLACE")).path("taskId").asString());
            var error = assertThrows(AnalyticsException.class, () -> cliente.post("/druid/v2/sql/task", Map.of("query", "REPLACE")));
            assertTrue(error.getMessage().contains("HTTP 400")); assertFalse(error.getMessage().contains("privado"));
        } finally { server.stop(0); }
    }
}
