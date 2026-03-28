@echo off
:: Fijar directorio de trabajo a la carpeta del script (importante al doble-clic)
cd /d "%~dp0"

title PYFIX POS - Build Instalador
color 0A

echo.
echo =============================================
echo     PYFIX POS - Build del instalador .exe
echo =============================================
echo.

:: ── Verificar que estamos en la carpeta correcta ──────────────────────────────
if not exist "backend\main.py" (
    echo [ERROR] No se encontro backend\main.py
    echo         Asegurate de ejecutar este archivo desde la raiz del proyecto.
    echo.
    pause
    exit /b 1
)

:: ── Verificar Python ──────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo         Instala Python 3.11 desde https://python.org
    echo.
    pause
    exit /b 1
)
echo [OK] Python encontrado

:: ── Verificar Node.js ─────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo         Instala Node.js desde https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js encontrado
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 1 - Frontend (Vite)
:: ══════════════════════════════════════════════════════════════════════════════
echo [1/4] Construyendo frontend (Vite)...
echo ---------------------------------------------

cd frontend

if not exist "node_modules" (
    echo      Instalando dependencias npm...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install fallo en frontend
        cd ..
        pause
        exit /b 1
    )
)

call npm run build
if errorlevel 1 (
    echo [ERROR] Vite build fallo
    cd ..
    pause
    exit /b 1
)

cd ..
echo [OK] Frontend listo ^(frontend\dist^)
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 2 - Backend con PyInstaller
:: ══════════════════════════════════════════════════════════════════════════════
echo [2/4] Compilando backend con PyInstaller...
echo ---------------------------------------------

cd backend

echo      Instalando dependencias Python...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [ERROR] pip install fallo
    cd ..
    pause
    exit /b 1
)

pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo      Instalando PyInstaller...
    pip install pyinstaller
)

if exist "..\backend-dist" rmdir /s /q "..\backend-dist"
if exist "..\build-tmp"    rmdir /s /q "..\build-tmp"

echo      Compilando backend.exe...
pyinstaller --onefile --name backend --distpath ..\backend-dist --workpath ..\build-tmp\backend --specpath ..\build-tmp --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols --hidden-import=uvicorn.protocols.http --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.lifespan --hidden-import=uvicorn.lifespan.on --hidden-import=sqlalchemy.dialects.sqlite --collect-all=passlib --noconfirm main.py

if errorlevel 1 (
    echo [ERROR] PyInstaller fallo
    cd ..
    pause
    exit /b 1
)

cd ..
echo [OK] backend.exe listo ^(backend-dist\backend.exe^)
echo.

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 3 - Electron dependencies
:: ══════════════════════════════════════════════════════════════════════════════
echo [3/4] Instalando dependencias Electron...
echo ---------------------------------------------

cd electron

if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install en electron fallo
        cd ..
        pause
        exit /b 1
    )
)

:: ══════════════════════════════════════════════════════════════════════════════
:: PASO 4 - electron-builder
:: ══════════════════════════════════════════════════════════════════════════════
echo [4/4] Construyendo instalador .exe...
echo ---------------------------------------------

:: Deshabilitar firma de codigo (evita el error de symlinks en Windows sin permisos admin)
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set CSC_LINK=

call npm run dist
if errorlevel 1 (
    echo [ERROR] electron-builder fallo
    cd ..
    pause
    exit /b 1
)

cd ..

:: ── Limpieza ──────────────────────────────────────────────────────────────────
if exist "build-tmp" rmdir /s /q "build-tmp"

:: ── Resultado ─────────────────────────────────────────────────────────────────
echo.
echo =============================================
echo     BUILD COMPLETADO EXITOSAMENTE
echo =============================================
echo.
echo  Instalador generado en:
echo  %~dp0dist-installer\PYFIX-POS-Setup.exe
echo.
echo  Siguiente paso: doble-clic en release.bat
echo  para subirlo a GitHub y dejarlo disponible.
echo.
pause
