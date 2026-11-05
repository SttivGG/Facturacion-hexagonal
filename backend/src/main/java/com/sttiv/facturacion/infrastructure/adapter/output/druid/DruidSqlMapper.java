package com.sttiv.facturacion.infrastructure.adapter.output.druid;

import java.util.*;
import java.util.stream.Collectors;

/** SQL y escape de literales quedan en infraestructura; identificadores son constantes internas. */
final class DruidSqlMapper {
    private final DruidHttpClient http;
    DruidSqlMapper(DruidHttpClient http) { this.http = http; }
    Map<String, Object> reemplazo(DruidDataset dataset, List<Map<String, Object>> filas) {
        String consulta;
        if (filas.isEmpty()) {
            // Un conjunto de pagos vacío es válido. No se inventa una fila para poder crear la tabla.
            var columnas = dataset.columnas.entrySet().stream().filter(c -> !c.getKey().equals("timestamp"))
                    .map(c -> "CAST(NULL AS " + (c.getValue().equals("long") ? "BIGINT" : "VARCHAR") + ") AS \"" + c.getKey() + "\"")
                    .collect(Collectors.joining(", "));
            consulta = "SELECT TIMESTAMP '2000-01-01 00:00:00' AS __time, " + columnas + " WHERE 1 = 0";
        } else {
            String datos = filas.stream().map(http::serializar).collect(Collectors.joining("\n"));
            String fuente = http.serializar(Map.of("type", "inline", "data", datos));
            String firma = http.serializar(dataset.columnas.entrySet().stream()
                    .map(c -> Map.of("name", c.getKey(), "type", c.getValue())).toList());
            String columnas = dataset.columnas.keySet().stream().filter(c -> !c.equals("timestamp"))
                    .map(c -> "\"" + c + "\"").collect(Collectors.joining(", "));
            consulta = "SELECT TIME_PARSE(\"timestamp\") AS __time, " + columnas
                    + " FROM TABLE(EXTERN(" + literal(fuente) + ", '{\"type\":\"json\"}', " + literal(firma) + "))";
        }
        return Map.of("query", "REPLACE INTO \"" + dataset.tabla + "\" OVERWRITE ALL " + consulta + " PARTITIONED BY DAY",
                "context", Map.of("maxNumTasks", 2, "taskAssignment", "auto", "maxRowsInMemory", 1000,
                        "maxParseExceptions", 0, "waitUntilSegmentsLoad", true, "failOnEmptyInsert", !filas.isEmpty(),
                        "sqlTimeZone", "UTC", "sqlQueryId", "nexo_7b_" + UUID.randomUUID()));
    }
    private static String literal(String texto) { return "'" + texto.replace("'", "''") + "'"; }
}
