package com.sttiv.facturacion.application;

import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.application.usecase.PrediccionService;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrediccionServiceTests {
    // Aún es noviembre 11 en Bogotá, aunque el instante UTC ya sea noviembre 12.
    final Clock clock = Clock.fixed(Instant.parse("2026-11-12T03:00:00Z"), ZoneOffset.UTC);
    final LocalDate today = LocalDate.of(2026, 11, 11);
    final HistorialVentasPort history = mock(HistorialVentasPort.class);
    final PrediccionPort ml = mock(PrediccionPort.class);
    final PrediccionService service = new PrediccionService(true, history, ml, clock);

    @Test void deshabilitadoNoConsultaRedNiBase() {
        var disabled = new PrediccionService(false, history, ml, clock);
        assertEquals("DESHABILITADO", disabled.estado().estado());
        assertThrows(PrediccionException.class, disabled::entrenar);
        assertThrows(PrediccionException.class, () -> disabled.ventas(7));
        verifyNoInteractions(history, ml);
    }
    @Test void completaCerosDesdePrimeraFacturaYExcluyeDiaActualBogota() {
        when(history.consultar(today.minusDays(1095), today)).thenReturn(List.of(
                new Prediccion.Dia(today.minusDays(56), "9007199254.75"), new Prediccion.Dia(today.minusDays(1), "0.25")));
        service.entrenar();
        var captor = org.mockito.ArgumentCaptor.forClass(Prediccion.Entrenamiento.class);
        verify(ml).entrenar(captor.capture());
        var rows = captor.getValue().observaciones();
        assertEquals(56, rows.size());
        assertEquals("9007199254.75", rows.getFirst().total());
        assertEquals("0.00", rows.get(1).total());
        assertEquals(today.minusDays(1), rows.getLast().fecha());
        verify(history).consultar(today.minusDays(1095), today);
    }
    @Test void insuficientesNoEnvianEntrenamientoYPermitenReintentar() {
        when(history.consultar(any(), any())).thenReturn(List.of(), List.of(new Prediccion.Dia(today.minusDays(55), "1.00")));
        for (int i=0; i<2; i++) assertEquals(PrediccionException.Codigo.DATOS_INSUFICIENTES,
                assertThrows(PrediccionException.class, service::entrenar).codigo());
        verifyNoInteractions(ml);
    }
    @Test void rechazaFechasImportesYDuplicados() {
        for (var rows : List.of(List.of(new Prediccion.Dia(today, "1.00")),
                List.of(new Prediccion.Dia(today.minusDays(56), "1000000000001.00")),
                List.of(new Prediccion.Dia(today.minusDays(56), "1.00"), new Prediccion.Dia(today.minusDays(56), "2.00")))) {
            when(history.consultar(any(), any())).thenReturn(rows);
            assertEquals(PrediccionException.Codigo.DATOS_INVALIDOS, assertThrows(PrediccionException.class, service::entrenar).codigo());
        }
        verifyNoInteractions(ml);
    }
    @Test void bloqueoEntrenamientoSeLiberaDespuesDeFallo() {
        when(history.consultar(any(), any())).thenAnswer(inv -> {
            assertEquals(PrediccionException.Codigo.ENTRENAMIENTO_EN_CURSO,
                    assertThrows(PrediccionException.class, service::entrenar).codigo());
            return List.of(new Prediccion.Dia(today.minusDays(56), "1.00"));
        });
        when(ml.entrenar(any())).thenThrow(new PrediccionException(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE, "Sin conexión"));
        assertThrows(PrediccionException.class, service::entrenar);
        assertThrows(PrediccionException.class, service::entrenar);
        verify(ml, times(2)).entrenar(any());
    }
    @Test void servicioCaidoTieneEstadoExplicitoYHorizontesValidos() {
        when(ml.estado()).thenThrow(new PrediccionException(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE, "Sin conexión"));
        assertFalse(service.estado().disponible());
        assertEquals("SERVICIO_NO_DISPONIBLE", service.estado().estado());
        assertThrows(PrediccionException.class, () -> service.ventas(30));
        service.ventas(7); service.ventas(14);
        verify(ml).ventas(7); verify(ml).ventas(14);
    }
}
