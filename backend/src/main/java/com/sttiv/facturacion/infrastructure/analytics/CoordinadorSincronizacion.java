package com.sttiv.facturacion.infrastructure.analytics;

import com.sttiv.facturacion.application.analytics.*;
import com.sttiv.facturacion.application.usecase.*;
import com.sttiv.facturacion.domain.model.FacturacionConfirmada;
import com.sttiv.facturacion.infrastructure.config.DruidProperties;
import org.slf4j.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.event.*;

/** Conecta el caso de uso Java con el ciclo de vida, el temporizador y AFTER_COMMIT de Spring. */
public class CoordinadorSincronizacion extends SincronizarFacturacionService {
    private static final Logger log = LoggerFactory.getLogger(CoordinadorSincronizacion.class);
    public CoordinadorSincronizacion(DruidProperties config, PrepararSnapshotFacturacion preparar,
            AnalyticsIngestionPort ingesta, AnalyticsConsultaPort consultas) {
        super(config.enabled(), preparar, ingesta, consultas);
    }
    @Override @EventListener(ApplicationReadyEvent.class)
    public void iniciar() { super.iniciar(); }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void cambioConfirmado(FacturacionConfirmada evento) { solicitarCambio(); }
    @Override @Scheduled(fixedDelayString = "${app.druid.sync-interval:PT1M}", initialDelayString = "${app.druid.sync-interval:PT1M}")
    public void reconciliar() { super.reconciliar(); }
    @Override protected void notificarFallo(String mensaje) { log.warn("Sincronización analítica: {}", mensaje); }
}
