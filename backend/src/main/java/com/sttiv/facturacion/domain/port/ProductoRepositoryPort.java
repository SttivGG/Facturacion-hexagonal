package com.sttiv.facturacion.domain.port;

import com.sttiv.facturacion.domain.model.Producto;
import java.util.List;
import java.util.Optional;

public interface ProductoRepositoryPort {
    Producto guardar(Producto producto);
    Optional<Producto> buscarPorId(String id);
    Optional<Producto> buscarPorSku(String sku);
    List<Producto> listar();
}
