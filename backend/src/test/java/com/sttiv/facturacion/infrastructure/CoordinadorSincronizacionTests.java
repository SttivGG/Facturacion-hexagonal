package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.application.port.SincronizarFacturacionUseCase.Solicitud;
import com.sttiv.facturacion.application.usecase.PrepararSnapshotFacturacion;
import com.sttiv.facturacion.domain.model.FacturacionConfirmada;
import com.sttiv.facturacion.infrastructure.analytics.CoordinadorSincronizacion;
import com.sttiv.facturacion.infrastructure.config.DruidProperties;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CoordinadorSincronizacionTests {
    final PrepararSnapshotFacturacion preparar = mock(PrepararSnapshotFacturacion.class);
    final AnalyticsIngestionPort ingesta = mock(AnalyticsIngestionPort.class);
    final AnalyticsConsultaPort consulta = mock(AnalyticsConsultaPort.class);
    final HechosAnaliticos snapshot = new HechosAnaliticos(List.of(Map.of("factura_id", 1L)), List.of(), List.of());
    final Map<String, Long> conteos = Map.of("nexo_facturas", 1L, "nexo_factura_detalles", 1L, "nexo_pagos", 0L);
    DruidProperties config(boolean habilitado) { return new DruidProperties(habilitado, null, null, null, null, null, 0); }
    CoordinadorSincronizacion crear(boolean habilitado) {
        when(preparar.obtener()).thenReturn(snapshot); when(ingesta.enviarSnapshot(any())).thenReturn(conteos);
        when(consulta.disponible()).thenReturn(true);
        return new CoordinadorSincronizacion(config(habilitado), preparar, ingesta, consulta);
    }
    void terminar(CoordinadorSincronizacion c) throws Exception {
        long limite = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (c.estado().enEjecucion() && System.nanoTime() < limite) Thread.sleep(5);
        assertFalse(c.estado().enEjecucion());
    }
    @Test void deshabilitadoNoConsultaOrigenNiDruid() {
        try (var c = crear(false)) {
            assertEquals(Solicitud.DESHABILITADA, c.solicitar()); c.reconciliar();
            assertFalse(c.estado().habilitado()); assertThrows(AnalyticsException.class, c::resumen);
            verifyNoInteractions(preparar, ingesta, consulta);
        }
    }
    @Test void noEjecutaIngestasSinCambiosYManualFuerzaReconciliacion() throws Exception {
        try (var c = crear(true)) {
            c.solicitar(); terminar(c); c.reconciliar(); terminar(c);
            verify(ingesta, times(1)).enviarSnapshot(snapshot);
            c.solicitar(); terminar(c); verify(ingesta, times(2)).enviarSnapshot(snapshot);
            assertNotNull(c.estado().ultimaSincronizacionExitosa()); assertEquals(conteos, c.estado().registrosVerificados());
        }
    }
    @Test void cambiosDuranteIngestaTienenOtraPasadaSinSolaparse() throws Exception {
        try (var c = crear(true)) {
            var entrada = new CountDownLatch(1); var liberar = new CountDownLatch(1);
            var activos = new AtomicInteger(); var maximo = new AtomicInteger(); var llamadas = new AtomicInteger();
            when(ingesta.enviarSnapshot(any())).thenAnswer(inv -> {
                maximo.accumulateAndGet(activos.incrementAndGet(), Math::max);
                if (llamadas.incrementAndGet() == 1) { entrada.countDown(); assertTrue(liberar.await(5, TimeUnit.SECONDS)); }
                activos.decrementAndGet(); return conteos;
            });
            c.solicitar(); assertTrue(entrada.await(5, TimeUnit.SECONDS));
            when(preparar.obtener()).thenReturn(new HechosAnaliticos(List.of(Map.of("factura_id", 2L)), List.of(), List.of()));
            c.cambioConfirmado(new FacturacionConfirmada()); liberar.countDown(); terminar(c);
            assertEquals(2, llamadas.get()); assertEquals(1, maximo.get()); assertFalse(c.estado().pendiente());
        }
    }
    @Test void falloNoPublicaConteosYReintentaAunqueHuellaCoincidaConExitoAnterior() throws Exception {
        try (var c = crear(true)) {
            c.solicitar(); terminar(c);
            when(ingesta.enviarSnapshot(any())).thenThrow(new AnalyticsException("Druid apagado"));
            c.solicitar(); terminar(c);
            assertEquals("FAILED", c.estado().ultimoResultado()); assertTrue(c.estado().pendiente());
            assertTrue(c.estado().registrosVerificados().isEmpty()); assertEquals("Druid apagado", c.estado().ultimoError());
            doReturn(conteos).when(ingesta).enviarSnapshot(any());
            c.reconciliar(); terminar(c); assertEquals("SUCCESS", c.estado().ultimoResultado());
            verify(ingesta, times(3)).enviarSnapshot(any());
        }
    }
    @Test void extraccionVaciaONulaNuncaDestruyeDatasources() throws Exception {
        try (var c = crear(true)) {
            when(preparar.obtener()).thenReturn(new HechosAnaliticos(List.of(), List.of(), List.of()));
            c.solicitar(); terminar(c); assertEquals("SIN_FACTURAS_ORIGEN_CONSERVADO", c.estado().ultimoResultado());
            assertNull(c.estado().ultimaSincronizacionExitosa()); verifyNoInteractions(ingesta);
            when(preparar.obtener()).thenThrow(new IllegalStateException("Extracción fallida"));
            c.solicitar(); terminar(c); assertTrue(c.estado().pendiente()); verifyNoInteractions(ingesta);
        }
    }
    @Test void nuevaInstanciaReingestaAunqueSeaElMismoOrigen() throws Exception {
        try (var c = crear(true)) { c.iniciar(); terminar(c); }
        try (var c = crear(true)) { c.iniciar(); terminar(c); }
        verify(ingesta, times(2)).enviarSnapshot(snapshot);
    }
}
