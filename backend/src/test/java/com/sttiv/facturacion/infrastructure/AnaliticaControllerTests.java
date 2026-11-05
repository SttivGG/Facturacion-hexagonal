package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.application.port.SincronizarFacturacionUseCase;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.AnaliticaController;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AnaliticaController.class)
class AnaliticaControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean SincronizarFacturacionUseCase sincronizacion;
    @Test void aceptadaYEnEjecucionSon202SinEsperarTareas() throws Exception {
        for (var resultado : new SincronizarFacturacionUseCase.Solicitud[]{SincronizarFacturacionUseCase.Solicitud.ACEPTADA, SincronizarFacturacionUseCase.Solicitud.EN_EJECUCION}) {
            when(sincronizacion.solicitar()).thenReturn(resultado);
            mvc.perform(post("/api/analitica/sincronizar")).andExpect(status().isAccepted()).andExpect(jsonPath("$.resultado").value(resultado.name()));
        }
    }
    @Test void deshabilitadaYResumenSinDruidSon503Controlados() throws Exception {
        when(sincronizacion.solicitar()).thenReturn(SincronizarFacturacionUseCase.Solicitud.DESHABILITADA);
        mvc.perform(post("/api/analitica/sincronizar")).andExpect(status().isServiceUnavailable());
        when(sincronizacion.resumen()).thenThrow(new AnalyticsException("Druid sin facturas analíticas"));
        mvc.perform(get("/api/analitica/resumen")).andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value("Druid sin facturas analíticas"));
    }
    @Test void estadoNoInventaConteosVerificados() throws Exception {
        when(sincronizacion.estado()).thenReturn(new EstadoSincronizacion(true, false, false, true, "FAILED", null, "Sin conexión", Map.of()));
        mvc.perform(get("/api/analitica/estado")).andExpect(status().isOk())
                .andExpect(jsonPath("$.pendiente").value(true)).andExpect(jsonPath("$.registrosVerificados").isEmpty());
    }
}
