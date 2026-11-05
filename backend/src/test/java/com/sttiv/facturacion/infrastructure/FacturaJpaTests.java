package com.sttiv.facturacion.infrastructure;

import com.datastax.oss.driver.api.core.CqlSession;
import com.mongodb.client.MongoClient;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class FacturaJpaTests extends FacturaPersistenciaContract {
    @MockitoBean MongoClient mongoClient;
    @MockitoBean CqlSession cqlSession;
    @MockitoBean PersonaRepositoryPort personas;
}
