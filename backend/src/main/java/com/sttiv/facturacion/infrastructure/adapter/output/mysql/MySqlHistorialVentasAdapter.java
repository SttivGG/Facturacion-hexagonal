package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import com.sttiv.facturacion.application.prediction.*;
import java.time.*;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class MySqlHistorialVentasAdapter implements HistorialVentasPort {
    private final JdbcTemplate jdbc;
    public MySqlHistorialVentasAdapter(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override @Transactional(readOnly = true)
    public List<Prediccion.Dia> consultar(LocalDate desde, LocalDate hasta) {
        var bogota = ZoneId.of("America/Bogota");
        // DATETIME contiene UTC (Hibernate y sesión JDBC configurados en UTC).
        // Bogotá es UTC-05:00 durante todo el período admitido; no requiere tablas TZ MySQL.
        try { return jdbc.query("""
                SELECT DATE(CONVERT_TZ(fecha_emision, '+00:00', '-05:00')) AS dia, SUM(total) AS total
                FROM facturas WHERE fecha_emision >= ? AND fecha_emision < ?
                GROUP BY dia ORDER BY dia
                """, (rs, n) -> new Prediccion.Dia(rs.getDate("dia").toLocalDate(), rs.getBigDecimal("total").setScale(2).toPlainString()),
                LocalDateTime.ofInstant(desde.atStartOfDay(bogota).toInstant(), ZoneOffset.UTC),
                LocalDateTime.ofInstant(hasta.atStartOfDay(bogota).toInstant(), ZoneOffset.UTC));
        } catch (DataAccessException ex) {
            throw new PrediccionException(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE,
                    "No se pudo consultar el historial de facturación para ML");
        }
    }
}
