package com.sttiv.facturacion.domain.port;

import com.sttiv.facturacion.domain.model.*;
import java.util.*;

public interface FacturaRepositoryPort {
    Factura crear(Factura factura);
    Optional<Factura> buscarPorId(Long id);
    List<Factura> listar();
    List<Factura> buscarPorCliente(UUID clienteId);
    // Debe cargar el saldo actual bajo bloqueo y guardar el abono en una única transacción.
    Factura registrarPago(Long id, Pago pago);
}
