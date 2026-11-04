#requires -Version 7.0
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [switch]$OmitirReinicio
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$prefijo = 'FASE3-TEST-' + [Guid]::NewGuid().ToString('N')
$comprobaciones = [System.Collections.Generic.List[string]]::new()
$cliente = [System.Net.Http.HttpClient]::new()
$cliente.Timeout = [TimeSpan]::FromSeconds(30)
$ids = [System.Collections.Generic.List[string]]::new()
$skus = @("${prefijo}-A", "${prefijo}-B")
$salida = Join-Path $raiz 'backend/target'
New-Item -ItemType Directory -Path $salida -Force | Out-Null

function Comprobar([bool]$Condicion, [string]$Mensaje) {
    if (-not $Condicion) { throw $Mensaje }
    $comprobaciones.Add($Mensaje)
}

function Api([string]$Metodo, [string]$Ruta, [int]$Esperado, $Cuerpo = $null,
        [byte[]]$Archivo = $null, [string]$Mime = 'image/png') {
    $peticion = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Metodo), $BaseUrl.TrimEnd('/') + $Ruta)
    try {
        if ($null -ne $Archivo) {
            $multipart = [System.Net.Http.MultipartFormDataContent]::new()
            $parte = [System.Net.Http.ByteArrayContent]::new($Archivo)
            $parte.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($Mime)
            $multipart.Add($parte, 'imagen', 'prueba')
            $peticion.Content = $multipart
        } elseif ($null -ne $Cuerpo) {
            $texto = if ($Cuerpo -is [string]) { $Cuerpo } else { ConvertTo-Json $Cuerpo -Depth 8 -Compress }
            $peticion.Content = [System.Net.Http.StringContent]::new($texto, [Text.Encoding]::UTF8, 'application/json')
        }
        $respuesta = $cliente.SendAsync($peticion).GetAwaiter().GetResult()
        try {
            $bytes = $respuesta.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
            $texto = [Text.Encoding]::UTF8.GetString($bytes)
            if ([int]$respuesta.StatusCode -ne $Esperado) {
                throw "$Metodo $Ruta -> $([int]$respuesta.StatusCode), se esperaba ${Esperado}: $texto"
            }
            $comprobaciones.Add("$Metodo $Ruta -> $Esperado")
            $datos = if ($respuesta.Content.Headers.ContentType.MediaType -like '*json*' -and $texto) {
                ConvertFrom-Json $texto
            } else { $null }
            return [pscustomobject]@{ Datos = $datos; Bytes = $bytes;
                Mime = $respuesta.Content.Headers.ContentType.MediaType;
                Location = [string]$respuesta.Headers.Location }
        } finally { $respuesta.Dispose() }
    } finally { $peticion.Dispose() }
}

function Mongo([string]$Codigo) {
    $autenticacion = @'
const admin = db.getSiblingDB("admin");
if (!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) throw Error("Autenticacion fallida");
const base = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
'@
    $resultado = ($autenticacion + "`n" + $Codigo) |
        & docker compose --project-directory $raiz exec -T facturacion-mongodb mongosh --quiet --file /dev/stdin
    if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación directa de MongoDB' }
    return ($resultado -join "`n")
}

try {
    $health = (Api GET '/api/health' 200).Datos
    Comprobar ($health.status -eq 'OK' -and $health.sistema -eq 'Facturacion Hexagonal') 'Health original conservado'
    $datos = @{ sku = $skus[0]; nombre = 'Producto de prueba fase 3'; descripcion = 'Prueba aislada';
        categoria = 'Pruebas'; costo = [decimal]12345.67; precioVenta = [decimal]19000.99; proveedorId = $null }
    $creado = Api POST '/api/productos' 201 $datos
    $id = $creado.Datos.id
    $ids.Add($id)
    Comprobar ($creado.Location -eq "/api/productos/$id") 'Location apunta al producto creado'
    Comprobar ($creado.Datos.moneda -eq 'COP' -and $creado.Datos.activo) 'Creación en COP y estado activo'
    Api POST '/api/productos' 409 $datos | Out-Null
    Api POST '/api/productos' 400 @{} | Out-Null
    Api POST '/api/productos' 400 '{' | Out-Null
    $invalido = $datos.Clone(); $invalido.costo = -1
    Api POST '/api/productos' 400 $invalido | Out-Null
    $invalido = $datos.Clone(); $invalido.precioVenta = [decimal]0.001
    Api POST '/api/productos' 400 $invalido | Out-Null
    $listado = (Api GET '/api/productos' 200).Datos
    Comprobar ($id -in $listado.id) 'Listado incluye el producto de prueba'
    $consulta = (Api GET "/api/productos/$id" 200).Datos
    Comprobar ([decimal]$consulta.costo -eq [decimal]12345.67) 'Costo recuperado sin pérdida decimal'
    Api GET "/api/productos/$id/imagen" 404 | Out-Null
    $datos.nombre = 'Producto actualizado fase 3'
    $actualizado = (Api PUT "/api/productos/$id" 200 $datos).Datos
    Comprobar ($actualizado.nombre -eq $datos.nombre -and $actualizado.fechaCreacion -eq $consulta.fechaCreacion) 'Actualización conserva fecha de creación'
    $otro = $datos.Clone(); $otro.sku = $skus[1]
    $segundo = (Api POST '/api/productos' 201 $otro).Datos
    $ids.Add($segundo.id)
    $otro.sku = $skus[0]
    Api PUT "/api/productos/$($segundo.id)" 409 $otro | Out-Null
    $ausente = [Guid]::NewGuid().ToString()
    Api GET "/api/productos/$ausente" 404 | Out-Null
    Api PUT "/api/productos/$ausente" 404 $datos | Out-Null
    Api DELETE "/api/productos/$ausente" 404 | Out-Null
    Api GET "/api/productos/$ausente/imagen" 404 | Out-Null

    $png = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=')
    $primera = (Api POST "/api/productos/$id/imagen" 200 -Archivo $png).Datos.imagenId
    $segunda = (Api POST "/api/productos/$id/imagen" 200 -Archivo $png).Datos.imagenId
    Comprobar ($primera -ne $segunda) 'Reemplazo genera una nueva referencia GridFS'
    $imagen = Api GET "/api/productos/$id/imagen" 200
    Comprobar ($imagen.Mime -eq 'image/png' -and [Convert]::ToHexString($imagen.Bytes) -eq [Convert]::ToHexString($png)) 'PNG recuperado byte por byte'
    Api POST "/api/productos/$id/imagen" 400 -Archivo ([byte[]](1,2,3)) -Mime 'image/gif' | Out-Null
    Api POST "/api/productos/$id/imagen" 400 -Archivo ([byte[]](1,2,3)) -Mime 'image/png' | Out-Null
    Api POST "/api/productos/$id/imagen" 400 -Archivo ([byte[]]::new(3 * 1024 * 1024 + 1)) | Out-Null
    Api POST "/api/productos/$id/imagen" 400 -Archivo ([byte[]]::new(0)) | Out-Null
    Api POST "/api/productos/$ausente/imagen" 404 -Archivo $png | Out-Null
    Api DELETE "/api/productos/$id" 204 | Out-Null
    $inactivo = (Api GET "/api/productos/$id" 200).Datos
    Comprobar (-not $inactivo.activo) 'DELETE conserva el producto inactivo y su imagen'
    Api POST '/api/productos' 409 $datos | Out-Null

    # Los valores interpolados son exclusivamente UUID generados por esta prueba.
    $consultaMongo = @'
const producto = base.productos.findOne({_id: 'PRODUCTO_ID'});
if (!producto || producto.activo !== false || producto.imagenId !== 'IMAGEN_NUEVA') throw Error('Documento incorrecto');
const tipos = base.productos.aggregate([{$match:{_id:'PRODUCTO_ID'}},{$project:{costo:{$type:'$costo'},precioVenta:{$type:'$precioVenta'}}}]).toArray()[0];
if (tipos.costo !== 'decimal' || tipos.precioVenta !== 'decimal') throw Error('Importes no son Decimal128');
if (producto.costo.toString() !== '12345.67' || producto.precioVenta.toString() !== '19000.99') throw Error('Precision decimal perdida');
const indice = base.productos.getIndexes().find(i => i.name === 'sku_unico' && i.unique);
if (!indice) throw Error('Indice unico ausente');
if (base.getCollection('fs.files').countDocuments({_id:ObjectId('IMAGEN_ANTERIOR')}) !== 0 || base.getCollection('fs.chunks').countDocuments({files_id:ObjectId('IMAGEN_ANTERIOR')}) !== 0) throw Error('Imagen anterior sin limpiar');
const archivo = base.getCollection('fs.files').findOne({_id:ObjectId('IMAGEN_NUEVA')});
if (!archivo || Number(archivo.length) !== LONGITUD_PNG) throw Error('Archivo GridFS incorrecto');
const chunks = base.getCollection('fs.chunks').countDocuments({files_id:ObjectId('IMAGEN_NUEVA')});
if (chunks < 1) throw Error('Chunks ausentes');
print(EJSON.stringify({producto,tipos,indice,archivo,chunks},null,2));
'@
    $consultaMongo = $consultaMongo.Replace('PRODUCTO_ID', $id).Replace('IMAGEN_NUEVA', $segunda)
    $consultaMongo = $consultaMongo.Replace('IMAGEN_ANTERIOR', $primera).Replace('LONGITUD_PNG', [string]$png.Length)
    $evidencia = Mongo $consultaMongo
    $evidencia | Set-Content (Join-Path $salida 'fase3-mongodb.json') -Encoding utf8
    $comprobaciones.Add('MongoDB: documento inactivo, Decimal128 exacto, índice único, fs.files/fs.chunks y limpieza de imagen anterior')

    if (-not $OmitirReinicio) {
        & docker compose --project-directory $raiz restart facturacion-backend
        if ($LASTEXITCODE -ne 0) { throw 'Falló el reinicio del backend' }
        $disponible = $false
        $sonda = [System.Net.Http.HttpClient]::new()
        $sonda.Timeout = [TimeSpan]::FromSeconds(5)
        try {
        for ($intento = 0; $intento -lt 60; $intento++) {
            try {
                $textoSalud = $sonda.GetStringAsync($BaseUrl.TrimEnd('/') + '/api/health').GetAwaiter().GetResult()
                $salud = ConvertFrom-Json $textoSalud
                if ($salud.status -eq 'OK') { $disponible = $true; break }
            } catch { }
            Start-Sleep -Seconds 1
        }
        } finally { $sonda.Dispose() }
        Comprobar $disponible 'Backend disponible después del reinicio'
        $persistido = (Api GET "/api/productos/$id" 200).Datos
        Comprobar ($persistido.imagenId -eq $segunda -and -not $persistido.activo) 'Documento persiste después del reinicio'
        $recuperada = Api GET "/api/productos/$id/imagen" 200
        Comprobar ([Convert]::ToHexString($recuperada.Bytes) -eq [Convert]::ToHexString($png)) 'GridFS persiste después del reinicio'
    }
} finally {
    try {
        # Se eliminan físicamente solo los registros de esta ejecución, nunca datos ajenos.
        $idsJson = ConvertTo-Json -InputObject @($ids) -Compress
        $skusJson = ConvertTo-Json -InputObject $skus -Compress
        $limpieza = @'
const filtro = {_id: {$in: IDS}, sku: {$in: SKUS}};
const propios = base.productos.find(filtro).toArray();
const imagenes = propios.filter(p => p.imagenId).map(p => ObjectId(p.imagenId));
base.getCollection('fs.chunks').deleteMany({files_id: {$in: imagenes}});
base.getCollection('fs.files').deleteMany({_id: {$in: imagenes}});
const borrados = base.productos.deleteMany(filtro).deletedCount;
if (base.productos.countDocuments(filtro) !== 0) throw Error('Limpieza incompleta');
if (base.getCollection('fs.files').countDocuments({_id: {$in: imagenes}}) !== 0 || base.getCollection('fs.chunks').countDocuments({files_id: {$in: imagenes}}) !== 0) throw Error('Limpieza GridFS incompleta');
print(JSON.stringify({productosPruebaEliminados:borrados,imagenesPruebaEliminadas:imagenes.length}));
'@
        $limpieza = $limpieza.Replace('IDS', $idsJson).Replace('SKUS', $skusJson)
        $resultadoLimpieza = Mongo $limpieza
        $comprobaciones.Add("Limpieza limitada a UUID y SKU de esta ejecución: $resultadoLimpieza")
    } finally {
        $cliente.Dispose()
        $comprobaciones | Set-Content (Join-Path $salida 'fase3-api-checks.txt') -Encoding utf8
    }
}
$comprobaciones
Write-Output "OK: $($comprobaciones.Count) comprobaciones. Evidencia en backend/target/fase3-*."
