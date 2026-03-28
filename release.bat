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

:: ── Verificar que ese tag no exista ya ────────────────────────────────────────
gh release view %TAG% --repo magojhonblackia/pyfix-pos >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [AVISO] El release %TAG% ya existe en GitHub.
    echo         Si quieres reemplazarlo primero borralo en:
    echo         https://github.com/magojhonblackia/pyfix-pos/releases
    echo.
    pause
    exit /b 1
)

:: ── Escribir notas en archivo temporal ────────────────────────────────────────
set NOTES_FILE=%TEMP%\pyfix-release-notes.md
(
    echo ## PYFIX POS v%VERSION%
    echo.
    echo **Instalacion:**
    echo 1. Descarga PYFIX-POS-Setup.exe
    echo 2. Ejecuta el instalador ^(puede pedir permisos de administrador^)
    echo 3. Abre PYFIX POS e ingresa tu clave de licencia
    echo.
    echo **Requisitos:** Windows 10/11 de 64 bits, 4 GB RAM, 500 MB espacio libre
    echo.
    echo **Soporte:** WhatsApp o hola@soyfixio.com
) > "%NOTES_FILE%"

echo.
echo  Publicando release %TAG% en GitHub...
echo.

gh release create %TAG% "dist-installer\PYFIX-POS-Setup.exe#PYFIX-POS-Setup.exe" --repo magojhonblackia/pyfix-pos --title "PYFIX POS v%VERSION%" --notes-file "%NOTES_FILE%"

if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo crear el release.
    echo         Verifica que estes autenticado con: gh auth login
    echo.
    del "%NOTES_FILE%" >nul 2>&1
    pause
    exit /b 1
)

del "%NOTES_FILE%" >nul 2>&1

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
