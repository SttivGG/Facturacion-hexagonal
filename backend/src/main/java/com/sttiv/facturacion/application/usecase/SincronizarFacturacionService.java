package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.application.port.SincronizarFacturacionUseCase;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Un solo escritor por instancia académica. Ninguna tarea financiera espera por Druid. */
public class SincronizarFacturacionService implements SincronizarFacturacionUseCase, AutoCloseable {
    private final boolean habilitado;
    private final PrepararSnapshotFacturacion preparar;
    private final AnalyticsIngestionPort ingesta;
    private final AnalyticsConsultaPort consultas;
    private final ExecutorService ejecutor;
    private boolean ejecutando, pendiente, forzar;
    private long revision;
    private String huellaExitosa, resultado = "SIN_EJECUTAR", ultimoError;
    private Instant ultimaExitosa;
    private Map<String, Long> conteos = Map.of();

    public SincronizarFacturacionService(boolean habilitado, PrepararSnapshotFacturacion preparar,
            AnalyticsIngestionPort ingesta, AnalyticsConsultaPort consultas) {
        this.habilitado = habilitado; this.preparar = preparar; this.ingesta = ingesta; this.consultas = consultas;
        pendiente = habilitado;
        ejecutor = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().name("nexo-analytics").factory());
    }
    public void iniciar() { solicitar(); }

    public void solicitarCambio() {
        try { pedir(false); }
        catch (RuntimeException ex) {
            // Una notificación analítica nunca convierte un commit financiero en un error HTTP.
            synchronized (this) { pendiente = habilitado; ultimoError = "No se pudo programar analítica; se reintentará"; }
            notificarFallo("No se pudo programar analítica después del commit");
        }
    }
    public void reconciliar() {
        synchronized (this) { if (ejecutando || !habilitado) return; }
        pedir(false); // Releer MySQL detecta también escrituras externas; el hash evita tareas sin cambios.
    }
    @Override public Solicitud solicitar() { return pedir(true); }
    private synchronized Solicitud pedir(boolean forzada) {
        if (!habilitado) return Solicitud.DESHABILITADA;
        revision++; pendiente = true; forzar |= forzada;
        if (ejecutando) return Solicitud.EN_EJECUCION;
        ejecutando = true;
        try { ejecutor.execute(this::sincronizar); }
        catch (RejectedExecutionException ex) { ejecutando = false; throw ex; }
        return Solicitud.ACEPTADA;
    }
    private void sincronizar() {
        long version;
        boolean forzada;
        synchronized (this) { version = revision; forzada = forzar; forzar = false; }
        try {
            var snapshot = preparar.obtener();
            if (snapshot.facturas().isEmpty()) {
                synchronized (this) {
                    resultado = "SIN_FACTURAS_ORIGEN_CONSERVADO";
                    // Nunca destruir datasources por una extracción vacía; tampoco afirmar éxito.
                    conteos = Map.of(); ultimoError = null; pendiente = revision != version;
                    huellaExitosa = null;
                }
                return;
            }
            String huella = huella(snapshot);
            if (!forzada && huella.equals(huellaExitosa) && consultas.disponible()) {
                synchronized (this) { pendiente = revision != version; }
                return;
            }
            synchronized (this) { resultado = "EN_EJECUCION"; conteos = Map.of(); }
            var verificados = ingesta.enviarSnapshot(snapshot);
            synchronized (this) {
                conteos = Map.copyOf(verificados); huellaExitosa = huella;
                ultimaExitosa = Instant.now(); ultimoError = null; resultado = "SUCCESS";
                pendiente = revision != version;
            }
        } catch (Exception ex) {
            synchronized (this) {
                pendiente = true; conteos = Map.of(); resultado = "FAILED"; huellaExitosa = null;
                ultimoError = ex instanceof AnalyticsException || ex instanceof IllegalArgumentException || ex instanceof IllegalStateException
                        ? resumir(ex.getMessage()) : "Falló la extracción o sincronización; revisar el servicio y reintentar";
            }
            notificarFallo(ultimoError);
        } finally {
            synchronized (this) {
                ejecutando = false;
                // Cambios llegados durante la ingesta reciben otra pasada; fallos esperan al temporizador.
                if (revision != version && !ejecutor.isShutdown()) {
                    ejecutando = true; ejecutor.execute(this::sincronizar);
                }
            }
        }
    }
    private static String resumir(String texto) {
        if (texto == null) return "Falló la sincronización";
        return texto.substring(0, Math.min(300, texto.length()));
    }
    private static String huella(HechosAnaliticos snapshot) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            for (var conjunto : List.of(snapshot.facturas(), snapshot.detalles(), snapshot.pagos())) {
                alimentar(digest, Integer.toString(conjunto.size()));
                for (var fila : conjunto) for (var campo : fila.entrySet()) {
                    alimentar(digest, campo.getKey());
                    alimentar(digest, campo.getValue() == null ? "null" : campo.getValue().getClass().getName());
                    alimentar(digest, String.valueOf(campo.getValue()));
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    private static void alimentar(MessageDigest digest, String valor) {
        byte[] bytes = valor.getBytes(StandardCharsets.UTF_8);
        digest.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array()); digest.update(bytes);
    }
    @Override public EstadoSincronizacion estado() {
        boolean disponible = habilitado && consultas.disponible();
        synchronized (this) {
            return new EstadoSincronizacion(habilitado, disponible, ejecutando, pendiente,
                    resultado, ultimaExitosa, ultimoError, conteos);
        }
    }
    @Override public ResumenAnalitico resumen() {
        if (!habilitado) throw new AnalyticsException("Analítica deshabilitada; activar DRUID_ENABLED");
        return consultas.resumen();
    }
    @Override public void close() { ejecutor.shutdownNow(); }
    protected void notificarFallo(String mensaje) { }
}
