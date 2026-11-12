package com.sttiv.facturacion.infrastructure;

import com.datastax.oss.driver.api.core.CqlSession;
import com.mongodb.client.MongoClient;
import com.sttiv.facturacion.application.prediction.HistorialVentasPort;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.clearInvocations;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

/** Spring completo + Python real; las bases son dobles/H2 y el historial no debe consultarse. */
@EnabledIfSystemProperty(named="app.ml.integration", matches="true")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={"server.address=127.0.0.1", "app.ml.enabled=true", "app.ml.demo-enabled=true", "app.ml.base-url=http://127.0.0.1:18080"})
@AutoConfigureMockMvc
class DemostracionFlowIntegrationTests {
    @MockitoBean MongoClient mongoClient;
    @MockitoBean CqlSession cqlSession;
    @MockitoBean PersonaRepositoryPort personas;
    @MockitoBean HistorialVentasPort historial;
    @Autowired MockMvc mvc;
    @Value("${local.server.port}") int serverPort;

    @Test
    @EnabledIfSystemProperty(named="app.ml.ui-script", matches=".+")
    void navegadorMuestraResultadosRidgeDeSpringYPythonReales() throws Exception {
        var log = java.nio.file.Path.of("target", "ml-demo-browser.log");
        var process = new ProcessBuilder("node", System.getProperty("app.ml.ui-script"), String.valueOf(serverPort))
                .redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try {
            assertTrue(process.waitFor(90, java.util.concurrent.TimeUnit.SECONDS), "La verificación de navegador debe terminar");
            System.out.print(java.nio.file.Files.readString(log));
            assertEquals(0, process.exitValue());
        } finally { if (process.isAlive()) process.destroyForcibly(); }
    }

    @Test void restCasoDeUsoPuertoYPythonEntrenanSinAccederAHistorial() throws Exception {
        clearInvocations(historial, personas, cqlSession, mongoClient);
        mvc.perform(post("/api/predicciones/demo/entrenar")).andExpect(status().isOk())
                .andExpect(jsonPath("$.datosSimulados").value(true))
                .andExpect(jsonPath("$.resultado.observaciones").value(90))
                .andExpect(jsonPath("$.resultado.metricas.diasEvaluacion").value(14));
        for (int days : new int[]{7,14}) {
            mvc.perform(get("/api/predicciones/demo/ventas?horizonte="+days)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.modo").value("DEMOSTRACION"))
                    .andExpect(jsonPath("$.resultado.historico.length()").value(90))
                    .andExpect(jsonPath("$.resultado.predicciones.length()").value(days))
                    .andExpect(jsonPath("$.resultado.totalProyectado").isString())
                    .andExpect(jsonPath("$.resultado.modelo.metricas.mae").isString());
        }
        verifyNoInteractions(historial, personas, cqlSession, mongoClient);
    }
}
