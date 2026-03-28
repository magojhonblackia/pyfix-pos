@echo off
cd /d "%~dp0"

title PYFIX POS - Publicar Release
color 0B

echo.
echo =============================================
echo     PYFIX POS - Publicar instalador
echo =============================================
echo.

:: ── Verificar que existe el instalador ───────────────────────────────────────
if not exist "dist-installer\PYFIX-POS-Setup.exe" (
    echo [ERROR] No se encontro dist-installer\PYFIX-POS-Setup.exe
    echo         Ejecuta build.bat primero.
    echo.
    pause
    exit /b 1
)

:: ── Verificar gh CLI ──────────────────────────────────────────────────────────
gh --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] gh CLI no esta instalado.
    echo         Instala desde: https://cli.github.com
    echo.
    pause
    exit /b 1
)

:: ── Pedir version ─────────────────────────────────────────────────────────────
echo  Instalador encontrado: dist-installer\PYFIX-POS-Setup.exe
echo.
set /p VERSION="Ingresa la version (ej: 1.0.0): "
if "%VERSION%"=="" (
    echo [ERROR] Version requerida
    pause
    exit /b 1
)

set TAG=v%VERSION%

echo.
echo  Publicando release %TAG% en GitHub...
echo.

gh release create %TAG% "dist-installer\PYFIX-POS-Setup.exe#PYFIX-POS-Setup.exe" --repo magojhonblackia/pyfix-pos --title "PYFIX POS v%VERSION%" --notes "## PYFIX POS v%VERSION%

**Instalacion:**
1. Descarga PYFIX-POS-Setup.exe
2. Ejecuta el instalador (puede pedir permisos de administrador)
3. Abre PYFIX POS e ingresa tu clave de licencia

**Requisitos:** Windows 10/11 de 64 bits, 4 GB RAM, 500 MB espacio libre

**Soporte:** WhatsApp o hola@soyfixio.com"

if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo crear el release.
    echo         Verifica que estés autenticado con: gh auth login
    echo.
    pause
    exit /b 1
)

echo.
echo =============================================
echo     RELEASE PUBLICADO EXITOSAMENTE
echo =============================================
echo.
echo  URL del release:
echo  https://github.com/magojhonblackia/pyfix-pos/releases/tag/%TAG%
echo.
echo  La landing descarga automaticamente el ultimo release desde:
echo  https://github.com/magojhonblackia/pyfix-pos/releases/latest/download/PYFIX-POS-Setup.exe
echo.
pause
