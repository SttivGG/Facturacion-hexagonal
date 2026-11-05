#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $raiz 'backend'
$cache = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.m2'
if (-not (Test-Path -LiteralPath $cache)) { New-Item -ItemType Directory -Path $cache | Out-Null }
$idMysql = & docker compose --project-directory $raiz ps -q facturacion-mysql
if ($LASTEXITCODE -ne 0 -or -not $idMysql) { throw 'MySQL debe estar iniciado con Docker Compose' }
$contenedor = (& docker inspect $idMysql | ConvertFrom-Json)[0]
$red = @($contenedor.NetworkSettings.Networks.PSObject.Properties.Name)[0]
# .env se pasa directamente a Docker; nunca se imprimen sus credenciales.
& docker run --rm --network $red --env-file (Join-Path $raiz '.env') `
    --mount "type=bind,source=$backend,target=/workspace" `
    --mount "type=bind,source=$cache,target=/root/.m2" `
    --workdir /workspace maven:3.10.0-eclipse-temurin-21-alpine `
    mvn --batch-mode --no-transfer-progress test '-Dtest=MySqlFacturaIntegrationTests' '-Dapp.mysql.integration=true'
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas transaccionales reales en MySQL' }
