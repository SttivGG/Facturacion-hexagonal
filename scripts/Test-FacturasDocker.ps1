#requires -Version 7.0
param([string]$BaseUrl = 'http://127.0.0.1:8080', [switch]$OmitirReinicio)
$ErrorActionPreference = 'Stop'
# Compose publica solo IPv4. Evitar que el sondeo tras reiniciar intente ::1.
$direccion = [UriBuilder]::new($BaseUrl)
if ($direccion.Host -eq 'localhost') { $direccion.Host = '127.0.0.1'; $BaseUrl = $direccion.Uri.AbsoluteUri.TrimEnd('/') }
$raiz = Split-Path $PSScriptRoot -Parent
$salida = Join-Path $raiz 'backend/target'
New-Item -ItemType Directory -Path $salida -Force | Out-Null
$prefijo = 'FASE5-' + [Guid]::NewGuid().ToString('N')
$tipo = 'FASE5_TEST'
$checks = [Collections.Generic.List[string]]::new()
$clienteHttp = [Net.Http.HttpClient]::new()
$clienteHttp.Timeout = [TimeSpan]::FromSeconds(45)
$documentos = @("$prefijo-CLIENTE", "$prefijo-VENDEDOR")
$skus = @("$prefijo-A", "$prefijo-B", "$prefijo-INACTIVO")

function Comprobar([bool]$Condicion, [string]$Mensaje) {
    if (-not $Condicion) { throw $Mensaje }
    $checks.Add($Mensaje)
}
function Api([string]$Metodo, [string]$Ruta, [int]$Esperado, $Cuerpo = $null) {
    $req = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Metodo), $BaseUrl.TrimEnd('/') + $Ruta)
    try {
        if ($null -ne $Cuerpo) {
            $json = if ($Cuerpo -is [string]) { $Cuerpo } else { ConvertTo-Json $Cuerpo -Depth 12 -Compress }
            $req.Content = [Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
        }
        $res = $clienteHttp.SendAsync($req).GetAwaiter().GetResult()
        try {
            $texto = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ([int]$res.StatusCode -ne $Esperado) { throw "$Metodo $Ruta -> $([int]$res.StatusCode), esperado ${Esperado}: $texto" }
            $checks.Add("$Metodo $Ruta -> $Esperado")
            if ($texto) { return ConvertFrom-Json $texto }
        } finally { $res.Dispose() }
    } finally { $req.Dispose() }
}
function Sql([string]$Consulta) {
    $r = $Consulta | & docker compose --project-directory $raiz exec -T facturacion-mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names --user="$MYSQL_USER" --database="$MYSQL_DATABASE"' 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Falló MySQL: $r" }
    return ($r -join "`n")
}
function Cql([string]$Consulta) {
    $r = & docker compose --project-directory $raiz exec -T facturacion-cassandra cqlsh 127.0.0.1 9042 -e $Consulta 2>&1
    if ($LASTEXITCODE -ne 0 -or ($r -join "`n") -match '(SyntaxException|InvalidRequest|Unauthorized)') { throw "Falló CQL: $r" }
    return ($r -join "`n")
}
function FilasCql([string]$Consulta) {
    foreach ($linea in ((Cql $Consulta) -split "`n")) {
        if ($linea.Trim().StartsWith('{')) { ConvertFrom-Json $linea.Trim() }
    }
}
function Mongo([string]$Codigo) {
    $auth = @'
const admin = db.getSiblingDB("admin");
if (!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) throw Error("Autenticacion fallida");
const base = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
'@
    $r = ($auth + "`n" + $Codigo) | & docker compose --project-directory $raiz exec -T facturacion-mongodb mongosh --quiet --file /dev/stdin
    if ($LASTEXITCODE -ne 0) { throw 'Falló MongoDB' }
    return ($r -join "`n")
}
function EvidenciaSql([long]$Id) {
    Sql "SELECT JSON_OBJECT('id', f.id, 'numeroFactura', f.numero_factura, 'clienteId', f.cliente_id, 'total', f.total, 'totalPagado', f.total_pagado, 'saldoPendiente', f.saldo_pendiente, 'estado', f.estado, 'detalles', (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', d.id, 'productoId', d.producto_id, 'sku', d.sku, 'precioUnitario', d.precio_unitario, 'cantidad', d.cantidad)) FROM factura_detalles d WHERE d.factura_id=f.id), 'pagos', (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'monto', p.monto, 'metodoPago', p.metodo_pago)) FROM pagos p WHERE p.factura_id=f.id)) FROM facturas f WHERE f.id=$Id;"
}

try {
    Api GET '/api/health' 200 | Out-Null
    $persona = Api POST '/api/personas' 201 @{tipoDocumento=$tipo; numeroDocumento=$documentos[0]; nombres='Cliente Ficticio Fase 5'; apellidos='Prueba'; roles=@('CLIENTE')}
    $vendedor = Api POST '/api/personas' 201 @{tipoDocumento=$tipo; numeroDocumento=$documentos[1]; nombres='Vendedor Ficticio Fase 5'; roles=@()}
    $a = @{sku=$skus[0]; nombre='Producto ficticio A'; costo=5000; precioVenta=[decimal]10000.25}
    $b = @{sku=$skus[1]; nombre='Producto ficticio B'; costo=1000; precioVenta=[decimal]2000.10}
    $p1 = Api POST '/api/productos' 201 $a
    $p2 = Api POST '/api/productos' 201 $b
    $inactivo = Api POST '/api/productos' 201 @{sku=$skus[2]; nombre='Producto inactivo ficticio'; costo=1; precioVenta=1}
    Api DELETE "/api/productos/$($inactivo.id)" 204 | Out-Null
    $credito = @{clienteId=$persona.id; modalidad='CREDITO'; fechaVencimiento='2099-12-15';
        detalles=@(@{productoId=$p1.id; cantidad=2}, @{productoId=$p1.id; cantidad=1}, @{productoId=$p2.id; cantidad=2});
        pagosIniciales=@(@{metodoPago='NEQUI'; monto=[decimal]1000.10; referencia="$prefijo-INICIAL"});
        total=1; precioUnitario=1; estado='PAGADA'}
    $f = Api POST '/api/facturas' 201 $credito
    Comprobar ($f.total -eq [decimal]34000.95 -and $f.impuestos -eq 0 -and $f.saldoPendiente -eq [decimal]33000.85) 'Precios y totales calculados por backend; importes enviados ignorados'
    Comprobar ($f.estado -eq 'PARCIAL' -and @($f.detalles).Count -eq 2 -and $f.detalles[0].cantidad -eq 3) 'Crédito con inicial y productos repetidos consolidados'
    Comprobar ($f.numeroFactura -eq "FAC-$($f.id)") 'Número de factura derivado del ID MySQL'
    $f | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $salida 'fase5-factura-creada.json') -Encoding utf8
    $consulta = Api GET "/api/facturas/$($f.id)" 200
    Comprobar ($consulta.numeroFactura -eq $f.numeroFactura) 'Consulta individual recupera la factura creada'
    $porCliente = @(Api GET "/api/facturas/cliente/$($persona.id)" 200)
    Comprobar ($f.id -in $porCliente.id) 'Historial por cliente incluye la factura'
    $todas = @(Api GET '/api/facturas' 200)
    Comprobar ($f.id -in $todas.id) 'Historial general incluye la factura'

    $contado = @{clienteId=$persona.id; modalidad='CONTADO'; detalles=@(@{productoId=$p1.id; cantidad=1}, @{productoId=$p2.id; cantidad=1});
        pagosIniciales=@(@{metodoPago='EFECTIVO'; monto=10000}, @{metodoPago='TRANSFERENCIA'; monto=[decimal]2000.35; referencia="$prefijo-TR"})}
    $fc = Api POST '/api/facturas' 201 $contado
    Comprobar ($fc.estado -eq 'PAGADA' -and $fc.saldoPendiente -eq 0 -and @($fc.pagos).Count -eq 2) 'Contado con efectivo y transferencia cubre el total exacto'
    $fc | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $salida 'fase5-factura-contado.json') -Encoding utf8
    $mal = $contado.Clone(); $mal.pagosIniciales=@()
    Api POST '/api/facturas' 400 $mal | Out-Null
    $mal = $contado.Clone(); $mal.pagosIniciales=@(@{metodoPago='EFECTIVO'; monto=1})
    Api POST '/api/facturas' 400 $mal | Out-Null
    Api POST "/api/facturas/$($fc.id)/pagos" 409 @{metodoPago='NEQUI'; monto=1} | Out-Null

    foreach ($cantidad in @(0, -1, 1.5, $null)) {
        $mal = $credito.Clone(); $mal.detalles=@(@{productoId=$p1.id; cantidad=$cantidad})
        Api POST '/api/facturas' 400 $mal | Out-Null
    }
    $mal = $credito.Clone(); $mal.detalles=@(@{productoId=[Guid]::NewGuid().ToString(); cantidad=1})
    Api POST '/api/facturas' 404 $mal | Out-Null
    $mal = $credito.Clone(); $mal.detalles=@(@{productoId=$inactivo.id; cantidad=1})
    Api POST '/api/facturas' 409 $mal | Out-Null
    $mal = $credito.Clone(); $mal.clienteId=[Guid]::NewGuid().ToString()
    Api POST '/api/facturas' 404 $mal | Out-Null
    $mal = $credito.Clone(); $mal.clienteId=$vendedor.id
    Api POST '/api/facturas' 409 $mal | Out-Null
    $mal = $credito.Clone(); $mal.vendedorId=$vendedor.id
    Api POST '/api/facturas' 409 $mal | Out-Null
    Api PUT "/api/personas/$($vendedor.id)/roles" 200 @{roles=@('TRABAJADOR')} | Out-Null
    $sinInicial = @{clienteId=$persona.id; vendedorId=$vendedor.id; modalidad='CREDITO'; fechaVencimiento='2099-12-15'; detalles=@(@{productoId=$p2.id; cantidad=1})}
    $pendiente = Api POST '/api/facturas' 201 $sinInicial
    Comprobar ($pendiente.estado -eq 'PENDIENTE' -and $pendiente.vendedorId -eq $vendedor.id) 'Crédito sin inicial y vendedor validado en Cassandra'
    $mal=$sinInicial.Clone(); $mal.Remove('fechaVencimiento')
    Api POST '/api/facturas' 400 $mal | Out-Null
    $mal=$sinInicial.Clone(); $mal.fechaVencimiento='2000-01-01'
    Api POST '/api/facturas' 400 $mal | Out-Null

    $a.precioVenta=[decimal]99999.99; $a.nombre='Nombre actualizado después de vender'; $a.sku="$prefijo-A-NUEVO"
    Api PUT "/api/productos/$($p1.id)" 200 $a | Out-Null
    $historica = Api GET "/api/facturas/$($f.id)" 200
    Comprobar ($historica.detalles[0].precioUnitario -eq [decimal]10000.25 -and $historica.detalles[0].sku -eq $skus[0] -and $historica.detalles[0].nombreProducto -eq 'Producto ficticio A') 'Snapshot histórico conserva SKU, nombre y precio tras cambiar MongoDB'
    $mongo = Mongo "print(EJSON.stringify(base.productos.findOne({_id:'$($p1.id)'})));"
    $mongo | Set-Content (Join-Path $salida 'fase5-mongodb.json') -Encoding utf8
    Comprobar ($mongo -match '99999.99') 'MongoDB confirma directamente el precio nuevo'
    $cassandra = @(FilasCql "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id=$($persona.id);")
    Comprobar ($cassandra.Count -eq 1 -and 'CLIENTE' -in $cassandra[0].roles) 'Cassandra confirma directamente cliente activo y rol CLIENTE'
    $cassandra | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $salida 'fase5-cassandra.json') -Encoding utf8

    $parcial = Api POST "/api/facturas/$($f.id)/pagos" 200 @{metodoPago='TRANSFERENCIA'; monto=[decimal]5000.25; referencia="$prefijo-ABONO"}
    Comprobar ($parcial.saldoPendiente -eq [decimal]28000.60 -and @($parcial.pagos).Count -eq 2) 'Abono posterior actualiza saldo e historial'
    Api POST "/api/facturas/$($f.id)/pagos" 409 @{metodoPago='NEQUI'; monto=[decimal]28000.61} | Out-Null
    foreach ($monto in @(0, -1, 1.001)) {
        Api POST "/api/facturas/$($f.id)/pagos" 400 @{metodoPago='NEQUI'; monto=$monto} | Out-Null
    }
    Api GET '/api/facturas/9223372036854775807' 404 | Out-Null
    Api POST '/api/facturas/9223372036854775807/pagos' 404 @{metodoPago='NEQUI'; monto=1} | Out-Null

    $reqs=@(); $tareas=@(); $respuestas=@()
    try {
        for ($i=0; $i -lt 2; $i++) {
            $req = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, "$BaseUrl/api/facturas/$($pendiente.id)/pagos")
            $req.Content=[Net.Http.StringContent]::new('{"metodoPago":"NEQUI","monto":1500}', [Text.Encoding]::UTF8, 'application/json')
            $reqs += $req; $tareas += $clienteHttp.SendAsync($req)
        }
        foreach ($t in $tareas) { $respuestas += $t.GetAwaiter().GetResult() }
        $estados = @($respuestas | ForEach-Object { [int]$_.StatusCode } | Sort-Object)
        Comprobar (($estados -join ',') -eq '200,409') 'Abonos HTTP concurrentes: uno aceptado y otro rechazado por saldo'
    } finally { foreach ($r in $respuestas) { $r.Dispose() }; foreach ($r in $reqs) { $r.Dispose() } }
    $concurrente = Api GET "/api/facturas/$($pendiente.id)" 200
    Comprobar ($concurrente.saldoPendiente -eq [decimal]500.10 -and @($concurrente.pagos).Count -eq 1) 'MySQL serializa abonos sin saldo negativo'
    $antes = Api GET "/api/facturas/$($f.id)" 200
    $antes | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $salida 'fase5-antes-reinicio.json') -Encoding utf8
    EvidenciaSql $f.id | Set-Content (Join-Path $salida 'fase5-mysql-antes.json') -Encoding utf8
    if (-not $OmitirReinicio) {
        & docker compose --project-directory $raiz restart facturacion-backend
        if ($LASTEXITCODE -ne 0) { throw 'Falló reinicio del backend' }
        $disponible=$false; $ultimoError=''
        for ($i=0; $i -lt 120; $i++) {
            try { if ((Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 2).status -eq 'OK') { $disponible=$true; break } }
            catch { $ultimoError=$_.Exception.Message }
            Start-Sleep -Seconds 1
        }
        if (-not $disponible) { throw "Backend no disponible tras reinicio: $ultimoError" }
        Comprobar $disponible 'Backend disponible tras reinicio'
        $despues = Api GET "/api/facturas/$($f.id)" 200
        Comprobar (($antes | ConvertTo-Json -Depth 12 -Compress) -eq ($despues | ConvertTo-Json -Depth 12 -Compress)) 'Persistencia: factura completa, detalles, pagos y saldo idénticos tras reiniciar'
        $despues | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $salida 'fase5-despues-reinicio.json') -Encoding utf8
        EvidenciaSql $f.id | Set-Content (Join-Path $salida 'fase5-mysql-despues.json') -Encoding utf8
    }
    $pagada = Api POST "/api/facturas/$($f.id)/pagos" 200 @{metodoPago='EFECTIVO'; monto=[decimal]28000.60}
    Comprobar ($pagada.estado -eq 'PAGADA' -and $pagada.saldoPendiente -eq 0 -and $pagada.totalPagado -eq $pagada.total -and @($pagada.pagos).Count -eq 3) 'Último abono completa el crédito y conserva tres pagos'
    $pagada | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $salida 'fase5-factura-pagada.json') -Encoding utf8
    Api POST "/api/facturas/$($f.id)/pagos" 409 @{metodoPago='NEQUI'; monto=1} | Out-Null
    Api DELETE "/api/personas/$($persona.id)" 204 | Out-Null
    Api POST '/api/facturas' 409 $credito | Out-Null
} finally {
    try {
        # Se resuelven incluso las creaciones cuya respuesta HTTP pudiera haberse perdido.
        foreach ($documento in $documentos) {
            $indices = @(FilasCql "SELECT JSON * FROM facturacion_personas.id_por_documento WHERE tipo_documento='$tipo' AND numero_documento='$documento';")
            foreach ($indice in $indices) {
                $id = [Guid]::Parse($indice.persona_id).ToString()
                $p = @(FilasCql "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id=$id;")
                if ($p.Count -gt 0 -and ($p[0].tipo_documento -ne $tipo -or $p[0].numero_documento -ne $documento)) { throw 'Limpieza detenida: persona ajena a esta prueba' }
                Sql "START TRANSACTION; DELETE FROM pagos WHERE factura_id IN (SELECT id FROM facturas WHERE cliente_id='$id'); DELETE FROM factura_detalles WHERE factura_id IN (SELECT id FROM facturas WHERE cliente_id='$id'); DELETE FROM facturas WHERE cliente_id='$id'; COMMIT;" | Out-Null
                Comprobar ((Sql "SELECT COUNT(*) FROM facturas WHERE cliente_id='$id';") -eq '0') "Limpieza MySQL de las facturas del cliente ficticio $id"
                foreach ($rol in @('CLIENTE','PROVEEDOR','TRABAJADOR','ADMINISTRADOR')) { Cql "DELETE FROM facturacion_personas.personas_por_rol WHERE rol='$rol' AND persona_id=$id;" | Out-Null }
                Cql "DELETE FROM facturacion_personas.personas_por_id WHERE id=$id;" | Out-Null
                Cql "DELETE FROM facturacion_personas.id_por_documento WHERE tipo_documento='$tipo' AND numero_documento='$documento' IF persona_id=$id;" | Out-Null
                Comprobar (@(FilasCql "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id=$id;").Count -eq 0) "Limpieza Cassandra de persona ficticia $id"
            }
        }
        $skusPropios = @($skus) + "$prefijo-A-NUEVO"
        $jsonSkus = ConvertTo-Json -InputObject $skusPropios -Compress
        $limpieza = Mongo ('const filtro = {sku: {$in: ' + $jsonSkus + '}}; base.productos.deleteMany(filtro); print(base.productos.countDocuments(filtro));')
        Comprobar ($limpieza.Trim() -eq '0') 'Limpieza MongoDB de productos ficticios de esta ejecución'
    } finally {
        $clienteHttp.Dispose()
        $checks | Set-Content (Join-Path $salida 'fase5-api-checks.txt') -Encoding utf8
    }
}
$checks
Write-Output "OK: $($checks.Count) comprobaciones. Evidencia en backend/target/fase5-*."
