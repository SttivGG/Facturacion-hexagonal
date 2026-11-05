package com.sttiv.facturacion.application;

import com.sttiv.facturacion.PersonasEnMemoria;
import com.sttiv.facturacion.application.command.PersonaCommand;
import com.sttiv.facturacion.application.usecase.PersonaService;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.assertj.core.api.Assertions.*;

class PersonaServiceTests {
    PersonasEnMemoria repositorio;
    PersonaService servicio;
    final Instant ahora = Instant.parse("2026-11-04T12:00:00Z");
    public static PersonaCommand datos(String tipo, String numero, String nombres, String correo) {
        return new PersonaCommand(tipo, numero, nombres, "Ejemplo", correo, "3000000000", null,
                "Calle ficticia", "Mocoa", "Putumayo", "Colombia", LocalDate.of(2000, 1, 2), "Prueba");
    }
    Persona crear() { return servicio.crear(datos(" CC ", " 123 ", " Ana ", "ana@example.test"), Set.of(RolPersona.CLIENTE)); }
    @BeforeEach void preparar() {
        repositorio = new PersonasEnMemoria();
        servicio = new PersonaService(repositorio, Clock.fixed(ahora, ZoneOffset.UTC));
    }
    @Test void crearConIdentidadFechasYNormalizacion() {
        var p = crear();
        assertThat(p.id()).isNotNull();
        assertThat(p.tipoDocumento()).isEqualTo("CC");
        assertThat(p.numeroDocumento()).isEqualTo("123");
        assertThat(p.nombres()).isEqualTo("Ana");
        assertThat(p.fechaCreacion()).isEqualTo(ahora);
        assertThat(p.fechaActualizacion()).isEqualTo(ahora);
        assertThat(p.activo()).isTrue();
        assertThat(p.id().toString()).hasSize(36); // Compatible con proveedorId de productos.
    }
    @Test void documentosDuplicadosInclusoInactivos() {
        var p = crear(); servicio.desactivar(p.id());
        assertThatThrownBy(this::crear).isInstanceOf(DocumentoDuplicadoException.class);
    }
    @Test void fechasConPrecisionDeMilisegundos() {
        servicio = new PersonaService(repositorio, Clock.fixed(ahora.plusNanos(123456789), ZoneOffset.UTC));
        var p = crear();
        assertThat(p.fechaCreacion()).isEqualTo(ahora.plusMillis(123));
        assertThat(p.fechaActualizacion()).isEqualTo(p.fechaCreacion());
    }
    @Test void permiteMismoNumeroConOtroTipo() {
        crear();
        servicio.crear(datos("CE", "123", "Otra", null), Set.of());
        assertThat(repositorio.datos).hasSize(2);
    }
    @Test void consultarPorIdYDocumento() {
        var p = crear();
        assertThat(servicio.consultar(p.id())).isEqualTo(p);
        assertThat(servicio.buscarPorDocumento(" CC ", " 123 ")).isEqualTo(p);
    }
    @Test void actualizarConservaIdentidadRolesEstadoYCreacion() {
        var p = crear(); servicio.desactivar(p.id());
        var posterior = new PersonaService(repositorio, Clock.fixed(ahora.plusSeconds(10), ZoneOffset.UTC));
        var editada = posterior.actualizar(p.id(), datos("CC", "123", "Ana María", "nueva@example.test"));
        assertThat(editada.id()).isEqualTo(p.id());
        assertThat(editada.roles()).isEqualTo(p.roles());
        assertThat(editada.activo()).isFalse();
        assertThat(editada.fechaCreacion()).isEqualTo(p.fechaCreacion());
        assertThat(editada.fechaActualizacion()).isEqualTo(ahora.plusSeconds(10));
        assertThat(editada.nombres()).isEqualTo("Ana María");
    }
    @Test void rechazaCambiosDeDocumento() {
        var p = crear();
        for (var c : List.of(datos("CE", "123", "Ana", null), datos("CC", "999", "Ana", null))) {
            assertThatThrownBy(() -> servicio.actualizar(p.id(), c)).isInstanceOf(DatosInvalidosException.class);
        }
        assertThat(servicio.consultar(p.id())).isEqualTo(p);
    }
    @Test void multiplesRolesSinDuplicadosNiMutacionExterna() {
        var roles = new HashSet<>(List.of(RolPersona.CLIENTE, RolPersona.PROVEEDOR, RolPersona.CLIENTE));
        var p = servicio.crear(datos("CC", "123", "Ana", null), roles);
        roles.clear();
        assertThat(p.roles()).containsExactlyInAnyOrder(RolPersona.CLIENTE, RolPersona.PROVEEDOR);
        assertThatThrownBy(() -> p.roles().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test void asignarYRetirarTodosLosRoles() {
        var p = crear();
        servicio.reemplazarRoles(p.id(), Set.of(RolPersona.CLIENTE, RolPersona.PROVEEDOR));
        assertThat(servicio.buscarPorRol(RolPersona.PROVEEDOR)).hasSize(1);
        servicio.reemplazarRoles(p.id(), Set.of(RolPersona.TRABAJADOR));
        assertThat(servicio.buscarPorRol(RolPersona.PROVEEDOR)).isEmpty();
        assertThat(servicio.buscarPorRol(RolPersona.CLIENTE)).isEmpty();
        assertThat(servicio.buscarPorRol(RolPersona.TRABAJADOR)).hasSize(1);
        assertThat(servicio.reemplazarRoles(p.id(), Set.of()).roles()).isEmpty();
    }
    @Test void desactivarEsLogicoEIdempotente() {
        var p = crear(); servicio.desactivar(p.id()); servicio.desactivar(p.id());
        assertThat(servicio.consultar(p.id()).activo()).isFalse();
        assertThat(servicio.buscarPorDocumento("CC", "123").id()).isEqualTo(p.id());
        assertThat(servicio.buscarPorRol(RolPersona.CLIENTE)).hasSize(1);
    }
    @Test void inexistentesEnTodosLosCasos() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> servicio.consultar(id)).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> servicio.buscarPorDocumento("CC", "0")).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> servicio.actualizar(id, datos("CC", "0", "Ana", null))).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> servicio.reemplazarRoles(id, Set.of())).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> servicio.desactivar(id)).isInstanceOf(RecursoNoEncontradoException.class);
    }
    @Test void obligatoriosEnDominio() {
        for (var c : List.of(datos(null, "1", "Ana", null), datos(" ", "1", "Ana", null),
                datos("CC", " ", "Ana", null), datos("CC", null, "Ana", null),
                datos("CC", "1", null, null), datos("CC", "1", " ", null))) {
            assertThatThrownBy(() -> servicio.crear(c, Set.of())).isInstanceOf(DatosInvalidosException.class);
        }
        assertThat(repositorio.datos).isEmpty();
    }
    @Test void correoOpcionalYFormatoInvalido() {
        for (String correo : new String[]{"sin-arroba", "a@", "a@b", "a b@example.test"}) {
            assertThatThrownBy(() -> servicio.crear(datos("CC", "1", "Ana", correo), null))
                    .isInstanceOf(DatosInvalidosException.class);
        }
        assertThat(servicio.crear(datos("CC", "1", "Ana", " "), null).correo()).isNull();
    }
    @Test void rechazaRolesNulosYRolAusente() {
        var p = crear();
        assertThatThrownBy(() -> servicio.reemplazarRoles(p.id(), null)).isInstanceOf(DatosInvalidosException.class);
        assertThatThrownBy(() -> servicio.reemplazarRoles(p.id(), new HashSet<>(Arrays.asList((RolPersona) null))))
                .isInstanceOf(DatosInvalidosException.class);
        assertThatThrownBy(() -> servicio.buscarPorRol(null)).isInstanceOf(DatosInvalidosException.class);
    }
    @Test void limitaListadoPorRol() {
        for (int i = 0; i < 105; i++) servicio.crear(datos("CC", "" + i, "Ana", null), Set.of(RolPersona.CLIENTE));
        assertThat(servicio.buscarPorRol(RolPersona.CLIENTE)).hasSize(100);
    }
}
