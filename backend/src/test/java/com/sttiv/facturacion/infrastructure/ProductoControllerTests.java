package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.CatalogoEnMemoria;
import com.sttiv.facturacion.application.port.ProductoUseCase;
import com.sttiv.facturacion.application.usecase.ProductoService;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import com.sttiv.facturacion.domain.exception.PersistenciaPersonaException;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.ProductoController;
import java.time.Clock;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProductoController.class)
@Import(ProductoControllerTests.Config.class)
class ProductoControllerTests {
    @TestConfiguration static class Config {
        @Bean CatalogoEnMemoria catalogo() { return new CatalogoEnMemoria(); }
        @Bean PersonaRepositoryPort personas() { return mock(PersonaRepositoryPort.class); }
        @Bean ProductoUseCase productos(CatalogoEnMemoria catalogo, PersonaRepositoryPort personas) {
            return new ProductoService(catalogo, catalogo, personas, Clock.systemUTC());
        }
    }
    @Autowired MockMvc mvc;
    @Autowired CatalogoEnMemoria catalogo;
    @Autowired PersonaRepositoryPort personas;
    final JsonMapper json = JsonMapper.builder().build();
    final String valido = """
            {"sku":"CAF-1","nombre":"Café","descripcion":"Molido","categoria":"Alimentos",
             "costo":12345.67,"precioVenta":19000.99,"proveedorId":null}
            """;
    @BeforeEach void limpiar() { catalogo.productos.clear(); catalogo.imagenes.clear(); reset(personas); }
    String crear() throws Exception {
        var resultado = mvc.perform(post("/api/productos").contentType(MediaType.APPLICATION_JSON).content(valido))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.activo").value(true)).andExpect(jsonPath("$.moneda").value("COP"))
                .andReturn();
        JsonNode respuesta = json.readTree(resultado.getResponse().getContentAsString());
        return respuesta.get("id").asString();
    }
    @Test void cicloCrearConsultarActualizarDesactivar() throws Exception {
        String id = crear();
        mvc.perform(get("/api/productos")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/productos/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.precioVenta").value(19000.99));
        mvc.perform(put("/api/productos/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .content(valido.replace("Café", "Café especial")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nombre").value("Café especial"));
        mvc.perform(delete("/api/productos/{id}", id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/productos/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.activo").value(false));
        assertThat(catalogo.productos).containsKey(id);
    }
    @Test void duplicadosDevuelven409() throws Exception {
        crear();
        mvc.perform(post("/api/productos").contentType(MediaType.APPLICATION_JSON).content(valido))
                .andExpect(status().isConflict()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(409));
    }
    @Test void validacionYJsonInvalidoDevuelven400() throws Exception {
        for (String contenido : new String[]{"{}", "{", valido.replace("12345.67", "-1"),
                valido.replace("19000.99", "null"), valido.replace("CAF-1", " "),
                valido.replace("19000.99", "0.001")}) {
            mvc.perform(post("/api/productos").contentType(MediaType.APPLICATION_JSON).content(contenido))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
    }
    @Test void inexistentesDevuelven404() throws Exception {
        mvc.perform(get("/api/productos/ausente")).andExpect(status().isNotFound());
        mvc.perform(put("/api/productos/ausente").contentType(MediaType.APPLICATION_JSON).content(valido))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/productos/ausente")).andExpect(status().isNotFound());
        mvc.perform(get("/api/productos/ausente/imagen")).andExpect(status().isNotFound());
    }
    @Test void multipartRecuperacionYReemplazo() throws Exception {
        String id = crear();
        mvc.perform(get("/api/productos/{id}/imagen", id)).andExpect(status().isNotFound());
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=");
        var archivo = new MockMultipartFile("imagen", "pixel.png", "image/png", png);
        for (int i = 0; i < 2; i++) {
            mvc.perform(multipart("/api/productos/{id}/imagen", id).file(archivo))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.imagenId").isNotEmpty());
            mvc.perform(get("/api/productos/{id}/imagen", id)).andExpect(status().isOk())
                    .andExpect(content().contentType("image/png")).andExpect(content().bytes(png));
        }
        assertThat(catalogo.imagenes).hasSize(1);
    }
    @Test void multipartInvalidoDevuelve400() throws Exception {
        String id = crear();
        for (var archivo : new MockMultipartFile[]{
                new MockMultipartFile("imagen", "a.gif", "image/gif", new byte[]{1}),
                new MockMultipartFile("imagen", "falso.png", "image/png", new byte[]{1,2}),
                new MockMultipartFile("imagen", "vacio.png", "image/png", new byte[0]),
                new MockMultipartFile("imagen", "grande.png", "image/png", new byte[3 * 1024 * 1024 + 1])}) {
            mvc.perform(multipart("/api/productos/{id}/imagen", id).file(archivo))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
        mvc.perform(multipart("/api/productos/{id}/imagen", id)).andExpect(status().isBadRequest());
    }

    @Test void proveedorInvalidoOInexistenteDevuelve400SinGuardar() throws Exception {
        for (String proveedor : new String[]{"incorrecto", java.util.UUID.randomUUID().toString()}) {
            mvc.perform(post("/api/productos").contentType(MediaType.APPLICATION_JSON)
                    .content(valido.replace("\"proveedorId\":null", "\"proveedorId\":\"" + proveedor + "\"")))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").isNotEmpty());
        }
        assertThat(catalogo.productos).isEmpty();
    }

    @Test void falloCassandraDevuelve503SinGuardar() throws Exception {
        when(personas.buscarPorId(any())).thenThrow(new PersistenciaPersonaException("Cassandra no disponible", null));
        mvc.perform(post("/api/productos").contentType(MediaType.APPLICATION_JSON)
                .content(valido.replace("\"proveedorId\":null", "\"proveedorId\":\"" + java.util.UUID.randomUUID() + "\"")))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.detail").value("Cassandra no disponible"));
        assertThat(catalogo.productos).isEmpty();
    }
}
