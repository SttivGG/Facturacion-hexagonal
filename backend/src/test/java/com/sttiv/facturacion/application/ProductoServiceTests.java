package com.sttiv.facturacion.application;

import com.sttiv.facturacion.CatalogoEnMemoria;
import com.sttiv.facturacion.application.command.ProductoCommand;
import com.sttiv.facturacion.application.usecase.ProductoService;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.Optional;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProductoServiceTests {
    CatalogoEnMemoria catalogo;
    ProductoService service;
    PersonaRepositoryPort personas = mock(PersonaRepositoryPort.class);
    final Instant ahora = Instant.parse("2026-11-03T12:00:00Z");

    @BeforeEach void preparar() {
        catalogo = new CatalogoEnMemoria();
        service = new ProductoService(catalogo, catalogo, personas, Clock.fixed(ahora, ZoneOffset.UTC));
    }
    ProductoCommand datos(String sku) {
        return new ProductoCommand(sku, "Café", "Molido", "Alimentos",
                new BigDecimal("12345.67"), new BigDecimal("19000.99"), null);
    }
    @Test void crearConDecimalesYFechas() {
        Producto p = service.crear(datos(" SKU-1 "));
        assertThat(p.id()).isNotBlank();
        assertThat(p.sku()).isEqualTo("SKU-1");
        assertThat(p.activo()).isTrue();
        assertThat(p.costo()).isEqualByComparingTo("12345.67");
        assertThat(p.precioVenta()).isEqualByComparingTo("19000.99");
        assertThat(p.fechaCreacion()).isEqualTo(ahora);
        assertThat(p.fechaActualizacion()).isEqualTo(ahora);
        assertThat(p.imagenId()).isNull();
    }
    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = {" ", "\t"})
    void rechazarSkuYNombreVacios(String valor) {
        assertThatThrownBy(() -> service.crear(datos(valor))).isInstanceOf(DatosInvalidosException.class);
        var c = datos("SKU");
        assertThatThrownBy(() -> service.crear(new ProductoCommand(c.sku(), valor, null, null,
                c.costo(), c.precioVenta(), null))).isInstanceOf(DatosInvalidosException.class);
    }
    @ParameterizedTest @ValueSource(strings = {"-0.01", "0.001", "100000000000000000000000000000000"})
    void rechazarImportesInvalidos(String valor) {
        var c = datos("SKU");
        assertThatThrownBy(() -> service.crear(new ProductoCommand(c.sku(), c.nombre(), null, null,
                new BigDecimal(valor), c.precioVenta(), null))).isInstanceOf(DatosInvalidosException.class);
        assertThatThrownBy(() -> service.crear(new ProductoCommand(c.sku(), c.nombre(), null, null,
                c.costo(), new BigDecimal(valor), null))).isInstanceOf(DatosInvalidosException.class);
    }
    @Test void aceptarCeroYRechazarImportesAusentes() {
        service.crear(new ProductoCommand("CERO", "Gratis", null, null, BigDecimal.ZERO, BigDecimal.ZERO, null));
        assertThatThrownBy(() -> service.crear(new ProductoCommand("NULL", "Ausente", null, null,
                null, BigDecimal.ZERO, null))).isInstanceOf(DatosInvalidosException.class);
    }
    @Test void duplicadoInclusoDesactivado() {
        Producto p = service.crear(datos("SKU"));
        service.desactivar(p.id());
        assertThatThrownBy(() -> service.crear(datos(" SKU "))).isInstanceOf(SkuDuplicadoException.class);
    }
    @Test void consultarListarActualizarSinCambiarCreacionNiEstado() {
        Producto p = service.crear(datos("SKU"));
        assertThat(service.consultar(p.id())).isEqualTo(p);
        assertThat(service.listar()).containsExactly(p);
        service = new ProductoService(catalogo, catalogo, personas, Clock.fixed(ahora.plusSeconds(60), ZoneOffset.UTC));
        Producto editado = service.actualizar(p.id(), datos("NUEVO"));
        assertThat(editado.id()).isEqualTo(p.id());
        assertThat(editado.sku()).isEqualTo("NUEVO");
        assertThat(editado.fechaCreacion()).isEqualTo(ahora);
        assertThat(editado.fechaActualizacion()).isEqualTo(ahora.plusSeconds(60));
        service.actualizar(p.id(), datos("NUEVO")); // El propio SKU no es un duplicado.
    }
    @Test void actualizarNoPermiteSkuAjeno() {
        service.crear(datos("A"));
        Producto b = service.crear(datos("B"));
        assertThatThrownBy(() -> service.actualizar(b.id(), datos("A"))).isInstanceOf(SkuDuplicadoException.class);
        assertThat(service.consultar(b.id()).sku()).isEqualTo("B");
    }
    @Test void desactivarConservaRegistroYNoReactivaAlActualizar() {
        Producto p = service.crear(datos("SKU"));
        service.desactivar(p.id());
        service.desactivar(p.id());
        assertThat(service.listar()).hasSize(1);
        assertThat(service.actualizar(p.id(), datos("SKU")).activo()).isFalse();
    }
    @Test void inexistentes() {
        assertThatThrownBy(() -> service.consultar("ausente")).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> service.actualizar("ausente", datos("SKU"))).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> service.desactivar("ausente")).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> service.consultarImagen("ausente")).isInstanceOf(RecursoNoEncontradoException.class);
        assertThatThrownBy(() -> service.asociarImagen("ausente", null)).isInstanceOf(RecursoNoEncontradoException.class);
    }
    @Test void imagenSeRecuperaYReemplazaEliminandoLaAnterior() {
        Producto p = service.crear(datos("SKU"));
        assertThatThrownBy(() -> service.consultarImagen(p.id())).isInstanceOf(RecursoNoEncontradoException.class);
        var imagen = new ImagenProducto(new byte[]{(byte)255, (byte)216, (byte)255, 0}, "image/jpeg");
        Producto primero = service.asociarImagen(p.id(), imagen);
        assertThat(service.consultarImagen(p.id()).contenido()).isEqualTo(imagen.contenido());
        Producto segundo = service.asociarImagen(p.id(), imagen);
        assertThat(segundo.imagenId()).isNotEqualTo(primero.imagenId());
        assertThat(catalogo.imagenes).hasSize(1).containsKey(segundo.imagenId());
        assertThat(service.actualizar(p.id(), datos("SKU")).imagenId()).isEqualTo(segundo.imagenId());
    }
    @Test void formatosTamanoYContenidoInvalidos() {
        String id = service.crear(datos("SKU")).id();
        for (ImagenProducto imagen : new ImagenProducto[]{
                new ImagenProducto(new byte[0], "image/png"),
                new ImagenProducto(new byte[ProductoService.MAX_IMAGEN_BYTES + 1], "image/png"),
                new ImagenProducto(new byte[]{1, 2, 3}, "image/png"),
                new ImagenProducto(new byte[]{1}, "image/gif"),
                new ImagenProducto(new byte[]{1}, null)}) {
            assertThatThrownBy(() -> service.asociarImagen(id, imagen)).isInstanceOf(DatosInvalidosException.class);
        }
        assertThat(catalogo.imagenes).isEmpty();
    }
    @Test void aceptaPngWebpYLimiteDeTresMb() {
        String id = service.crear(datos("SKU")).id();
        byte[] png = new byte[ProductoService.MAX_IMAGEN_BYTES];
        System.arraycopy(new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10}, 0, png, 0, 8);
        service.asociarImagen(id, new ImagenProducto(png, "image/png"));
        byte[] webp = new byte[]{'R','I','F','F',0,0,0,0,'W','E','B','P'};
        service.asociarImagen(id, new ImagenProducto(webp, "image/webp"));
        assertThat(service.consultarImagen(id).contenido()).isEqualTo(webp);
    }
    @Test void errorAlGuardarReferenciaRevierteImagenNuevaYConservaAnterior() {
        var productos = mock(ProductoRepositoryPort.class);
        var imagenes = mock(ImagenStoragePort.class);
        Producto p = service.crear(datos("SKU")).conImagen("anterior", ahora);
        when(productos.buscarPorId(p.id())).thenReturn(Optional.of(p));
        when(imagenes.guardar(any())).thenReturn("nueva");
        when(productos.guardar(any())).thenThrow(new IllegalStateException("fallo de escritura"));
        var caso = new ProductoService(productos, imagenes, personas, Clock.systemUTC());
        assertThatThrownBy(() -> caso.asociarImagen(p.id(), new ImagenProducto(
                new byte[]{(byte)255,(byte)216,(byte)255}, "image/jpeg")))
                .isInstanceOf(IllegalStateException.class);
        verify(imagenes).eliminar("nueva");
        verify(imagenes, never()).eliminar("anterior");
    }
}
