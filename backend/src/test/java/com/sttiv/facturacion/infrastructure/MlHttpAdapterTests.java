package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.infrastructure.adapter.output.ml.MlHttpAdapter;
import com.sttiv.facturacion.infrastructure.config.MlProperties;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.time.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class MlHttpAdapterTests {
    @Test void canalesSeparadosYMarcadorDemoObligatorio() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var response = new AtomicReference<>("{\"modo\":\"DEMOSTRACION\",\"datosSimulados\":true,\"resultado\":{\"habilitado\":true,\"disponible\":true,\"entrenado\":false,\"entrenando\":false,\"estado\":\"MODELO_NO_ENTRENADO\"}}");
        var demoCalls = new java.util.concurrent.atomic.AtomicInteger();
        server.createContext("/demo/estado", exchange -> {
            demoCalls.incrementAndGet(); var bytes=response.get().getBytes(); exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.createContext("/estado", exchange -> {
            var bytes=response.get().getBytes(); exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            var adapter = new MlHttpAdapter(new MlProperties(true,URI.create("http://127.0.0.1:"+server.getAddress().getPort()),Duration.ofSeconds(2),true),JsonMapper.builder().build());
            assertTrue(adapter.estadoDemo().disponible());
            assertEquals(1,demoCalls.get());
            assertThrows(PrediccionException.class,adapter::estado, "El modo real no acepta respuestas demo");
            response.set("{\"habilitado\":true,\"disponible\":true,\"entrenado\":false,\"entrenando\":false,\"estado\":\"LISTO\"}");
            assertThrows(PrediccionException.class,adapter::estadoDemo, "Demo exige el marcador de origen");
            assertEquals("LISTO",adapter.estado().estado());
        } finally { server.stop(0); }
    }
    @Test void serializaDecimalesComoCadenasYTraduceErroresHttp() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var request = new AtomicReference<String>();
        server.createContext("/entrenar", exchange -> {
            request.set(new String(exchange.getRequestBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            var body = "{\"codigo\":\"DATOS_INSUFICIENTES\",\"detail\":\"Se necesitan 56 días\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(422, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/estado", exchange -> {
            var body = "{\"habilitado\":true,\"disponible\":true,\"entrenado\":false,\"entrenando\":false,\"estado\":\"MODELO_NO_ENTRENADO\"}".getBytes();
            exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var adapter = new MlHttpAdapter(new MlProperties(true, URI.create("http://127.0.0.1:"+server.getAddress().getPort()), Duration.ofSeconds(2)), JsonMapper.builder().build());
            assertFalse(adapter.estado().entrenado());
            var exception = assertThrows(PrediccionException.class, () -> adapter.entrenar(new Prediccion.Entrenamiento(List.of(new Prediccion.Dia(LocalDate.of(2026,1,1),"9007199254.75")))));
            assertEquals(PrediccionException.Codigo.DATOS_INSUFICIENTES,exception.codigo());
            assertTrue(request.get().contains("\"9007199254.75\""));
            server.stop(0);
            assertEquals(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE,assertThrows(PrediccionException.class,adapter::estado).codigo());
        } finally { server.stop(0); }
    }
    @Test void jsonInvalidoYTimeoutSonServicioNoDisponible() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/estado", exchange -> {
            var body="invalid".getBytes(); exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/ventas", exchange -> {
            try { Thread.sleep(300); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        server.start();
        try {
            var adapter = new MlHttpAdapter(new MlProperties(true,URI.create("http://127.0.0.1:"+server.getAddress().getPort()),Duration.ofMillis(100)),JsonMapper.builder().build());
            assertThrows(PrediccionException.class,adapter::estado);
            assertEquals(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE,assertThrows(PrediccionException.class,() -> adapter.ventas(7)).codigo());
        } finally { server.stop(0); }
    }
}
