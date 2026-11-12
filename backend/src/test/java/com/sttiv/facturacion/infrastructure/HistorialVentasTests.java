package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.infrastructure.adapter.output.mysql.MySqlHistorialVentasAdapter;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

/** Ejecuta la consulta productiva sobre H2 aislado; emula únicamente CONVERT_TZ de MySQL. */
public class HistorialVentasTests {
    public static LocalDateTime convertTz(LocalDateTime value, String from, String to) {
        return value.atOffset(ZoneOffset.of(from)).withOffsetSameInstant(ZoneOffset.of(to)).toLocalDateTime();
    }
    @Test void agrupaBogotaSinDuplicarPagosYRespetaLimitesUtc() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:ml-history;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("CREATE ALIAS IF NOT EXISTS CONVERT_TZ FOR 'com.sttiv.facturacion.infrastructure.HistorialVentasTests.convertTz'");
        jdbc.execute("CREATE TABLE facturas(fecha_emision TIMESTAMP, total DECIMAL(50,2))");
        jdbc.update("INSERT INTO facturas VALUES ('2026-11-10 04:59:59.999999', 999.00), ('2026-11-10 05:00:00',9007199254.75), ('2026-11-11 04:59:59.999999',0.25), ('2026-11-11 05:00:00',111.00)");
        var rows = new MySqlHistorialVentasAdapter(jdbc).consultar(LocalDate.of(2026,11,10),LocalDate.of(2026,11,11));
        assertEquals(1,rows.size());
        assertEquals(LocalDate.of(2026,11,10), rows.getFirst().fecha());
        assertEquals("9007199255.00", rows.getFirst().total());
        assertTrue(new MySqlHistorialVentasAdapter(jdbc).consultar(LocalDate.of(2020,1,1), LocalDate.of(2020,2,1)).isEmpty());
    }
}
