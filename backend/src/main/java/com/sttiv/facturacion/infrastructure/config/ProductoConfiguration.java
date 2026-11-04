package com.sttiv.facturacion.infrastructure.config;

import com.sttiv.facturacion.application.port.ProductoUseCase;
import com.sttiv.facturacion.application.usecase.ProductoService;
import com.sttiv.facturacion.domain.port.*;
import com.sttiv.facturacion.infrastructure.adapter.output.mongo.ProductoDocument;
import java.time.Clock;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;

@Configuration
public class ProductoConfiguration {
    @Bean
    ProductoUseCase productoUseCase(ProductoRepositoryPort productos, ImagenStoragePort imagenes) {
        return new ProductoService(productos, imagenes, Clock.systemUTC());
    }

    // El arranque verifica la conexión y asegura la unicidad incluso ante solicitudes concurrentes.
    @Bean
    @ConditionalOnProperty(name = "app.mongodb.initialize", havingValue = "true", matchIfMissing = true)
    InitializingBean indiceSku(MongoTemplate mongo) {
        return () -> mongo.indexOps(ProductoDocument.class)
                .createIndex(new Index().on("sku", Sort.Direction.ASC).unique().named("sku_unico"));
    }
}
