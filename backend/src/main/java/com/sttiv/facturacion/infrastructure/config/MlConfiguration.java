package com.sttiv.facturacion.infrastructure.config;

import com.sttiv.facturacion.application.port.PrediccionUseCase;
import com.sttiv.facturacion.application.port.DemostracionUseCase;
import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.application.usecase.PrediccionService;
import com.sttiv.facturacion.application.usecase.DemostracionService;
import com.sttiv.facturacion.infrastructure.adapter.output.ml.MlHttpAdapter;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableConfigurationProperties(MlProperties.class)
public class MlConfiguration {
    @Bean MlHttpAdapter prediccionPort(MlProperties config, JsonMapper json) { return new MlHttpAdapter(config, json); }
    @Bean PrediccionUseCase prediccionUseCase(MlProperties config, HistorialVentasPort historial, PrediccionPort predictor) {
        return new PrediccionService(config.enabled(), historial, predictor, Clock.systemUTC());
    }
    @Bean DemostracionUseCase demostracionUseCase(MlProperties config, DemostracionPort predictor) {
        return new DemostracionService(config.enabled() && config.demoEnabled(), predictor);
    }
}
