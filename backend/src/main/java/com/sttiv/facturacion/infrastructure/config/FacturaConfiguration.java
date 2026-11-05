package com.sttiv.facturacion.infrastructure.config;

import com.sttiv.facturacion.application.port.FacturaUseCase;
import com.sttiv.facturacion.application.usecase.FacturaService;
import com.sttiv.facturacion.domain.port.*;
import java.time.Clock;
import org.springframework.context.annotation.*;

@Configuration
public class FacturaConfiguration {
    @Bean FacturaUseCase facturaUseCase(FacturaRepositoryPort facturas,
            PersonaRepositoryPort personas, ProductoRepositoryPort productos) {
        return new FacturaService(facturas, personas, productos, Clock.systemUTC());
    }
}
