package com.sttiv.facturacion.infrastructure;

import com.datastax.oss.driver.api.core.CqlSession;
import com.mongodb.client.MongoClient;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Opt-in: ejecutar dentro de la red Compose con las credenciales MySQL del entorno. */
@EnabledIfSystemProperty(named = "app.mysql.integration", matches = "true")
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:mysql://${MYSQL_HOST:facturacion-mysql}:3306/${MYSQL_DATABASE:facturacion_ventas}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true",
    "spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver",
    "spring.datasource.username=${MYSQL_USER:facturacion_app}",
    "spring.datasource.password=${MYSQL_PASSWORD:}",
    "spring.jpa.hibernate.ddl-auto=validate",
    "spring.flyway.enabled=true"
})
class MySqlFacturaIntegrationTests extends FacturaPersistenciaContract {
    @MockitoBean MongoClient mongoClient;
    @MockitoBean CqlSession cqlSession;
    @MockitoBean PersonaRepositoryPort personas;
}
