package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.infrastructure.adapter.output.ml.MlHttpAdapter;
import com.sttiv.facturacion.infrastructure.config.MlProperties;
import java.net.URI;
import java.time.*;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

/** Solo contra FastAPI aislado con ML_MODEL_DIR temporal. Nunca usa las bases de Nexo. */
@EnabledIfSystemProperty(named="app.ml.integration",matches="true")
class MlPythonIntegrationTests {
    @Test void javaEntrenaDemoSinCambiarEstadoNiModeloReal() {
        var adapter = new MlHttpAdapter(new MlProperties(true, URI.create(System.getProperty("app.ml.test-url", "http://127.0.0.1:18080")), Duration.ofSeconds(10), true), JsonMapper.builder().build());
        var before = adapter.estado();
        var metadata = adapter.entrenarDemo();
        assertEquals(90,metadata.observaciones());
        assertEquals(14,metadata.metricas().diasEvaluacion());
        assertTrue(adapter.estadoDemo().entrenado());
        assertEquals(before,adapter.estado());
        for (int horizon : new int[]{7,14}) {
            var result=adapter.ventasDemo(horizon);
            assertEquals(90,result.historico().size());
            assertEquals(horizon,result.predicciones().size());
            assertNotNull(result.modelo().metricas().mae());
            assertNotNull(result.modelo().metricas().wape());
        }
    }
    @Test void javaEntrenaYConsultaPythonReal() {
        var adapter = new MlHttpAdapter(new MlProperties(true, URI.create(System.getProperty("app.ml.test-url", "http://127.0.0.1:18080")), Duration.ofSeconds(10)), JsonMapper.builder().build());
        var start = LocalDate.now(ZoneId.of("America/Bogota")).minusDays(70);
        var rows = IntStream.range(0,70).mapToObj(i -> new Prediccion.Dia(start.plusDays(i),(1000+i*10)+".25")).toList();
        var model = adapter.entrenar(new Prediccion.Entrenamiento(rows));
        assertEquals(70,model.observaciones());
        assertNotNull(model.fechaEntrenamiento());
        assertTrue(adapter.estado().entrenado());
        for (int horizon : new int[]{7,14}) {
            var result=adapter.ventas(horizon);
            assertEquals(horizon,result.predicciones().size());
            assertEquals("ridge-diaria-v1",result.modelo().version());
            assertTrue(result.totalProyectado().matches("\\d+\\.\\d{2}"));
        }
    }
}
