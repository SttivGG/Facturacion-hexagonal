package com.sttiv.facturacion.infrastructure.config;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("app.ml")
public record MlProperties(@DefaultValue("false") boolean enabled,
        @DefaultValue("http://localhost:8000") URI baseUrl, @DefaultValue("PT10S") Duration httpTimeout,
        @DefaultValue("false") boolean demoEnabled) {
    public MlProperties(boolean enabled, URI baseUrl, Duration httpTimeout) { this(enabled, baseUrl, httpTimeout, false); }
    @ConstructorBinding
    public MlProperties {
        if (httpTimeout.isNegative() || httpTimeout.isZero() || httpTimeout.compareTo(Duration.ofSeconds(15)) > 0)
            throw new IllegalArgumentException("ML_HTTP_TIMEOUT debe ser positivo y como máximo PT15S");
        if (!java.util.Set.of("http", "https").contains(baseUrl.getScheme()) || baseUrl.getHost() == null)
            throw new IllegalArgumentException("ML_BASE_URL debe ser una URL HTTP válida");
    }
}
