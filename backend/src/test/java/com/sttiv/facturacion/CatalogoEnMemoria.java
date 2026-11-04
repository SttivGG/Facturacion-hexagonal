package com.sttiv.facturacion;

import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.*;
import com.sttiv.facturacion.domain.exception.SkuDuplicadoException;
import java.util.*;

/** Doble de los puertos para probar el núcleo sin MongoDB. */
public class CatalogoEnMemoria implements ProductoRepositoryPort, ImagenStoragePort {
    public final Map<String, Producto> productos = new LinkedHashMap<>();
    public final Map<String, ImagenProducto> imagenes = new HashMap<>();
    @Override public Producto guardar(Producto p) {
        buscarPorSku(p.sku()).filter(otro -> !otro.id().equals(p.id())).ifPresent(otro -> {
            throw new SkuDuplicadoException(p.sku());
        });
        productos.put(p.id(), p);
        return p;
    }
    @Override public Optional<Producto> buscarPorId(String id) { return Optional.ofNullable(productos.get(id)); }
    @Override public Optional<Producto> buscarPorSku(String sku) {
        return productos.values().stream().filter(p -> p.sku().equals(sku)).findFirst();
    }
    @Override public List<Producto> listar() { return List.copyOf(productos.values()); }
    @Override public String guardar(ImagenProducto imagen) {
        String id = UUID.randomUUID().toString();
        imagenes.put(id, imagen);
        return id;
    }
    @Override public Optional<ImagenProducto> buscar(String id) { return Optional.ofNullable(imagenes.get(id)); }
    @Override public void eliminar(String id) { imagenes.remove(id); }
}
