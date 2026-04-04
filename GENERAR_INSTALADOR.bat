@echo off
:: ── Auto-elevar a Administrador si no lo somos ya ─────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs -WorkingDirectory \"%~dp0\""
    exit /b
)

:: Fijar directorio de trabajo a la carpeta del script
cd /d "%~dp0"

title Pos.SoyFixio — Generando Instalador
color 0A

:: ── Versión del instalador ────────────────────────────────────────────────────
:: Cambia este valor antes de generar una nueva versión para distribución.
:: El backend.exe la expone en /api/system/version y el frontend la usa
:: para detectar actualizaciones disponibles en GitHub Releases.
set APP_VERSION=3.0.1
set GITHUB_REPO=magojhonblackia/pyfix-pos

echo.
echo ================================================
echo   GENERANDO INSTALADOR - Pos.SoyFixio v%APP_VERSION%
echo ================================================
echo.

:: ── Verificar herramientas ──────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no encontrado.
    echo         Instala Python 3.10+ desde https://python.org
    echo         Asegurate de marcar "Add Python to PATH" durante la instalacion.
    echo.
    pause & exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado.
    echo         Instala Node.js desde https://nodejs.org
    echo.
    pause & exit /b 1
)

:: Verificar que estamos en la carpeta correcta
if not exist "backend\main.py" (
    echo [ERROR] No se encontro backend\main.py
    echo         Ejecuta este archivo desde la raiz del proyecto pyfix-pos.
    echo.
    pause & exit /b 1
)

echo [OK] Python y Node.js encontrados
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 1 - Frontend (Vite)
:: ══════════════════════════════════════════════════════════════════════════════
echo [1/5] Construyendo interfaz de usuario (Vite)...
echo ─────────────────────────────────────────────

cd frontend

if not exist "node_modules" (
    echo      Instalando dependencias npm...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install fallo en frontend
        cd ..
        pause & exit /b 1
    )
)

call npm run build
if errorlevel 1 (
    echo [ERROR] Fallo la compilacion del frontend
    cd ..
    pause & exit /b 1
)

cd ..
echo [OK] Interfaz de usuario lista ^(frontend\dist^)
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 2 - Backend con PyInstaller
:: ══════════════════════════════════════════════════════════════════════════════
echo [2/5] Compilando servidor con PyInstaller ^(2-4 minutos^)...
echo ─────────────────────────────────────────────

cd backend

echo      Instalando dependencias Python...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [ERROR] pip install fallo
    cd ..
    pause & exit /b 1
)

pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo      Instalando PyInstaller...
    pip install pyinstaller
)

pip install aiofiles -q

if exist "..\backend-dist" rmdir /s /q "..\backend-dist"
if exist "..\build-tmp"    rmdir /s /q "..\build-tmp"

mkdir "..\backend-dist"              2>nul
mkdir "..\build-tmp\backend\backend" 2>nul

echo      Compilando backend.exe (v%APP_VERSION%)...
:: Inyectar versión y repo como variables de entorno en el exe compilado
set APP_VERSION=%APP_VERSION%
set GITHUB_REPO=%GITHUB_REPO%
pyinstaller --onefile --name backend ^
  --distpath ..\backend-dist ^
  --workpath ..\build-tmp\backend ^
  --specpath ..\build-tmp ^
  --hidden-import=uvicorn.main ^
  --hidden-import=uvicorn.config ^
  --hidden-import=uvicorn.logging ^
  --hidden-import=uvicorn.workers ^
  --hidden-import=uvicorn.loops ^
  --hidden-import=uvicorn.loops.auto ^
  --hidden-import=uvicorn.loops.asyncio ^
  --hidden-import=uvicorn.protocols ^
  --hidden-import=uvicorn.protocols.http ^
  --hidden-import=uvicorn.protocols.http.auto ^
  --hidden-import=uvicorn.protocols.http.h11_impl ^
  --hidden-import=uvicorn.protocols.websockets ^
  --hidden-import=uvicorn.protocols.websockets.auto ^
  --hidden-import=uvicorn.lifespan ^
  --hidden-import=uvicorn.lifespan.on ^
  --hidden-import=uvicorn.lifespan.off ^
  --hidden-import=anyio ^
  --hidden-import=anyio._backends._asyncio ^
  --hidden-import=anyio._backends._trio ^
  --hidden-import=h11 ^
  --hidden-import=h11._connection ^
  --hidden-import=h11._events ^
  --hidden-import=fastapi ^
  --hidden-import=fastapi.middleware ^
  --hidden-import=fastapi.middleware.cors ^
  --hidden-import=fastapi.staticfiles ^
  --hidden-import=starlette ^
  --hidden-import=starlette.middleware ^
  --hidden-import=starlette.middleware.cors ^
  --hidden-import=starlette.routing ^
  --hidden-import=starlette.responses ^
  --hidden-import=starlette.staticfiles ^
  --hidden-import=pydantic ^
  --hidden-import=pydantic.v1 ^
  --hidden-import=pydantic_core ^
  --hidden-import=sqlalchemy ^
  --hidden-import=sqlalchemy.orm ^
  --hidden-import=sqlalchemy.dialects.sqlite ^
  --hidden-import=sqlalchemy.ext.declarative ^
  --hidden-import=bcrypt ^
  --hidden-import=passlib ^
  --hidden-import=passlib.handlers ^
  --hidden-import=passlib.handlers.bcrypt ^
  --hidden-import=jose ^
  --hidden-import=jose.jwt ^
  --hidden-import=multipart ^
  --hidden-import=email_validator ^
  --hidden-import=aiofiles ^
  --hidden-import=win32print ^
  --hidden-import=win32api ^
  --hidden-import=win32con ^
  --hidden-import=pywintypes ^
  --collect-all=uvicorn ^
  --collect-all=anyio ^
  --collect-all=passlib ^
  --collect-all=escpos ^
  --noconfirm main.py

if errorlevel 1 (
    echo [ERROR] PyInstaller fallo. Revisa los mensajes de error arriba.
    cd ..
    pause & exit /b 1
)

cd ..
echo [OK] backend.exe listo ^(backend-dist\backend.exe^)
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 3 - Visual C++ Redistributable
:: ══════════════════════════════════════════════════════════════════════════════
echo [3/5] Verificando Visual C++ Redistributable...
echo ─────────────────────────────────────────────

:: Buscar vc_redist en orden de prioridad
set VC_SRC=

if exist "installer-app\vc_redist.x64.exe" (
    set VC_SRC=installer-app\vc_redist.x64.exe
    echo [OK] vc_redist.x64.exe ya esta en installer-app
    goto vc_ready
)

if exist "electron\build\vc_redist.x64.exe" (
    set VC_SRC=electron\build\vc_redist.x64.exe
    echo      Copiando vc_redist desde electron\build...
    copy /Y "electron\build\vc_redist.x64.exe" "installer-app\vc_redist.x64.exe" >nul
    echo [OK] vc_redist.x64.exe copiado a installer-app
    goto vc_ready
)

echo      Descargando vc_redist.x64.exe de Microsoft...
echo      ^(Solo se descarga una vez, se incluira en el instalador^)
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'installer-app\vc_redist.x64.exe' -UseBasicParsing"
if errorlevel 1 (
    echo [AVISO] No se pudo descargar vc_redist.x64.exe
    echo         Descargalo manualmente desde:
    echo         https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo         y copialo a: installer-app\vc_redist.x64.exe
    echo         El instalador funcionara sin el, pero no podra instalar VC++ automaticamente.
    echo.
) else (
    echo [OK] vc_redist.x64.exe descargado
)

:vc_ready
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 4 - Copiar archivos al directorio del instalador
:: ══════════════════════════════════════════════════════════════════════════════
echo [4/5] Empaquetando archivos en installer-app...
echo ─────────────────────────────────────────────

:: Copiar backend.exe
copy /Y "backend-dist\backend.exe" "installer-app\backend.exe"
if errorlevel 1 (
    echo [ERROR] No se pudo copiar backend.exe a installer-app
    pause & exit /b 1
)
echo [OK] backend.exe copiado

:: Copiar frontend compilado
if exist "installer-app\frontend-dist" rmdir /s /q "installer-app\frontend-dist"
xcopy "frontend\dist" "installer-app\frontend-dist" /E /I /Y /Q
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el frontend a installer-app
    pause & exit /b 1
)
echo [OK] Frontend copiado ^(installer-app\frontend-dist^)
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 5 - Generar .exe con electron-builder
:: ══════════════════════════════════════════════════════════════════════════════
echo [5/5] Generando instalador .exe con electron-builder...
echo ─────────────────────────────────────────────

cd installer-app

if not exist "node_modules" (
    echo      Instalando dependencias Electron...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install en installer-app fallo
        cd ..
        pause & exit /b 1
    )
)

:: Limpiar cache de winCodeSign para evitar errores de firma
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    echo      Limpiando cache de winCodeSign...
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
)

:: Deshabilitar firma de codigo
set CSC_IDENTITY_AUTO_DISCOVERY=false

call npm run build
set BUILD_ERROR=%ERRORLEVEL%

if %BUILD_ERROR% neq 0 (
    echo.
    echo [ERROR] electron-builder fallo
    cd ..
    pause & exit /b 1
)

cd ..

:: ── Limpiar temporales ────────────────────────────────────────────────────────
if exist "build-tmp" rmdir /s /q "build-tmp"

:: ── Resultado ─────────────────────────────────────────────────────────────────
echo.
echo ================================================
echo   INSTALADOR GENERADO CORRECTAMENTE
echo ================================================
echo.
echo   Archivo generado en:
echo   %~dp0installer-app\dist\
echo.
echo   Ese .exe es el unico archivo que el cliente
echo   necesita descargar y ejecutar.
echo.
echo   Version compilada: v%APP_VERSION%
echo.
echo   NOTA IMPORTANTE para el cliente:
echo   Al abrir la app por primera vez debe ingresar
echo   su clave de licencia en la pantalla de activacion.
echo   La clave fue enviada al correo registrado.
echo.
echo   PARA DISTRIBUIR ACTUALIZACIONES AUTOMATICAS:
echo   1. Sube el .exe generado a GitHub Releases con el tag v%APP_VERSION%
echo      https://github.com/%GITHUB_REPO%/releases/new
echo   2. Los clientes instalados veran el banner de actualizacion
echo      automaticamente (se chequea cada 6 horas).
echo   3. Al hacer click en "Actualizar ahora" se descarga e instala solo.
echo.
pause
