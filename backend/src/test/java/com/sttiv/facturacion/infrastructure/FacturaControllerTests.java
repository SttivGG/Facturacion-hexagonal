package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.port.FacturaUseCase;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.FacturaController;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static com.sttiv.facturacion.FacturasFixtures.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FacturaController.class)
class FacturaControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean FacturaUseCase servicio;
    final String cuerpo = """
            {"clienteId":"%s","modalidad":"CREDITO","fechaVencimiento":"2099-12-15",
             "detalles":[{"productoId":"producto","cantidad":2}]}
            """.formatted(UUID.randomUUID());
    @Test void validaJsonEnumsIdentificadoresYDetalles() throws Exception {
        for (String json : new String[]{"{}", "{", cuerpo.replace("CREDITO", "OTRO"),
                cuerpo.replace("\"cantidad\":2", "\"cantidad\":0"), cuerpo.replace("\"cantidad\":2", "\"cantidad\":-1"),
                cuerpo.replace("\"cantidad\":2", "\"cantidad\":1.5"), cuerpo.replace("\"cantidad\":2", "\"cantidad\":null"),
                cuerpo.replace("[{\"productoId\":\"producto\",\"cantidad\":2}]", "[null]")}) {
            mvc.perform(post("/api/facturas").contentType("application/json").content(json)).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/facturas/no-entero")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/facturas/cliente/no-uuid")).andExpect(status().isBadRequest());
        verifyNoInteractions(servicio);
    }
    @Test void devuelveErrores404Y409ComoProblemDetail() throws Exception {
        when(servicio.consultar(99L)).thenThrow(new RecursoNoEncontradoException("Factura no encontrada"));
        mvc.perform(get("/api/facturas/99")).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        when(servicio.registrarPago(eq(99L), any())).thenThrow(new ConflictoFacturaException("Pago superior al saldo"));
        mvc.perform(post("/api/facturas/99/pagos").contentType("application/json").content("{\"monto\":1,\"metodoPago\":\"NEQUI\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("Pago superior al saldo"));
    }
    @Test void rechazaPagosInvalidos() throws Exception {
        for (String pago : new String[]{"{}", "{\"monto\":0,\"metodoPago\":\"NEQUI\"}",
                "{\"monto\":1.001,\"metodoPago\":\"NEQUI\"}", "{\"monto\":1,\"metodoPago\":\"TARJETA\"}"}) {
            mvc.perform(post("/api/facturas/1/pagos").contentType("application/json").content(pago)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(servicio);
    }
    @Test void rutasDeConsultaYClienteDevuelvenListas() throws Exception {
        var f = factura(cliente());
        when(servicio.listar()).thenReturn(List.of(f));
        when(servicio.buscarPorCliente(f.clienteId())).thenReturn(List.of(f));
        mvc.perform(get("/api/facturas")).andExpect(status().isOk()).andExpect(jsonPath("$[0].total").value(20000.50));
        mvc.perform(get("/api/facturas/cliente/{id}", f.clienteId())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].clienteId").value(f.clienteId().toString()));
    }
    @Test void crearIgnoraImportesYEstadoEnviadosPorCliente() throws Exception {
        when(servicio.crear(any())).thenReturn(factura(cliente()));
        mvc.perform(post("/api/facturas").contentType("application/json").content(cuerpo.replace("{\"clienteId\"",
                        "{\"total\":1,\"estado\":\"PAGADA\",\"clienteId\"")))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.total").value(20000.50)).andExpect(jsonPath("$.estado").value("PENDIENTE"));
    }
}
