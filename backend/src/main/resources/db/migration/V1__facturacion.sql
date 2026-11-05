CREATE TABLE facturas (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    cliente_id VARCHAR(36) NOT NULL,
    vendedor_id VARCHAR(36),
    cliente_nombre LONGTEXT NOT NULL,
    cliente_documento LONGTEXT NOT NULL,
    fecha_emision DATETIME(6) NOT NULL,
    fecha_vencimiento DATE,
    modalidad VARCHAR(10) NOT NULL,
    subtotal DECIMAL(50,2) NOT NULL,
    impuestos DECIMAL(50,2) NOT NULL,
    total DECIMAL(50,2) NOT NULL,
    total_pagado DECIMAL(50,2) NOT NULL,
    saldo_pendiente DECIMAL(50,2) NOT NULL,
    estado VARCHAR(10) NOT NULL,
    CONSTRAINT uk_factura_numero UNIQUE (numero_factura),
    CONSTRAINT ck_factura_modalidad CHECK (modalidad IN ('CONTADO', 'CREDITO')),
    CONSTRAINT ck_factura_credito CHECK (modalidad <> 'CREDITO' OR fecha_vencimiento IS NOT NULL),
    CONSTRAINT ck_factura_importes CHECK (subtotal >= 0 AND impuestos >= 0 AND total = subtotal + impuestos
        AND total_pagado >= 0 AND total_pagado <= total AND saldo_pendiente = total - total_pagado),
    CONSTRAINT ck_factura_estado CHECK ((estado = 'PAGADA' AND saldo_pendiente = 0)
        OR (estado = 'PENDIENTE' AND total_pagado = 0 AND saldo_pendiente > 0)
        OR (estado = 'PARCIAL' AND total_pagado > 0 AND saldo_pendiente > 0)),
    CONSTRAINT ck_factura_contado CHECK (modalidad <> 'CONTADO' OR estado = 'PAGADA'),
    INDEX ix_factura_cliente_fecha (cliente_id, fecha_emision),
    INDEX ix_factura_fecha (fecha_emision)
) ENGINE=InnoDB;

CREATE TABLE factura_detalles (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    factura_id BIGINT NOT NULL,
    producto_id VARCHAR(255) NOT NULL,
    sku LONGTEXT NOT NULL,
    nombre_producto LONGTEXT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(50,2) NOT NULL,
    subtotal DECIMAL(50,2) NOT NULL,
    total DECIMAL(50,2) NOT NULL,
    CONSTRAINT fk_detalle_factura FOREIGN KEY (factura_id) REFERENCES facturas(id),
    CONSTRAINT uk_detalle_producto UNIQUE (factura_id, producto_id),
    CONSTRAINT ck_detalle_importes CHECK (cantidad > 0 AND precio_unitario >= 0
        AND subtotal = cantidad * precio_unitario AND total = subtotal)
) ENGINE=InnoDB;

CREATE TABLE pagos (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    factura_id BIGINT NOT NULL,
    fecha_pago DATETIME(6) NOT NULL,
    monto DECIMAL(50,2) NOT NULL,
    metodo_pago VARCHAR(20) NOT NULL,
    referencia VARCHAR(255),
    observaciones VARCHAR(2000),
    CONSTRAINT fk_pago_factura FOREIGN KEY (factura_id) REFERENCES facturas(id),
    CONSTRAINT ck_pago_monto CHECK (monto > 0),
    CONSTRAINT ck_pago_metodo CHECK (metodo_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'NEQUI')),
    INDEX ix_pago_factura_fecha (factura_id, fecha_pago)
) ENGINE=InnoDB;
