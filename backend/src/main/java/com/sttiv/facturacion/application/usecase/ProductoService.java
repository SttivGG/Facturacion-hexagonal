package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.command.ProductoCommand;
import com.sttiv.facturacion.application.port.ProductoUseCase;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.*;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class ProductoService implements ProductoUseCase {
    public static final int MAX_IMAGEN_BYTES = 3 * 1024 * 1024;
    private final ProductoRepositoryPort productos;
    private final ImagenStoragePort imagenes;
    private final PersonaRepositoryPort personas;
    private final Clock clock;

    public ProductoService(ProductoRepositoryPort productos, ImagenStoragePort imagenes,
            PersonaRepositoryPort personas, Clock clock) {
        this.productos = productos;
        this.imagenes = imagenes;
        this.personas = personas;
        this.clock = clock;
    }

    @Override
    public Producto crear(ProductoCommand c) {
        Instant ahora = clock.instant();
        Producto producto = new Producto(UUID.randomUUID().toString(), c.sku(), c.nombre(),
                c.descripcion(), c.categoria(), c.costo(), c.precioVenta(), validarProveedor(c.proveedorId()),
                true, null, ahora, ahora);
        validarSku(producto);
        return productos.guardar(producto);
    }

    private void validarSku(Producto producto) {
        productos.buscarPorSku(producto.sku()).filter(p -> !p.id().equals(producto.id()))
                .ifPresent(p -> { throw new SkuDuplicadoException(producto.sku()); });
    }

    @Override public List<Producto> listar() { return productos.listar(); }

    @Override public Producto consultar(String id) {
        return productos.buscarPorId(id).orElseThrow(
                () -> new RecursoNoEncontradoException("Producto no encontrado: " + id));
    }

    @Override public Producto actualizar(String id, ProductoCommand c) {
        Producto anterior = consultar(id);
        // Las referencias históricas sin cambios no dependen de la disponibilidad de Cassandra.
        String proveedorId = Objects.equals(anterior.proveedorId(), c.proveedorId())
                ? anterior.proveedorId() : validarProveedor(c.proveedorId());
        Producto actualizado = new Producto(id, c.sku(), c.nombre(), c.descripcion(), c.categoria(),
                c.costo(), c.precioVenta(), proveedorId, anterior.activo(), anterior.imagenId(),
                anterior.fechaCreacion(), clock.instant());
        validarSku(actualizado);
        return productos.guardar(actualizado);
    }

    private String validarProveedor(String referencia) {
        if (referencia == null || referencia.isBlank()) return null;
        String valor = referencia.trim();
        UUID id;
        try {
            id = UUID.fromString(valor);
            if (!id.toString().equalsIgnoreCase(valor)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) {
            throw new DatosInvalidosException("El identificador del proveedor debe ser un UUID válido");
        }
        Persona proveedor = personas.buscarPorId(id).orElseThrow(
                () -> new DatosInvalidosException("El proveedor seleccionado no existe"));
        if (!proveedor.activo()) throw new DatosInvalidosException("El proveedor seleccionado está inactivo");
        if (!proveedor.roles().contains(RolPersona.PROVEEDOR)) {
            throw new DatosInvalidosException("La persona seleccionada no tiene rol PROVEEDOR");
        }
        return id.toString();
    }

    @Override public void desactivar(String id) {
        productos.guardar(consultar(id).desactivar(clock.instant()));
    }

    @Override public Producto asociarImagen(String id, ImagenProducto imagen) {
        Producto anterior = consultar(id);
        validarImagen(imagen);
        String nuevaId = imagenes.guardar(imagen);
        Producto guardado;
        try {
            guardado = productos.guardar(anterior.conImagen(nuevaId, clock.instant()));
        } catch (RuntimeException ex) {
            try { imagenes.eliminar(nuevaId); } catch (RuntimeException limpieza) { ex.addSuppressed(limpieza); }
            throw ex;
        }
        if (anterior.imagenId() != null) imagenes.eliminar(anterior.imagenId());
        return guardado;
    }

    @Override public ImagenProducto consultarImagen(String id) {
        Producto producto = consultar(id);
        if (producto.imagenId() == null) throw new RecursoNoEncontradoException("El producto no tiene imagen");
        return imagenes.buscar(producto.imagenId()).orElseThrow(
                () -> new RecursoNoEncontradoException("Imagen no encontrada"));
    }

    private void validarImagen(ImagenProducto imagen) {
        if (imagen == null || imagen.contenido() == null || imagen.contenido().length == 0
                || imagen.contenido().length > MAX_IMAGEN_BYTES) {
            throw new DatosInvalidosException("La imagen debe contener entre 1 byte y 3 MB");
        }
        byte[] b = imagen.contenido();
        boolean valida = switch (imagen.tipoContenido() == null ? "" : imagen.tipoContenido()) {
            case "image/jpeg" -> b.length >= 3 && (b[0] & 255) == 255 && (b[1] & 255) == 216 && (b[2] & 255) == 255;
            case "image/png" -> b.length >= 8 && (b[0] & 255) == 137 && b[1] == 80 && b[2] == 78 && b[3] == 71
                    && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10;
            case "image/webp" -> b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
            default -> false;
        };
        if (!valida) throw new DatosInvalidosException("Formato inválido: se admite JPEG, PNG o WebP con su MIME correspondiente");
    }
}
