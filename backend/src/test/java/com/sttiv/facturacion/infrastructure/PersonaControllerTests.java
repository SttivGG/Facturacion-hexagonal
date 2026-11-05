package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.PersonasEnMemoria;
import com.sttiv.facturacion.application.port.PersonaUseCase;
import com.sttiv.facturacion.application.usecase.PersonaService;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.PersonaController;
import com.sttiv.facturacion.infrastructure.adapter.output.divipola.DivipolaCatalogoAdapter;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PersonaController.class)
@Import(PersonaControllerTests.Config.class)
class PersonaControllerTests {
    @TestConfiguration static class Config {
        @Bean PersonasEnMemoria repositorio() { return new PersonasEnMemoria(); }
        @Bean PersonaUseCase personas(PersonasEnMemoria repositorio) { return new PersonaService(repositorio, Clock.systemUTC(), new DivipolaCatalogoAdapter()); }
    }
    @Autowired MockMvc mvc;
    @Autowired PersonasEnMemoria repositorio;
    final String valido = """
            {"tipoDocumento":"CC","numeroDocumento":"123","nombres":"Ana","correo":"ana@example.test",
             "ciudad":"Mocoa","departamento":"Putumayo","pais":"Colombia","roles":["CLIENTE","PROVEEDOR","CLIENTE"]}
            """;
    @BeforeEach void limpiar() { repositorio.datos.clear(); }
    String crear() throws Exception {
        var r = mvc.perform(post("/api/personas").contentType(MediaType.APPLICATION_JSON).content(valido))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.roles.length()").value(2)).andExpect(jsonPath("$.activo").value(true)).andReturn();
        return JsonMapper.builder().build().readTree(r.getResponse().getContentAsString()).get("id").asString();
    }
    @Test void cicloHttpConDocumentoYRoles() throws Exception {
        String id = crear();
        mvc.perform(get("/api/personas/{id}", id)).andExpect(status().isOk()).andExpect(jsonPath("$.nombres").value("Ana"));
        mvc.perform(get("/api/personas/documento/CC/123")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        mvc.perform(put("/api/personas/{id}", id).contentType(MediaType.APPLICATION_JSON).content(valido.replace("Ana", "Ana María")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nombres").value("Ana María"));
        mvc.perform(put("/api/personas/{id}/roles", id).contentType(MediaType.APPLICATION_JSON).content("{\"roles\":[\"TRABAJADOR\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles[0]").value("TRABAJADOR"));
        mvc.perform(get("/api/personas/rol/PROVEEDOR")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/personas/rol/TRABAJADOR")).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(delete("/api/personas/{id}", id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/personas/{id}", id)).andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(false));
    }
    @Test void conflictoDocumento409() throws Exception {
        crear();
        mvc.perform(post("/api/personas").contentType(MediaType.APPLICATION_JSON).content(valido))
                .andExpect(status().isConflict()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }
    @Test void apiNormalizaNombresOficialesYRechazaCombinacionesInvalidas() throws Exception {
        String id = crear();
        mvc.perform(get("/api/personas/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.departamento").value("PUTUMAYO"))
                .andExpect(jsonPath("$.ciudad").value("MOCOA"));
        mvc.perform(post("/api/personas").contentType(MediaType.APPLICATION_JSON)
                .content(valido.replace("123", "456").replace("Mocoa", "Medellín")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        mvc.perform(put("/api/personas/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .content(valido.replace("Putumayo", "Antioquia")))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/personas/{id}", id)).andExpect(jsonPath("$.ciudad").value("MOCOA"));
    }
    @Test void apiPermiteUbicacionTotalmenteOpcional() throws Exception {
        mvc.perform(post("/api/personas").contentType(MediaType.APPLICATION_JSON)
                .content("{\"tipoDocumento\":\"CC\",\"numeroDocumento\":\"1\",\"nombres\":\"Sin ubicación\"}"))
                .andExpect(status().isCreated());
    }
    @Test void invalidosDevuelven400() throws Exception {
        for (String cuerpo : new String[]{"{}", "{", valido.replace("ana@example.test", "correo-malo"),
                valido.replace("\"Ana\"", "\" \""), valido.replace("CLIENTE", "OTRO"),
                valido.replace("\"CLIENTE\",\"PROVEEDOR\",\"CLIENTE\"", "null")}) {
            mvc.perform(post("/api/personas").contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        }
        mvc.perform(get("/api/personas/no-uuid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/personas/rol/OTRO")).andExpect(status().isBadRequest());
    }
    @Test void documentoInmutable() throws Exception {
        String id = crear();
        mvc.perform(put("/api/personas/{id}", id).contentType(MediaType.APPLICATION_JSON).content(valido.replace("123", "999")))
                .andExpect(status().isBadRequest());
    }
    @Test void rolesRequiereConjuntoCompletoPermiteVacio() throws Exception {
        String id = crear();
        for (String cuerpo : new String[]{"{}", "{\"roles\":null}", "{\"roles\":[null]}"}) {
            mvc.perform(put("/api/personas/{id}/roles", id).contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(put("/api/personas/{id}/roles", id).contentType(MediaType.APPLICATION_JSON).content("{\"roles\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles.length()").value(0));
    }
    @Test void inexistentes404() throws Exception {
        String id = UUID.randomUUID().toString();
        mvc.perform(get("/api/personas/{id}", id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/personas/documento/CC/0")).andExpect(status().isNotFound());
        mvc.perform(put("/api/personas/{id}", id).contentType(MediaType.APPLICATION_JSON).content(valido)).andExpect(status().isNotFound());
        mvc.perform(put("/api/personas/{id}/roles", id).contentType(MediaType.APPLICATION_JSON).content("{\"roles\":[]}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/personas/{id}", id)).andExpect(status().isNotFound());
    }
    @Test void putConservaRolesEIdentidadAunqueSeEnvienOtros() throws Exception {
        String id = crear();
        String cuerpo = valido.replace("\"CLIENTE\",\"PROVEEDOR\",\"CLIENTE\"", "\"ADMINISTRADOR\"")
                .replace("{", "{\"id\":\"" + UUID.randomUUID() + "\",\"activo\":false,");
        mvc.perform(put("/api/personas/{id}", id).contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.activo").value(true)).andExpect(jsonPath("$.roles.length()").value(2));
    }
}
