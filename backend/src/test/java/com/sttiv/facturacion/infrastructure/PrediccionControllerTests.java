package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.port.PrediccionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.PrediccionController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PrediccionController.class)
class PrediccionControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean PrediccionUseCase useCase;
    @Test void estadoDeshabilitadoNoEsErrorDelSistema() throws Exception {
        when(useCase.estado()).thenReturn(new Prediccion.Estado(false,false,false,false,"DESHABILITADO",null,null,null));
        mvc.perform(get("/api/predicciones/estado")).andExpect(status().isOk()).andExpect(jsonPath("$.habilitado").value(false));
    }
    @Test void erroresUsanProblemDetailYCodigo() throws Exception {
        for (var code : PrediccionException.Codigo.values()) {
            doThrow(new PrediccionException(code, "Error controlado")).when(useCase).entrenar();
            int expected = switch (code) {
                case DATOS_INSUFICIENTES -> 422;
                case DATOS_INVALIDOS, HORIZONTE_INVALIDO -> 400;
                case MODELO_NO_ENTRENADO, ENTRENAMIENTO_EN_CURSO -> 409;
                default -> 503;
            };
            mvc.perform(post("/api/predicciones/entrenar")).andExpect(status().is(expected))
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.codigo").value(code.name()));
        }
    }
    @Test void horizontePorDefectoYConversionInvalida() throws Exception {
        mvc.perform(get("/api/predicciones/ventas")).andExpect(status().isOk());
        verify(useCase).ventas(7);
        mvc.perform(get("/api/predicciones/ventas?horizonte=14")).andExpect(status().isOk());
        verify(useCase).ventas(14);
        mvc.perform(get("/api/predicciones/ventas?horizonte=no")).andExpect(status().isBadRequest());
    }
}
