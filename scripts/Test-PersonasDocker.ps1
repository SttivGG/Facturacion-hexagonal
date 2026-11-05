#requires -Version 7.0
param([string]$BaseUrl = 'http://localhost:8080', [switch]$OmitirReinicio)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$salida = Join-Path $raiz 'backend/target'
New-Item -ItemType Directory -Path $salida -Force | Out-Null
$prefijo = 'FASE4-' + [Guid]::NewGuid().ToString('N')
$tipo = 'FASE4_TEST'
$numeros = @("$prefijo-A", "$prefijo-B")
$checks = [System.Collections.Generic.List[string]]::new()
$cliente = [Net.Http.HttpClient]::new()
$cliente.Timeout = [TimeSpan]::FromSeconds(30)

function Comprobar([bool]$Condicion, [string]$Mensaje) {
    if (-not $Condicion) { throw $Mensaje }
    $checks.Add($Mensaje)
}
function Api([string]$Metodo, [string]$Ruta, [int]$Esperado, $Cuerpo = $null) {
    $peticion = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Metodo), $BaseUrl.TrimEnd('/') + $Ruta)
    try {
        if ($null -ne $Cuerpo) {
            $json = if ($Cuerpo -is [string]) { $Cuerpo } else { ConvertTo-Json $Cuerpo -Depth 8 -Compress }
            $peticion.Content = [Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
        }
        $respuesta = $cliente.SendAsync($peticion).GetAwaiter().GetResult()
        try {
            $texto = $respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ([int]$respuesta.StatusCode -ne $Esperado) { throw "$Metodo $Ruta -> $([int]$respuesta.StatusCode), esperado ${Esperado}: $texto" }
            $checks.Add("$Metodo $Ruta -> $Esperado")
            if ($texto) { return (ConvertFrom-Json $texto) }
        } finally { $respuesta.Dispose() }
    } finally { $peticion.Dispose() }
}
function Cql([string]$Consulta) {
    $resultado = & docker compose --project-directory $raiz exec -T facturacion-cassandra cqlsh 127.0.0.1 9042 -e $Consulta 2>&1
    if ($LASTEXITCODE -ne 0 -or ($resultado -join "`n") -match '(SyntaxException|InvalidRequest|Unauthorized)') {
        throw "Falló CQL: $resultado"
    }
    return ($resultado -join "`n")
}
function Filas([string]$Consulta) {
    $texto = Cql $Consulta
    foreach ($linea in ($texto -split "`n")) {
        if ($linea.Trim().StartsWith('{')) { ConvertFrom-Json $linea.Trim() }
    }
}
function Evidencia([string]$Id, [string]$Nombre) {
    $persona = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id = $Id;")
    $documento = @(Filas "SELECT JSON * FROM facturacion_personas.id_por_documento WHERE tipo_documento = '$tipo' AND numero_documento = '$($numeros[0])';")
    $proveedor = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_rol WHERE rol = 'PROVEEDOR' AND persona_id = $Id;")
    $clienteRol = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_rol WHERE rol = 'CLIENTE' AND persona_id = $Id;")
    Comprobar ($persona.Count -eq 1 -and $persona[0].id -eq $Id -and -not $persona[0].activo) 'CQL: persona completa e inactiva almacenada'
    Comprobar ($documento.Count -eq 1 -and $documento[0].persona_id -eq $Id) 'CQL: índice de documento conserva UUID'
    Comprobar ($proveedor.Count -eq 1 -and $clienteRol.Count -eq 0) 'CQL: rol PROVEEDOR presente y CLIENTE retirado'
    @{ persona = $persona; documento = $documento; proveedor = $proveedor; cliente = $clienteRol } |
        ConvertTo-Json -Depth 8 | Set-Content (Join-Path $salida $Nombre) -Encoding utf8
}

try {
    $salud = Api GET '/api/health' 200
    Comprobar ($salud.status -eq 'OK') 'Health original disponible'
    $datos = @{tipoDocumento=$tipo; numeroDocumento=$numeros[0]; nombres='Ana Ficticia'; apellidos='Prueba';
        correo='ana@example.test'; telefono='3000000000'; telefonoAlternativo='3100000000'; direccion='Calle ficticia 1';
        ciudad='Mocoa'; departamento='Putumayo'; pais='Colombia'; fechaNacimiento='2000-01-02'; observaciones='Prueba aislada fase 4';
        roles=@('CLIENTE','PROVEEDOR','CLIENTE')}
    $p = Api POST '/api/personas' 201 $datos
    $id = $p.id
    Comprobar ($p.activo -and @($p.roles).Count -eq 2) 'Creación con múltiples roles sin duplicados'
    Comprobar ([Guid]::Parse($id).ToString() -eq $id) 'UUID representable como String proveedorId sin cambiar productos'
    Api POST '/api/personas' 409 $datos | Out-Null
    Api POST '/api/personas' 400 @{} | Out-Null
    Api POST '/api/personas' 400 '{' | Out-Null
    $invalido = $datos.Clone(); $invalido.correo='correo-invalido'
    Api POST '/api/personas' 400 $invalido | Out-Null
    $invalido = $datos.Clone(); $invalido.nombres=' '
    Api POST '/api/personas' 400 $invalido | Out-Null
    $invalido = $datos.Clone(); $invalido.numeroDocumento=' '
    Api POST '/api/personas' 400 $invalido | Out-Null
    $consulta = Api GET "/api/personas/$id" 200
    Comprobar ($consulta.fechaNacimiento -eq '2000-01-02' -and $consulta.telefonoAlternativo -eq $datos.telefonoAlternativo) 'Datos opcionales y LocalDate recuperados'
    $documento = Api GET "/api/personas/documento/$tipo/$($numeros[0])" 200
    Comprobar ($documento.id -eq $id) 'Búsqueda por documento devuelve el mismo UUID'
    $listado = @(Api GET '/api/personas/rol/CLIENTE' 200)
    Comprobar ($id -in $listado.id) 'Consulta por CLIENTE incluye la persona'
    $datos.nombres='Ana Actualizada'; $datos.ciudad='Pasto'
    $editada = Api PUT "/api/personas/$id" 200 $datos
    Comprobar ($editada.nombres -eq $datos.nombres -and $editada.fechaCreacion -eq $p.fechaCreacion) 'Actualizar conserva identidad y fecha de creación'
    $invalido = $datos.Clone(); $invalido.tipoDocumento='OTRO'
    Api PUT "/api/personas/$id" 400 $invalido | Out-Null
    $invalido = $datos.Clone(); $invalido.numeroDocumento='OTRO'
    Api PUT "/api/personas/$id" 400 $invalido | Out-Null
    $roles = Api PUT "/api/personas/$id/roles" 200 @{roles=@('CLIENTE','PROVEEDOR','TRABAJADOR','ADMINISTRADOR')}
    Comprobar (@($roles.roles).Count -eq 4) 'Asignación de los cuatro roles simultáneos'
    Api PUT "/api/personas/$id/roles" 400 @{roles=$null} | Out-Null
    Api PUT "/api/personas/$id/roles" 200 @{roles=@()} | Out-Null
    foreach ($rol in @('CLIENTE','PROVEEDOR','TRABAJADOR','ADMINISTRADOR')) {
        $filas = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_rol WHERE rol='$rol' AND persona_id=$id;")
        Comprobar ($filas.Count -eq 0) "CQL: retirada completa de rol $rol"
    }
    Api PUT "/api/personas/$id/roles" 200 @{roles=@('PROVEEDOR')} | Out-Null
    $listado = @(Api GET '/api/personas/rol/CLIENTE' 200)
    Comprobar ($id -notin $listado.id) 'Rol CLIENTE retirado del listado'
    $listado = @(Api GET '/api/personas/rol/PROVEEDOR' 200)
    Comprobar ($id -in $listado.id) 'Rol PROVEEDOR asignado permanece en listado'
    $ausente=[Guid]::NewGuid().ToString()
    Api GET "/api/personas/$ausente" 404 | Out-Null
    Api GET "/api/personas/documento/$tipo/ausente-$prefijo" 404 | Out-Null
    Api PUT "/api/personas/$ausente" 404 $datos | Out-Null
    Api PUT "/api/personas/$ausente/roles" 404 @{roles=@()} | Out-Null
    Api DELETE "/api/personas/$ausente" 404 | Out-Null
    Api GET '/api/personas/no-uuid' 400 | Out-Null
    Api GET '/api/personas/rol/OTRO' 400 | Out-Null
    Api DELETE "/api/personas/$id" 204 | Out-Null
    Api DELETE "/api/personas/$id" 204 | Out-Null
    $antes = Api GET "/api/personas/$id" 200
    Comprobar (-not $antes.activo -and $antes.roles[0] -eq 'PROVEEDOR') 'Desactivación lógica idempotente conserva roles'
    Api POST '/api/personas' 409 $datos | Out-Null
    Evidencia $id 'fase4-cassandra-antes.json'

    # Dos solicitudes concurrentes ejercitan la reserva LWT real de otro documento ficticio.
    $otro = $datos.Clone(); $otro.numeroDocumento=$numeros[1]
    $peticiones = @(); $tareas = @(); $respuestas = @()
    try {
        for ($i=0; $i -lt 2; $i++) {
            $req=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, "$BaseUrl/api/personas")
            $req.Content=[Net.Http.StringContent]::new(($otro | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
            $peticiones += $req; $tareas += $cliente.SendAsync($req)
        }
        foreach ($t in $tareas) { $respuestas += $t.GetAwaiter().GetResult() }
        $estados = @($respuestas | ForEach-Object { [int]$_.StatusCode } | Sort-Object)
        Comprobar (($estados -join ',') -eq '201,409') 'Concurrencia real: un POST 201 y un POST 409 para el mismo documento'
    } finally {
        foreach ($r in $respuestas) { $r.Dispose() }; foreach ($r in $peticiones) { $r.Dispose() }
    }
    if (-not $OmitirReinicio) {
        & docker compose --project-directory $raiz restart facturacion-backend
        if ($LASTEXITCODE -ne 0) { throw 'Falló reinicio backend' }
        $disponible=$false
        for ($i=0; $i -lt 90; $i++) {
            try {
                $h=Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 2
                if ($h.status -eq 'OK') { $disponible=$true; break }
            } catch { }
            Start-Sleep -Seconds 1
        }
        Comprobar $disponible 'Backend disponible después del reinicio'
        $despues = Api GET "/api/personas/$id" 200
        Comprobar (($antes | ConvertTo-Json -Depth 8 -Compress) -eq ($despues | ConvertTo-Json -Depth 8 -Compress)) 'Persistencia: todos los campos idénticos después del reinicio'
        $porDoc = Api GET "/api/personas/documento/$tipo/$($numeros[0])" 200
        Comprobar ($porDoc.id -eq $id) 'Persistencia del índice de documento después del reinicio'
        $porRol = @(Api GET '/api/personas/rol/PROVEEDOR' 200)
        Comprobar ($id -in $porRol.id) 'Persistencia del índice de rol después del reinicio'
        Evidencia $id 'fase4-cassandra-despues.json'
    }
} finally {
    try {
        foreach ($numero in $numeros) {
            $indice = @(Filas "SELECT JSON * FROM facturacion_personas.id_por_documento WHERE tipo_documento='$tipo' AND numero_documento='$numero';")
            if ($indice.Count -eq 0) { continue }
            $propio = [Guid]::Parse($indice[0].persona_id).ToString()
            $fila = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id=$propio;")
            if ($fila.Count -gt 0 -and ($fila[0].tipo_documento -ne $tipo -or $fila[0].numero_documento -ne $numero)) {
                throw 'Limpieza detenida: UUID no corresponde al documento de esta prueba'
            }
            foreach ($rol in @('CLIENTE','PROVEEDOR','TRABAJADOR','ADMINISTRADOR')) {
                Cql "DELETE FROM facturacion_personas.personas_por_rol WHERE rol='$rol' AND persona_id=$propio;" | Out-Null
                $restantes = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_rol WHERE rol='$rol' AND persona_id=$propio;")
                Comprobar ($restantes.Count -eq 0) "Limpieza CQL de rol $rol para $propio"
            }
            Cql "DELETE FROM facturacion_personas.personas_por_id WHERE id=$propio;" | Out-Null
            Cql "DELETE FROM facturacion_personas.id_por_documento WHERE tipo_documento='$tipo' AND numero_documento='$numero' IF persona_id=$propio;" | Out-Null
            $restantes = @(Filas "SELECT JSON * FROM facturacion_personas.personas_por_id WHERE id=$propio;")
            Comprobar ($restantes.Count -eq 0) "Limpieza CQL de persona $propio"
            $restantes = @(Filas "SELECT JSON * FROM facturacion_personas.id_por_documento WHERE tipo_documento='$tipo' AND numero_documento='$numero';")
            Comprobar ($restantes.Count -eq 0) "Limpieza CQL de documento ficticio $numero"
        }
    } finally {
        $cliente.Dispose()
        $checks | Set-Content (Join-Path $salida 'fase4-api-checks.txt') -Encoding utf8
    }
}
$checks
Write-Output "OK: $($checks.Count) comprobaciones. Evidencia en backend/target/fase4-*."
