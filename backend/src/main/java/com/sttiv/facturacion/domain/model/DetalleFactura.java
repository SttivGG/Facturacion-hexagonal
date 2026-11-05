package com.sttiv.facturacion.domain.model;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import java.math.BigDecimal;

public record DetalleFactura(Long id, String productoId, String sku, String nombreProducto,
        int cantidad, BigDecimal precioUnitario, BigDecimal subtotal, BigDecimal total) {
    public DetalleFactura {
        if (productoId == null || productoId.isBlank() || cantidad <= 0) {
            throw new DatosInvalidosException("Producto y cantidad entera positiva son obligatorios");
        }
        precioUnitario = Importe.normalizar(precioUnitario);
        subtotal = Importe.normalizar(subtotal);
        total = Importe.normalizar(total);
        if (subtotal.compareTo(precioUnitario.multiply(BigDecimal.valueOf(cantidad))) != 0
                || total.compareTo(subtotal) != 0) throw new DatosInvalidosException("Detalle inconsistente");
    }
    public static DetalleFactura desde(Producto producto, int cantidad) {
        BigDecimal subtotal = producto.precioVenta().multiply(BigDecimal.valueOf(cantidad));
        return new DetalleFactura(null, producto.id(), producto.sku(), producto.nombre(), cantidad,
                producto.precioVenta(), subtotal, subtotal);
    }
}
