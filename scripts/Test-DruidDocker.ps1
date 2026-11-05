#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:8888',
    [ValidateRange(60, 1800)][int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$runId = [guid]::NewGuid().ToString('N')
# The datasource is always generated here; callers cannot select an existing one.
$datasource = "fase7a_test_$runId"
$evidence = Join-Path $raiz "backend/target/fase7a/$runId"
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$BaseUrl = $BaseUrl.TrimEnd('/')
$services = @('druid-metadata', 'druid-zookeeper', 'druid-coordinator',
    'druid-broker', 'druid-historical', 'druid-middlemanager', 'druid-router')
$summary = [ordered]@{ runId = $runId; datasource = $datasource; startedAt = [DateTimeOffset]::UtcNow.ToString('o') }

function Save-Json([string]$Name, $Value) {
    ConvertTo-Json -InputObject $Value -Depth 40 | Set-Content (Join-Path $evidence "$Name.json") -Encoding utf8
}

function Invoke-Druid([string]$Path, [string]$Method = 'Get', $Payload = $null) {
    $request = @{ Uri = "$BaseUrl$Path"; Method = $Method; TimeoutSec = 30 }
    if ($null -ne $Payload) {
        $request.ContentType = 'application/json; charset=utf-8'
        $request.Body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Payload -Depth 40 -Compress))
    }
    Invoke-RestMethod @request
}

function Invoke-Sql([string]$Query) {
    # Invoke-RestMethod can emit an empty JSON array as one pipeline object.
    # Enumerate rows explicitly so @(...).Count really is zero for [].
    foreach ($row in (Invoke-Druid '/druid/v2/sql' 'Post' @{ query = $Query; resultFormat = 'object' })) { $row }
}

function Wait-Until([string]$Description, [scriptblock]$Check) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastError = ''
    do {
        try { if (& $Check) { return } } catch { $lastError = $_.Exception.Message }
        Start-Sleep -Seconds 3
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Tiempo agotado: $Description. $lastError"
}

function Wait-Task([string]$TaskId) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $status = Invoke-Druid "/druid/indexer/v1/task/$TaskId/status"
        Save-Json "task-$TaskId-status" $status
        if ($status.status.status -eq 'SUCCESS') { return $status }
        if ($status.status.status -eq 'FAILED') { throw "Tarea fallida: $TaskId. $($status.status.errorMsg)" }
        Start-Sleep -Seconds 3
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Tarea sin finalizar tras ${TimeoutSeconds}s: $TaskId"
}

function Get-Containers {
    $ids = @(& docker compose --project-directory $raiz --profile analytics ps -q @services)
    if ($LASTEXITCODE -ne 0 -or $ids.Count -ne $services.Count) { throw 'Inicia los siete servicios analytics antes de ejecutar esta prueba.' }
    $containers = @((& docker inspect @ids) | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar analytics.' }
    # Do not save Config.Env: it includes the metadata password.
    @($containers | ForEach-Object { [ordered]@{
        id = $_.Id; name = $_.Name; image = $_.Config.Image
        startedAt = $_.State.StartedAt; restartCount = $_.RestartCount
        oomKilled = $_.State.OOMKilled; health = $_.State.Health.Status
        mounts = @($_.Mounts | Select-Object Name, Destination)
    } })
}

$taskId = $null
$taskCompleted = $false
$created = $false
try {
    $before = Get-Containers
    Save-Json 'containers-before' $before
    Wait-Until 'consola y SQL' {
        (Invoke-WebRequest "$BaseUrl/" -TimeoutSec 15).StatusCode -eq 200 -and
        (Invoke-Sql 'SELECT 1 AS "ok"').ok -eq 1
    }
    $summary.consoleHttp = 200
    $summary.sql = @(Invoke-Sql 'SELECT 1 AS "ok"')
    $summary.version = (Invoke-Druid '/status').version
    if (@(Invoke-Sql "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'druid' AND TABLE_NAME = '$datasource'").Count -ne 0) {
        throw 'Colisión de nombre: se cancela antes de escribir.'
    }

    $day = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-dd')
    $interval = "$($day)T00:00:00Z/$(([DateTimeOffset]::Parse($day)).AddDays(1).ToString('yyyy-MM-dd'))T00:00:00Z"
    $records = @(
        @{ timestamp = "$($day)T12:00:00Z"; registroId = "$runId-A"; valorCentavos = 123456L },
        @{ timestamp = "$($day)T12:01:00Z"; registroId = "$runId-B"; valorCentavos = 789012L }
    )
    Save-Json 'records-sent' $records
    $taskId = "fase7a_ingest_$runId"
    $spec = @{
        type = 'index'; id = $taskId
        spec = @{
            dataSchema = @{
                dataSource = $datasource
                timestampSpec = @{ column = 'timestamp'; format = 'iso' }
                dimensionsSpec = @{ dimensions = @('registroId', @{ name = 'valorCentavos'; type = 'long' }) }
                metricsSpec = @()
                granularitySpec = @{ type = 'uniform'; segmentGranularity = 'DAY'; queryGranularity = 'NONE'; rollup = $false; intervals = @($interval) }
            }
            ioConfig = @{
                type = 'index'
                inputSource = @{ type = 'inline'; data = (($records | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress }) -join "`n") }
                inputFormat = @{ type = 'json' }
            }
            tuningConfig = @{ type = 'index'; maxRowsInMemory = 1000; maxBytesInMemory = 16777216; maxParseExceptions = 0 }
        }
    }
    Save-Json 'ingestion-spec' $spec
    Write-Host "Ingesta de dos registros en $datasource"
    $created = $true # A timeout can occur after the server accepted the task.
    $submitted = Invoke-Druid '/druid/indexer/v1/task' 'Post' $spec
    if ($submitted.task -ne $taskId) { throw 'El identificador aceptado no coincide con el generado.' }
    $summary.ingestion = Wait-Task $taskId
    $taskCompleted = $true
    Save-Json 'ingestion-report' (Invoke-Druid "/druid/indexer/v1/task/$taskId/reports")
    # Scan queries support ordering by __time; arbitrary column ordering requires aggregation.
    $query = "SELECT registroId, valorCentavos, TIMESTAMP_TO_MILLIS(__time) AS timestampMs FROM `"$datasource`" ORDER BY __time"
    $expected = @($records | ForEach-Object { [ordered]@{
        registroId = $_.registroId; valorCentavos = $_.valorCentavos
        timestampMs = [DateTimeOffset]::Parse($_.timestamp).ToUnixTimeMilliseconds()
    } })
    $expectedJson = ConvertTo-Json -InputObject $expected -Compress
    function Confirm-Rows {
        $script:rows = @(Invoke-Sql $query)
        (ConvertTo-Json -InputObject $script:rows -Compress) -ceq $expectedJson
    }
    Wait-Until 'dos filas SQL con los identificadores, importes y fechas enviados' { Confirm-Rows }
    Save-Json 'sql-before-restart' $script:rows
    $summary.rowsBeforeRestart = $script:rows
    Wait-Until 'segmento publicado y cargado en Historical' {
        $segments = @(Invoke-Sql "SELECT segment_id, is_published, is_available, is_realtime FROM sys.segments WHERE datasource = '$datasource'")
        $segments.Count -gt 0 -and @($segments | Where-Object { $_.is_published -ne 1 -or $_.is_available -ne 1 -or $_.is_realtime -ne 0 }).Count -eq 0
    }
    Save-Json 'segments-before-restart' @(Invoke-Sql "SELECT segment_id, is_published, is_available, is_realtime FROM sys.segments WHERE datasource = '$datasource'")
    & docker compose --project-directory $raiz --profile analytics exec -T druid-coordinator find /opt/shared/segments -type f |
        Set-Content (Join-Path $evidence 'deep-storage-before.txt')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar deep storage.' }
    & docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' |
        Set-Content (Join-Path $evidence 'memory-before-restart.txt')
    Write-Host 'Reinicio controlado de los siete componentes analytics; Nexo continúa activo.'
    & docker compose --project-directory $raiz --profile analytics stop @services
    if ($LASTEXITCODE -ne 0) { throw 'Falló el apagado de analytics.' }
    & docker compose --project-directory $raiz --profile analytics up -d --no-build --wait --wait-timeout $TimeoutSeconds @services
    if ($LASTEXITCODE -ne 0) { throw 'Falló el arranque de analytics.' }
    Wait-Until 'persistencia de las dos filas después del reinicio' { Confirm-Rows }
    Save-Json 'sql-after-restart' $script:rows
    $summary.rowsAfterRestart = $script:rows
    $after = Get-Containers
    Save-Json 'containers-after' $after
    foreach ($container in $before) {
        $restarted = @($after | Where-Object { $_.name -eq $container.name })[0]
        if ($restarted.startedAt -eq $container.startedAt) { throw "No se reinició $($container.name)" }
        if ((ConvertTo-Json -InputObject $restarted.mounts -Compress) -ne (ConvertTo-Json -InputObject $container.mounts -Compress)) { throw 'Cambiaron los volúmenes de analytics.' }
    }
    $summary.persistence = $true
    Write-Host 'Persistencia verificada: ambas filas y sus valores coinciden después del reinicio.'
} catch {
    $summary.error = $_.Exception.Message
    throw
} finally {
    try {
        if ($created) {
            # Never delete while this run's ingestion task is still active.
            if (-not $taskCompleted) {
                $status = Invoke-Druid "/druid/indexer/v1/task/$taskId/status"
                if ($status.status.status -notin @('SUCCESS', 'FAILED')) {
                    Invoke-Druid "/druid/indexer/v1/task/$taskId/shutdown" 'Post' | Out-Null
                    Wait-Until 'fin de la tarea antes de limpiar' { (Invoke-Druid "/druid/indexer/v1/task/$taskId/status").status.status -in @('SUCCESS', 'FAILED') }
                }
            }
            if ($datasource -cne "fase7a_test_$runId" -or $runId -cnotmatch '^[a-f0-9]{32}$') { throw 'Protección de limpieza: nombre inesperado.' }
            $summary.markUnused = Invoke-Druid "/druid/indexer/v1/datasources/$datasource" 'Delete'
            $killId = "fase7a_kill_$runId"
            $kill = Invoke-Druid '/druid/indexer/v1/task' 'Post' @{ type = 'kill'; id = $killId; dataSource = $datasource; interval = $interval }
            if ($kill.task -ne $killId) { throw 'Identificador de limpieza inesperado.' }
            $summary.kill = Wait-Task $killId
            Wait-Until 'retirada de los segmentos temporales' {
                @(Invoke-Sql "SELECT segment_id FROM sys.segments WHERE datasource = '$datasource'").Count -eq 0
            }
            $summary.cleanup = $true
            Write-Host "Limpieza verificada: solo $datasource. Se conserva el historial de tareas."
        }
    } catch {
        $summary.cleanup = $false
        $summary.cleanupError = $_.Exception.Message
        Write-Warning "No se completó la limpieza de $datasource. Revisa $evidence. $($_.Exception.Message)"
    }
    $summary.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
    Save-Json 'summary' $summary
    Write-Host "Evidencia: $evidence"
}
if (-not $summary.persistence -or -not $summary.cleanup) { throw 'La prueba no se completó. Revisa summary.json.' }
