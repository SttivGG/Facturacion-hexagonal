package com.sttiv.facturacion.infrastructure;

import com.sttiv.facturacion.domain.exception.SkuDuplicadoException;
import com.sttiv.facturacion.domain.model.Producto;
import com.sttiv.facturacion.infrastructure.adapter.output.mongo.*;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MongoProductoAdapterTests {
    @Test void traduceColisionDelIndiceUnicoAExcepcionDelDominio() {
        var repository = mock(SpringDataProductoRepository.class);
        when(repository.save(any())).thenThrow(new DuplicateKeyException("sku_unico"));
        var adapter = new MongoProductoAdapter(repository);
        var p = new Producto("id", "SKU", "Nombre", null, null, BigDecimal.ZERO,
                BigDecimal.ONE, null, true, null, Instant.now(), Instant.now());
        assertThatThrownBy(() -> adapter.guardar(p)).isInstanceOf(SkuDuplicadoException.class);
    }
}
