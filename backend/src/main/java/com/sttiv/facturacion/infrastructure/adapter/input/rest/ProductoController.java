package com.sttiv.facturacion.infrastructure.adapter.input.rest;

import com.sttiv.facturacion.application.port.ProductoUseCase;
import com.sttiv.facturacion.domain.model.ImagenProducto;
import com.sttiv.facturacion.infrastructure.adapter.input.rest.dto.*;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/productos")
public class ProductoController {
    private final ProductoUseCase productos;
    public ProductoController(ProductoUseCase productos) { this.productos = productos; }

    @PostMapping
    public ResponseEntity<ProductoResponse> crear(@Valid @RequestBody ProductoRequest request) {
        var producto = productos.crear(request.aCommand());
        return ResponseEntity.created(URI.create("/api/productos/" + producto.id()))
                .body(ProductoResponse.desde(producto));
    }
    @GetMapping public List<ProductoResponse> listar() {
        return productos.listar().stream().map(ProductoResponse::desde).toList();
    }
    @GetMapping("/{id}") public ProductoResponse consultar(@PathVariable String id) {
        return ProductoResponse.desde(productos.consultar(id));
    }
    @PutMapping("/{id}") public ProductoResponse actualizar(@PathVariable String id,
            @Valid @RequestBody ProductoRequest request) {
        return ProductoResponse.desde(productos.actualizar(id, request.aCommand()));
    }
    @DeleteMapping("/{id}") public ResponseEntity<Void> desactivar(@PathVariable String id) {
        productos.desactivar(id);
        return ResponseEntity.noContent().build();
    }
    @PostMapping(value = "/{id}/imagen", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductoResponse imagen(@PathVariable String id, @RequestParam("imagen") MultipartFile imagen)
            throws IOException {
        return ProductoResponse.desde(productos.asociarImagen(id,
                new ImagenProducto(imagen.getBytes(), imagen.getContentType())));
    }
    @GetMapping("/{id}/imagen") public ResponseEntity<byte[]> consultarImagen(@PathVariable String id) {
        var imagen = productos.consultarImagen(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(imagen.tipoContenido()))
                .contentLength(imagen.contenido().length).header("X-Content-Type-Options", "nosniff")
                .body(imagen.contenido());
    }
}
