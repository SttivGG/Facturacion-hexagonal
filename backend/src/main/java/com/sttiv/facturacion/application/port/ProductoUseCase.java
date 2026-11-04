package com.sttiv.facturacion.application.port;

import com.sttiv.facturacion.application.command.ProductoCommand;
import com.sttiv.facturacion.domain.model.ImagenProducto;
import com.sttiv.facturacion.domain.model.Producto;
import java.util.List;

public interface ProductoUseCase {
    Producto crear(ProductoCommand command);
    List<Producto> listar();
    Producto consultar(String id);
    Producto actualizar(String id, ProductoCommand command);
    void desactivar(String id);
    Producto asociarImagen(String id, ImagenProducto imagen);
    ImagenProducto consultarImagen(String id);
}
