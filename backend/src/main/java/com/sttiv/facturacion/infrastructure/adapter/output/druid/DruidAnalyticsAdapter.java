package com.sttiv.facturacion.infrastructure.adapter.output.druid;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.infrastructure.config.DruidProperties;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.JsonNode;

public class DruidAnalyticsAdapter implements AnalyticsIngestionPort, AnalyticsConsultaPort {
    private final DruidHttpClient http;
    private final DruidProperties config;
    public DruidAnalyticsAdapter(DruidHttpClient http, DruidProperties config) { this.http = http; this.config = config; }

    @Override public Map<String, Long> enviarSnapshot(HechosAnaliticos snapshot) {
        if (snapshot.facturas().isEmpty() || snapshot.detalles().isEmpty()) {
            throw new AnalyticsException("Snapshot vacío inesperado; no se reemplazó ningún datasource");
        }
        var cuerpos = new LinkedHashMap<DruidDataset, Map<String, Object>>();
        var esperados = new LinkedHashMap<DruidDataset, Map<String, Long>>();
        // Validar los tres tamaños y todas las sumas ANTES de la primera mutación remota.
        for (var dataset : DruidDataset.values()) {
            var filas = dataset.extraer.apply(snapshot);
            esperados.put(dataset, dataset.esperado(filas));
            var cuerpo = new DruidSqlMapper(http).reemplazo(dataset, filas);
            http.validarTamano(cuerpo); cuerpos.put(dataset, cuerpo);
        }
        recuperarTareas();
        var capacidad = http.get("/druid/indexer/v1/totalWorkerCapacity");
        if (entero(capacidad.path("currentClusterCapacity")) < 2) {
            throw new AnalyticsException("SQL REPLACE requiere dos slots MSQ (controlador y worker); Druid conserva capacidad menor a dos. No se enviaron reemplazos");
        }
        var conteos = new LinkedHashMap<String, Long>();
        for (var dataset : DruidDataset.values()) {
            // Un nuevo origen sin pagos puede no tener tabla; se verifica su ausencia sin enviar una fila falsa.
            if (dataset == DruidDataset.PAGOS && snapshot.pagos().isEmpty() && !existe(dataset)) {
                conteos.put(dataset.tabla, 0L); continue;
            }
            var enviada = http.post("/druid/v2/sql/task", cuerpos.get(dataset));
            String taskId = enviada.path("taskId").asString("");
            if (taskId.isBlank()) throw new AnalyticsException("Druid no devolvió taskId; reconciliación pendiente");
            esperarTarea(taskId);
            verificar(dataset, esperados.get(dataset));
            conteos.put(dataset.tabla, esperados.get(dataset).get("registros"));
        }
        return conteos;
    }
    private void recuperarTareas() {
        // Recuperación tras reiniciar Spring o perder la respuesta de envío. No cancelar tareas ajenas.
        var tareas = http.get("/druid/indexer/v1/tasks");
        if (!tareas.isArray()) throw new AnalyticsException("No se pudo inspeccionar tareas existentes");
        for (var tarea : tareas) {
            String id = tarea.path("id").asString("");
            if (id.startsWith("query-nexo_7b_") && tarea.path("type").asString("").equals("query_controller")
                    && tarea.path("statusCode").asString("").equals("RUNNING")) {
                esperarTarea(id);
            }
        }
    }
    private void esperarTarea(String taskId) {
        // El identificador se recibe del servidor; solo se admite un segmento de ruta.
        if (!taskId.matches("[A-Za-z0-9_.:-]+")) throw new AnalyticsException("Identificador de tarea Druid inválido");
        Instant limite = Instant.now().plus(config.taskTimeout());
        do {
            JsonNode status = http.get("/druid/indexer/v1/task/" + taskId + "/status").path("status");
            String estado = status.path("status").asString("");
            if (estado.equals("SUCCESS")) return;
            if (Set.of("FAILED", "CANCELED", "CANCELLED").contains(estado)) {
                String codigo = "sin reporte disponible";
                try {
                    var reporte = http.get("/druid/indexer/v1/task/" + taskId + "/reports");
                    codigo = reporte.path("multiStageQuery").path("payload").path("status")
                            .path("errorReport").path("error").path("errorCode").asString("sin código de fallo");
                    // No registrar reportes completos: pueden contener el JSON inline y referencias de pago.
                    if (!codigo.matches("[A-Za-z0-9 _.-]{1,100}")) codigo = "código de fallo no publicable";
                } catch (RuntimeException ignored) { /* El fallo original sigue siendo visible. */ }
                throw new AnalyticsException("Tarea " + taskId + " " + estado + ": " + codigo + "; revisar reporte en Druid");
            }
            if (!Set.of("RUNNING", "WAITING", "PENDING").contains(estado)) {
                throw new AnalyticsException("Estado de tarea Druid desconocido; reconciliación pendiente");
            }
            pausa();
        } while (Instant.now().isBefore(limite));
        // Puede seguir ejecutándose en Druid: recuperarTareas la espera antes del próximo reemplazo.
        throw new AnalyticsException("Timeout esperando tarea " + taskId + "; no se confirmó sincronización");
    }
    private void verificar(DruidDataset dataset, Map<String, Long> esperado) {
        Instant limite = Instant.now().plus(config.taskTimeout());
        do {
            try {
                if (esperado.get("registros") == 0 && !existe(dataset)) return;
                JsonNode fila = http.sql(dataset.verificacionSql()).path(0);
                boolean coincide = true;
                for (var valor : esperado.entrySet()) coincide &= entero(fila.path(valor.getKey())) == valor.getValue();
                if (coincide && esperado.get("registros") == 0) return;
                JsonNode segmentos = http.sql("SELECT COUNT(*) AS publicados, COALESCE(SUM(CASE WHEN is_available = 1 AND is_realtime = 0 THEN 1 ELSE 0 END), 0) AS disponibles FROM sys.segments WHERE datasource = '"
                        + dataset.tabla + "' AND is_published = 1 AND is_overshadowed = 0 AND shard_spec NOT LIKE '%tombstone%'").path(0);
                long publicados = entero(segmentos.path("publicados"));
                if (coincide && (esperado.get("registros") == 0 || publicados > 0)
                        && publicados == entero(segmentos.path("disponibles"))) return;
            } catch (AnalyticsException ignored) { /* La propagación de segmentos/esquema puede tardar. */ }
            pausa();
        } while (Instant.now().isBefore(limite));
        throw new AnalyticsException("No coinciden conteos, identidades, sumas o segmentos disponibles de " + dataset.tabla);
    }
    private void pausa() {
        try { Thread.sleep(config.pollInterval().toMillis()); }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new AnalyticsException("Sincronización interrumpida", ex); }
    }
    private boolean existe(DruidDataset dataset) {
        return !http.sql("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'druid' AND TABLE_NAME = '"
                + dataset.tabla + "'").isEmpty();
    }
    private static long entero(JsonNode valor) {
        if (!valor.isIntegralNumber() || !valor.canConvertToLong()) throw new AnalyticsException("Druid devolvió un entero inválido o fuera de rango");
        return valor.longValue();
    }
    @Override public boolean disponible() {
        try { return entero(http.sql("SELECT 1 AS ok").path(0).path("ok")) == 1; }
        catch (RuntimeException ex) { return false; }
    }
    @Override public ResumenAnalitico resumen() {
        if (!existe(DruidDataset.FACTURAS)) throw new AnalyticsException("Druid sin facturas analíticas; solicitar sincronización");
        var total = http.sql("SELECT COUNT(*) AS facturas, COALESCE(SUM(total_centavos), 0) AS facturado, COALESCE(SUM(total_pagado_centavos), 0) AS pagado, COALESCE(SUM(saldo_pendiente_centavos), 0) AS saldo FROM nexo_facturas").path(0);
        if (entero(total.path("facturas")) == 0) throw new AnalyticsException("Druid sin facturas analíticas");
        var ventas = new ArrayList<ResumenAnalitico.VentasModalidad>();
        for (var fila : http.sql("SELECT modalidad, COUNT(*) AS facturas, SUM(total_centavos) AS total FROM nexo_facturas GROUP BY modalidad")) {
            ventas.add(new ResumenAnalitico.VentasModalidad(fila.path("modalidad").asString(), entero(fila.path("facturas")), entero(fila.path("total"))));
        }
        var pagos = new ArrayList<ResumenAnalitico.PagosMetodo>();
        if (existe(DruidDataset.PAGOS)) {
            for (var fila : http.sql("SELECT metodo_pago, COUNT(*) AS pagos, SUM(monto_centavos) AS monto FROM nexo_pagos GROUP BY metodo_pago")) {
                pagos.add(new ResumenAnalitico.PagosMetodo(fila.path("metodo_pago").asString(), entero(fila.path("pagos")), entero(fila.path("monto"))));
            }
        }
        return new ResumenAnalitico(entero(total.path("facturas")), entero(total.path("facturado")), entero(total.path("pagado")), entero(total.path("saldo")), List.copyOf(ventas), List.copyOf(pagos));
    }
}
