package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.port.DemostracionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.DemostracionController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DemostracionController.class)
class DemostracionControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean DemostracionUseCase useCase;
    @Test void todasLasRespuestasIdentificanDatosSimulados() throws Exception {
        when(useCase.estado()).thenReturn(new Prediccion.Estado(true,true,false,false,"MODELO_NO_ENTRENADO",null,null,null));
        mvc.perform(get("/api/predicciones/demo/estado")).andExpect(status().isOk())
                .andExpect(jsonPath("$.modo").value("DEMOSTRACION")).andExpect(jsonPath("$.datosSimulados").value(true))
                .andExpect(jsonPath("$.resultado.entrenado").value(false));
        mvc.perform(post("/api/predicciones/demo/entrenar")).andExpect(status().isOk()).andExpect(jsonPath("$.datosSimulados").value(true));
        mvc.perform(get("/api/predicciones/demo/ventas?horizonte=14")).andExpect(status().isOk()).andExpect(jsonPath("$.modo").value("DEMOSTRACION"));
        verify(useCase).ventas(14);
    }
    @Test void deshabilitacionYErroresTienenCodigosCoherentes() throws Exception {
        doThrow(new PrediccionException(PrediccionException.Codigo.DEMO_DESHABILITADA,"Solo disponible en entorno académico local")).when(useCase).entrenar();
        mvc.perform(post("/api/predicciones/demo/entrenar")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.codigo").value("DEMO_DESHABILITADA"));
        when(useCase.ventas(7)).thenThrow(new PrediccionException(PrediccionException.Codigo.MODELO_NO_ENTRENADO,"Entrena la demostración"));
        mvc.perform(get("/api/predicciones/demo/ventas")).andExpect(status().isConflict());
    }
}
