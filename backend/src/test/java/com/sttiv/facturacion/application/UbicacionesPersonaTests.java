package com.sttiv.facturacion.application;

import com.sttiv.facturacion.PersonasEnMemoria;
import com.sttiv.facturacion.application.command.PersonaCommand;
import com.sttiv.facturacion.application.usecase.PersonaService;
import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.infrastructure.adapter.output.divipola.DivipolaCatalogoAdapter;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class UbicacionesPersonaTests {
    final DivipolaCatalogoAdapter catalogo = new DivipolaCatalogoAdapter();
    final PersonasEnMemoria repository = new PersonasEnMemoria();
    final PersonaService service = new PersonaService(repository, Clock.systemUTC(), catalogo);

    PersonaCommand command(String pais, String departamento, String ciudad) {
        return new PersonaCommand("CC", "7C", "Persona prueba", null, null, null, null,
                "Calle 7C", ciudad, departamento, pais, null, null);
    }
    Persona legacy(String pais, String departamento, String ciudad) {
        var now = Instant.now();
        return repository.crear(new Persona(UUID.randomUUID(), "CC", "7C", "Legado", null,
                null, null, null, "Calle anterior", ciudad, departamento, pais, null, null,
                Set.of(RolPersona.CLIENTE), true, now, now));
    }

    @Test void cargaLocalCompletaCodigosYTiposSinDuplicados() {
        assertThat(catalogo.municipios()).hasSize(1122);
        assertThat(catalogo.departamentos()).hasSize(33).containsEntry("05", "ANTIOQUIA");
        assertThat(catalogo.municipios()).extracting(DivipolaCatalogoAdapter.Municipio::cod_mpio).doesNotHaveDuplicates().contains("05001");
        assertThat(catalogo.municipios()).allSatisfy(row -> {
            assertThat(row.cod_mpio()).startsWith(row.cod_dpto());
            assertThat(row.tipo_municipio()).isNotBlank();
        });
    }
    @Test void normalizaAcentosEspaciosMayusculasYGuardaOficiales() {
        var person = service.crear(command(" colombia ", "\u00a0 antioquia \u00a0", " medellin "), Set.of(RolPersona.CLIENTE));
        assertThat(person.pais()).isEqualTo("Colombia");
        assertThat(person.departamento()).isEqualTo("ANTIOQUIA");
        assertThat(person.ciudad()).isEqualTo("MEDELLÍN");
        assertThat(service.consultar(person.id())).isEqualTo(person);
    }
    @Test void validaTodasLasCombinacionesDelCatalogo() {
        for (var row : catalogo.municipios()) {
            assertThat(catalogo.normalizar(new UbicacionGeografica("Colombia", row.dpto(), row.nom_mpio())))
                    .isEqualTo(new UbicacionGeografica("Colombia", row.dpto(), row.nom_mpio()));
        }
    }
    @Test void rechazaDepartamentoInexistenteMunicipioAjenoYMunicipioSinDepartamento() {
        for (var value : List.of(command("Colombia", "Antioquia", "Mocoa"), command("Colombia", "Inventado", ""),
                command("Colombia", "", "Mocoa"), command(null, null, "Mocoa"), command(" Colombia ", "Putumayo", "Inventado"))) {
            assertThatThrownBy(() -> service.crear(value, Set.of())).isInstanceOf(DatosInvalidosException.class);
        }
        assertThat(repository.datos).isEmpty();
    }
    @Test void permiteOpcionalesYDepartamentoSinMunicipio() {
        assertThat(catalogo.normalizar(new UbicacionGeografica(null, null, null))).isEqualTo(new UbicacionGeografica(null, null, null));
        assertThat(catalogo.normalizar(new UbicacionGeografica("Colombia", "Putumayo", null)))
                .isEqualTo(new UbicacionGeografica("Colombia", "PUTUMAYO", null));
    }
    @Test void edicionGeograficaValidaYNoEscribeSiEsInvalida() {
        var person = service.crear(command("Colombia", "Putumayo", "Mocoa"), Set.of(RolPersona.CLIENTE));
        assertThatThrownBy(() -> service.actualizar(person.id(), command("Colombia", "Antioquia", "Mocoa")))
                .isInstanceOf(DatosInvalidosException.class);
        assertThat(service.consultar(person.id())).isEqualTo(person);
        var updated = service.actualizar(person.id(), command("Colombia", "antioquia", "medellin"));
        assertThat(updated.ciudad()).isEqualTo("MEDELLÍN");
        assertThat(updated.roles()).containsExactly(RolPersona.CLIENTE);
    }
    @Test void conservaUbicacionLegadaDesconocidaAlEditarContactoYRoles() {
        var old = legacy("Colombia", "Dpto antiguo", "Ciudad dudosa");
        var updated = service.actualizar(old.id(), command(old.pais(), old.departamento(), old.ciudad()));
        assertThat(updated.ciudad()).isEqualTo(old.ciudad());
        assertThat(updated.departamento()).isEqualTo(old.departamento());
        assertThat(updated.direccion()).isEqualTo("Calle 7C");
        service.reemplazarRoles(old.id(), Set.of(RolPersona.PROVEEDOR));
        assertThat(service.consultar(old.id()).ciudad()).isEqualTo(old.ciudad());
        assertThatThrownBy(() -> service.actualizar(old.id(), command("Colombia", old.departamento(), "Otra")))
                .isInstanceOf(DatosInvalidosException.class);
    }
    @Test void conservaVariacionesReconocidasSinNormalizacionAutomatica() {
        var old = legacy("colombia", " putumayo ", "  mocoa ");
        var updated = service.actualizar(old.id(), command(old.pais(), old.departamento(), old.ciudad()));
        assertThat(updated.ciudad()).isEqualTo("  mocoa ");
        assertThat(updated.departamento()).isEqualTo(" putumayo ");
    }
    @Test void conservaYPermiteEditarUbicacionInternacionalExistente() {
        var old = legacy("Ecuador", "Pichincha", "Quito");
        var unchanged = service.actualizar(old.id(), command("Ecuador", "Pichincha", "Quito"));
        assertThat(unchanged.ciudad()).isEqualTo(old.ciudad());
        var updated = service.actualizar(old.id(), command("Ecuador", "Guayas", "Guayaquil"));
        assertThat(updated.pais()).isEqualTo("Ecuador");
        assertThat(updated.ciudad()).isEqualTo("Guayaquil");
        assertThatThrownBy(() -> service.actualizar(old.id(), command("Colombia", "Guayas", "Guayaquil")))
                .isInstanceOf(DatosInvalidosException.class);
    }
    @Test void conservaNulosLegadosYNoActualizaOtrasPersonas() {
        var old = legacy(null, null, null);
        var updated = service.actualizar(old.id(), command(null, null, null));
        assertThat(updated.pais()).isNull();
        assertThat(updated.departamento()).isNull();
        assertThat(updated.ciudad()).isNull();
        assertThat(repository.datos).hasSize(1);
    }
}
