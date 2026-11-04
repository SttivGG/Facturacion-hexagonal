package com.sttiv.facturacion.infrastructure.adapter.output.mongo;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface SpringDataProductoRepository extends MongoRepository<ProductoDocument, String> {
    Optional<ProductoDocument> findBySku(String sku);
}
