package com.sttiv.facturacion.application;

import com.sttiv.facturacion.CatalogoEnMemoria;
import com.sttiv.facturacion.application.command.ProductoCommand;
import com.sttiv.facturacion.application.usecase.ProductoService;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProductoProveedorTests {
    final Instant ahora = Instant.parse("2026-11-05T12:00:00Z");
    CatalogoEnMemoria catalogo;
    PersonaRepositoryPort personas;
    ProductoService service;

    @BeforeEach void preparar() {
        catalogo = new CatalogoEnMemoria();
        personas = mock(PersonaRepositoryPort.class);
        service = new ProductoService(catalogo, catalogo, personas, Clock.fixed(ahora, ZoneOffset.UTC));
    }

    ProductoCommand datos(String proveedor) {
        return new ProductoCommand("SKU", "Producto editado", null, null, BigDecimal.ONE, BigDecimal.TEN, proveedor);
    }

    Persona persona(UUID id, boolean activo, Set<RolPersona> roles) {
        return new Persona(id, "NIT", "900123", "Proveedor", "Registrado", null, null, null,
                null, "Mocoa", "Putumayo", "Colombia", null, null, roles, activo, ahora, ahora);
    }

    Producto historico(String proveedor) {
        return catalogo.guardar(new Producto("historico", "SKU", "Producto anterior", null, null,
                BigDecimal.ZERO, BigDecimal.ONE, proveedor, true, "imagen-historica", ahora, ahora));
    }

    @Test void crearConProveedorActivoGuardaUuidYCotejaCassandra() {
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenReturn(Optional.of(persona(id, true, Set.of(RolPersona.PROVEEDOR, RolPersona.CLIENTE))));
        Producto creado = service.crear(datos(id.toString()));
        assertThat(creado.proveedorId()).isEqualTo(id.toString());
        assertThat(catalogo.productos.get(creado.id())).isEqualTo(creado);
        verify(personas).buscarPorId(id);
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = {" ", "\t"})
    void crearSinProveedorNoConsultaCassandra(String proveedor) {
        assertThat(service.crear(datos(proveedor)).proveedorId()).isNull();
        verifyNoInteractions(personas);
    }

    @ParameterizedTest @ValueSource(strings = {"texto", "1-1-1-1-1", "00000000-0000-0000-0000-00000000000z"})
    void uuidInvalidoNoConsultaNiEscribe(String proveedor) {
        assertThatThrownBy(() -> service.crear(datos(proveedor))).isInstanceOf(DatosInvalidosException.class);
        assertThat(catalogo.productos).isEmpty();
        verifyNoInteractions(personas);
    }

    @Test void proveedorInexistenteNoEscribe() {
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.crear(datos(id.toString())))
                .isInstanceOf(DatosInvalidosException.class).hasMessageContaining("no existe");
        assertThat(catalogo.productos).isEmpty();
    }

    @Test void proveedorInactivoNoEscribe() {
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenReturn(Optional.of(persona(id, false, Set.of(RolPersona.PROVEEDOR))));
        assertThatThrownBy(() -> service.crear(datos(id.toString())))
                .isInstanceOf(DatosInvalidosException.class).hasMessageContaining("inactivo");
        assertThat(catalogo.productos).isEmpty();
    }

    @Test void personaSinRolProveedorNoEscribe() {
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenReturn(Optional.of(persona(id, true, Set.of(RolPersona.CLIENTE))));
        assertThatThrownBy(() -> service.crear(datos(id.toString())))
                .isInstanceOf(DatosInvalidosException.class).hasMessageContaining("rol PROVEEDOR");
        assertThat(catalogo.productos).isEmpty();
    }

    @Test void asignarYCambiarProveedorValidaAmbasAsociaciones() {
        Producto original = historico(null);
        for (int i = 0; i < 2; i++) {
            UUID id = UUID.randomUUID();
            when(personas.buscarPorId(id)).thenReturn(Optional.of(persona(id, true, Set.of(RolPersona.PROVEEDOR))));
            Producto editado = service.actualizar(original.id(), datos(id.toString()));
            assertThat(editado.proveedorId()).isEqualTo(id.toString());
            assertThat(editado.imagenId()).isEqualTo("imagen-historica");
            assertThat(editado.fechaCreacion()).isEqualTo(original.fechaCreacion());
            verify(personas).buscarPorId(id);
        }
    }

    @Test void retirarProveedorNoConsultaCassandra() {
        Producto original = historico(UUID.randomUUID().toString());
        Producto editado = service.actualizar(original.id(), datos(null));
        assertThat(editado.proveedorId()).isNull();
        assertThat(editado.imagenId()).isEqualTo(original.imagenId());
        verifyNoInteractions(personas);
    }

    @ParameterizedTest @ValueSource(strings = {"proveedor-antiguo", "  referencia histórica  ", "7d000000-0000-4000-8000-000000000001"})
    void referenciaHistoricaSinCambiosSeConservaAunqueCassandraNoEsteDisponible(String proveedor) {
        Producto original = historico(proveedor);
        when(personas.buscarPorId(any())).thenThrow(new PersistenciaPersonaException("Cassandra no disponible", null));
        Producto editado = service.actualizar(original.id(), datos(proveedor));
        assertThat(editado.nombre()).isEqualTo("Producto editado");
        assertThat(editado.proveedorId()).isEqualTo(proveedor);
        assertThat(editado.imagenId()).isEqualTo(original.imagenId());
        verifyNoInteractions(personas);
    }

    @Test void cambioInvalidoConservaProductoAnterior() {
        Producto original = historico("referencia-antigua");
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenReturn(Optional.of(persona(id, false, Set.of(RolPersona.PROVEEDOR))));
        assertThatThrownBy(() -> service.actualizar(original.id(), datos(id.toString())))
                .isInstanceOf(DatosInvalidosException.class);
        assertThat(catalogo.productos.get(original.id())).isEqualTo(original);
    }

    @Test void falloCassandraAlAsignarNoEscribeNiEliminaReferenciaAnterior() {
        Producto original = historico("referencia-antigua");
        UUID id = UUID.randomUUID();
        when(personas.buscarPorId(id)).thenThrow(new PersistenciaPersonaException("Cassandra no disponible", null));
        assertThatThrownBy(() -> service.actualizar(original.id(), datos(id.toString())))
                .isInstanceOf(PersistenciaPersonaException.class);
        assertThatThrownBy(() -> service.crear(datos(id.toString())))
                .isInstanceOf(PersistenciaPersonaException.class);
        assertThat(catalogo.productos).containsOnlyKeys(original.id());
        assertThat(catalogo.productos.get(original.id())).isEqualTo(original);
    }
}
