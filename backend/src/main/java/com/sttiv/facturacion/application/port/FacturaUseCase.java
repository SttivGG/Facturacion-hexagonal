package com.sttiv.facturacion.application.port;

import com.sttiv.facturacion.application.command.*;
import com.sttiv.facturacion.domain.model.Factura;
import java.util.*;

public interface FacturaUseCase {
    Factura crear(FacturaCommand command);
    Factura consultar(Long id);
    List<Factura> listar();
    List<Factura> buscarPorCliente(UUID clienteId);
    Factura registrarPago(Long id, PagoCommand command);
}
