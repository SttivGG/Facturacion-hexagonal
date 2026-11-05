package com.sttiv.facturacion.infrastructure.config;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.druid")
public record DruidProperties(boolean enabled, URI baseUrl, Duration syncInterval,
        Duration httpTimeout, Duration taskTimeout, Duration pollInterval, int maxRequestBytes) {
    public DruidProperties {
        if (baseUrl == null) baseUrl = URI.create("http://localhost:8888");
        if (syncInterval == null) syncInterval = Duration.ofMinutes(1);
        if (httpTimeout == null) httpTimeout = Duration.ofSeconds(10);
        if (taskTimeout == null) taskTimeout = Duration.ofMinutes(8);
        if (pollInterval == null) pollInterval = Duration.ofSeconds(2);
        if (maxRequestBytes == 0) maxRequestBytes = 1_000_000;
        if (!java.util.Set.of("http", "https").contains(baseUrl.getScheme()) || baseUrl.getHost() == null
                || baseUrl.getUserInfo() != null || baseUrl.getQuery() != null || baseUrl.getFragment() != null
                || syncInterval.isNegative() || syncInterval.isZero() || httpTimeout.isNegative() || httpTimeout.isZero()
                || taskTimeout.isNegative() || taskTimeout.isZero() || pollInterval.isNegative() || pollInterval.isZero()
                || maxRequestBytes < 1024 || maxRequestBytes > 2_000_000) {
            throw new IllegalArgumentException("Configuración Druid inválida");
        }
    }
}
