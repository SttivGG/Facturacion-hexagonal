package com.sttiv.facturacion.application;

import com.sttiv.facturacion.application.prediction.*;
import com.sttiv.facturacion.application.usecase.DemostracionService;
import com.sttiv.facturacion.infrastructure.adapter.output.ml.MlHttpAdapter;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DemostracionServiceTests {
    final MlHttpAdapter ml = mock(MlHttpAdapter.class);
    @Test void deshabilitadoPorDefectoNoContactaServicio() {
        var service = new DemostracionService(false, ml);
        assertEquals("DEMO_DESHABILITADA", service.estado().estado());
        assertEquals(PrediccionException.Codigo.DEMO_DESHABILITADA, assertThrows(PrediccionException.class, service::entrenar).codigo());
        assertThrows(PrediccionException.class, () -> service.ventas(7));
        verifyNoInteractions(ml);
    }
    @Test void entrenamientoYHorizontesSoloUtilizanCanalDemo() {
        var service = new DemostracionService(true, ml);
        service.estado(); service.entrenar(); service.ventas(7); service.ventas(14);
        verify(ml).estadoDemo(); verify(ml).entrenarDemo(); verify(ml).ventasDemo(7); verify(ml).ventasDemo(14);
        verify(ml, never()).estado(); verify(ml, never()).entrenar(any()); verify(ml, never()).ventas(anyInt());
        assertThrows(PrediccionException.class, () -> service.ventas(8));
    }
    @Test void bloqueoSeLiberaTrasFalloYDisponibilidadEsExplicita() {
        var service = new DemostracionService(true, ml);
        when(ml.entrenarDemo()).thenAnswer(inv -> {
            assertEquals(PrediccionException.Codigo.ENTRENAMIENTO_EN_CURSO, assertThrows(PrediccionException.class, service::entrenar).codigo());
            throw new PrediccionException(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE, "Sin conexión");
        });
        assertThrows(PrediccionException.class, service::entrenar);
        assertThrows(PrediccionException.class, service::entrenar);
        verify(ml, times(2)).entrenarDemo();
        when(ml.estadoDemo()).thenThrow(new PrediccionException(PrediccionException.Codigo.SERVICIO_NO_DISPONIBLE, "Sin conexión"));
        assertFalse(service.estado().disponible());
    }
}
