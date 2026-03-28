@echo off
chcp 65001 >nul
title PYFIX POS — Publicar Release

echo.
echo ╔══════════════════════════════════════════════╗
echo ║       PYFIX POS — Publicar en GitHub         ║
echo ╚══════════════════════════════════════════════╝
echo.

:: ── Verificar que existe el instalador ───────────────────────────────────────
if not exist "dist-installer\PYFIX-POS-Setup.exe" (
    echo [ERROR] No se encontro el instalador.
    echo         Ejecuta build.bat primero.
    pause & exit /b 1
)

:: ── Pedir version ─────────────────────────────────────────────────────────────
set /p VERSION="Version del release (ej: 1.0.0): "
if "%VERSION%"=="" ( echo [ERROR] Version requerida & pause & exit /b 1 )

set TAG=v%VERSION%

echo.
echo  Publicando PYFIX-POS-Setup.exe como release %TAG% ...
echo.

:: ── Crear release en GitHub y subir el .exe ───────────────────────────────────
gh release create %TAG% ^
    "dist-installer\PYFIX-POS-Setup.exe#PYFIX-POS-Setup.exe" ^
    --title "PYFIX POS v%VERSION%" ^
    --notes "## PYFIX POS v%VERSION%

### Instalacion
1. Descarga **PYFIX-POS-Setup.exe**
2. Ejecuta el instalador (puede pedir permisos de administrador)
3. Abre PYFIX POS e ingresa tu clave de licencia

### Requisitos
- Windows 10 / 11 (64-bit)
- 4 GB RAM minimo
- 500 MB espacio libre

### Soporte
WhatsApp: +57 300 000 0000 | hola@soyfixio.com"

if errorlevel 1 (
    echo [ERROR] No se pudo crear el release.
    echo         Verifica que gh CLI este instalado y autenticado.
    pause & exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════╗
echo ║         RELEASE PUBLICADO EXITOSAMENTE       ║
echo ╚══════════════════════════════════════════════╝
echo.
echo  URL del release:
echo  https://github.com/magojhonblackia/pyfix-pos/releases/tag/%TAG%
echo.
echo  La landing page ya descarga automaticamente desde:
echo  https://github.com/magojhonblackia/pyfix-pos/releases/latest/download/PYFIX-POS-Setup.exe
echo.
pause
