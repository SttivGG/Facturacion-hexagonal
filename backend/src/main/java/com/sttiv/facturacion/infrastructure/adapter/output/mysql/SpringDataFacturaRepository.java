package com.sttiv.facturacion.infrastructure.adapter.output.mysql;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface SpringDataFacturaRepository extends JpaRepository<FacturaJpaEntity, Long> {
    List<FacturaJpaEntity> findAllByOrderByIdDesc();
    List<FacturaJpaEntity> findByClienteIdOrderByIdDesc(String clienteId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from FacturaJpaEntity f where f.id = :id")
    Optional<FacturaJpaEntity> buscarBloqueada(@Param("id") Long id);
}
