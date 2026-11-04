package com.sttiv.facturacion.infrastructure.adapter.output.mongo;

import com.sttiv.facturacion.domain.exception.SkuDuplicadoException;
import com.sttiv.facturacion.domain.model.Producto;
import com.sttiv.facturacion.domain.port.ProductoRepositoryPort;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;

@Repository
public class MongoProductoAdapter implements ProductoRepositoryPort {
    private final SpringDataProductoRepository repository;
    public MongoProductoAdapter(SpringDataProductoRepository repository) { this.repository = repository; }
    @Override public Producto guardar(Producto producto) {
        try {
            return repository.save(ProductoDocument.desde(producto)).aDominio();
        } catch (DuplicateKeyException ex) {
            throw new SkuDuplicadoException(producto.sku());
        }
    }
    @Override public Optional<Producto> buscarPorId(String id) {
        return repository.findById(id).map(ProductoDocument::aDominio);
    }
    @Override public Optional<Producto> buscarPorSku(String sku) {
        return repository.findBySku(sku).map(ProductoDocument::aDominio);
    }
    @Override public List<Producto> listar() {
        return repository.findAll().stream().map(ProductoDocument::aDominio).toList();
    }
}
