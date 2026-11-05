package com.sttiv.facturacion.infrastructure.config;

import com.datastax.oss.driver.api.core.CqlSession;
import com.sttiv.facturacion.application.port.PersonaUseCase;
import com.sttiv.facturacion.application.usecase.PersonaService;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import com.sttiv.facturacion.infrastructure.adapter.output.cassandra.CassandraPersonaAdapter;
import java.time.Clock;
import org.springframework.context.annotation.*;

@Configuration
public class PersonaConfiguration {
    @Bean PersonaRepositoryPort personaRepository(CqlSession session) { return new CassandraPersonaAdapter(session); }
    @Bean PersonaUseCase personaUseCase(PersonaRepositoryPort personas) {
        return new PersonaService(personas, Clock.systemUTC());
    }
}
