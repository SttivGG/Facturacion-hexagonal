package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import com.sttiv.facturacion.domain.exception.RecursoNoEncontradoException;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.FacturaRepositoryPort;
import java.util.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

@Repository
@Transactional(readOnly = true)
public class MySqlFacturaAdapter implements FacturaRepositoryPort {
    private final SpringDataFacturaRepository repositorio;
    public MySqlFacturaAdapter(SpringDataFacturaRepository repositorio) { this.repositorio = repositorio; }

    @Override @Transactional
    public Factura crear(Factura factura) {
        var entidad = repositorio.saveAndFlush(FacturaJpaMapper.entidad(factura));
        entidad.numeroFactura = "FAC-" + entidad.id;
        repositorio.flush();
        return FacturaJpaMapper.dominio(entidad);
    }
    @Override public Optional<Factura> buscarPorId(Long id) { return repositorio.findById(id).map(FacturaJpaMapper::dominio); }
    @Override public List<Factura> listar() {
        return repositorio.findAllByOrderByIdDesc().stream().map(FacturaJpaMapper::dominio).toList();
    }
    @Override public List<Factura> buscarPorCliente(UUID id) {
        return repositorio.findByClienteIdOrderByIdDesc(id.toString()).stream().map(FacturaJpaMapper::dominio).toList();
    }
    @Override @Transactional(isolation = Isolation.READ_COMMITTED)
    public Factura registrarPago(Long id, Pago pago) {
        var entidad = repositorio.buscarBloqueada(id).orElseThrow(
                () -> new RecursoNoEncontradoException("Factura no encontrada: " + id));
        // La validación usa el saldo leído después de adquirir SELECT ... FOR UPDATE.
        Factura actualizada = FacturaJpaMapper.dominio(entidad).registrarPago(pago);
        FacturaJpaMapper.actualizarSaldo(entidad, actualizada);
        entidad.pagos.add(FacturaJpaMapper.pago(entidad, pago));
        repositorio.saveAndFlush(entidad);
        return FacturaJpaMapper.dominio(entidad);
    }
}
