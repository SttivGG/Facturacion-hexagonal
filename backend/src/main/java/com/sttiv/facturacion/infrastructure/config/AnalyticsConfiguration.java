package com.sttiv.facturacion.infrastructure.config;

import com.sttiv.facturacion.application.usecase.PrepararSnapshotFacturacion;
import com.sttiv.facturacion.domain.port.FacturaRepositoryPort;
import com.sttiv.facturacion.infrastructure.adapter.output.druid.*;
import com.sttiv.facturacion.infrastructure.analytics.CoordinadorSincronizacion;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(DruidProperties.class)
public class AnalyticsConfiguration {
    @Bean DruidHttpClient druidHttpClient(DruidProperties config, JsonMapper json) { return new DruidHttpClient(config, json); }
    @Bean DruidAnalyticsAdapter druidAnalyticsAdapter(DruidHttpClient http, DruidProperties config) { return new DruidAnalyticsAdapter(http, config); }
    @Bean PrepararSnapshotFacturacion prepararSnapshotFacturacion(FacturaRepositoryPort facturas) { return new PrepararSnapshotFacturacion(facturas); }
    @Bean CoordinadorSincronizacion coordinadorSincronizacion(DruidProperties config, PrepararSnapshotFacturacion preparar, DruidAnalyticsAdapter adapter) {
        return new CoordinadorSincronizacion(config, preparar, adapter, adapter);
    }
}
