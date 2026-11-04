package com.sttiv.facturacion.domain.port;

import com.sttiv.facturacion.domain.model.ImagenProducto;
import java.util.Optional;

public interface ImagenStoragePort {
    String guardar(ImagenProducto imagen);
    Optional<ImagenProducto> buscar(String id);
    void eliminar(String id);
}
