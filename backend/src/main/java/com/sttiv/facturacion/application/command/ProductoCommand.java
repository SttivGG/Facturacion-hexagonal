package com.sttiv.facturacion.application.command;

import java.math.BigDecimal;

public record ProductoCommand(String sku, String nombre, String descripcion, String categoria,
        BigDecimal costo, BigDecimal precioVenta, String proveedorId) { }
