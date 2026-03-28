@echo off
chcp 65001 >nul
title PYFIX POS — Build Instalador

echo.
echo ╔══════════════════════════════════════════════╗
echo ║        PYFIX POS — Build del instalador      ║
echo ╚══════════════════════════════════════════════╝
echo.

:: ── Verificar que estamos en la carpeta correcta ──────────────────────────────
if not exist "backend\main.py" (
    echo [ERROR] Ejecuta este script desde la raiz del proyecto pyfix-pos
    pause & exit /b 1
)

:: ── Paso 1: Construir frontend (Vite) ─────────────────────────────────────────
echo [1/4] Construyendo frontend...
echo ─────────────────────────────────────────────
cd frontend

if not exist "node_modules" (
    echo      Instalando dependencias npm...
    call npm install
    if errorlevel 1 ( echo [ERROR] npm install fallo & cd .. & pause & exit /b 1 )
)

call npm run build
if errorlevel 1 ( echo [ERROR] Vite build fallo & cd .. & pause & exit /b 1 )

cd ..
echo [OK] Frontend listo en frontend\dist
echo.

:: ── Paso 2: Compilar backend con PyInstaller ──────────────────────────────────
echo [2/4] Compilando backend con PyInstaller...
echo ─────────────────────────────────────────────
cd backend

:: Instalar dependencias Python si hace falta
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo      Instalando PyInstaller...
    pip install pyinstaller
)

pip install -r requirements.txt -q
if errorlevel 1 ( echo [ERROR] pip install fallo & cd .. & pause & exit /b 1 )

:: Limpiar build anterior
if exist "..\backend-dist" rmdir /s /q "..\backend-dist"

pyinstaller --onefile ^
    --name backend ^
    --distpath ..\backend-dist ^
    --workpath ..\build-tmp\backend ^
    --specpath ..\build-tmp ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols ^
    --hidden-import=uvicorn.protocols.http ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.protocols.websockets ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.lifespan ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=sqlalchemy.dialects.sqlite ^
    --collect-all=passlib ^
    --noconfirm ^
    main.py

if errorlevel 1 ( echo [ERROR] PyInstaller fallo & cd .. & pause & exit /b 1 )

cd ..
echo [OK] backend.exe listo en backend-dist\backend.exe
echo.

:: ── Paso 3: Instalar dependencias Electron ────────────────────────────────────
echo [3/4] Instalando dependencias Electron...
echo ─────────────────────────────────────────────
cd electron

if not exist "node_modules" (
    call npm install
    if errorlevel 1 ( echo [ERROR] npm install en electron fallo & cd .. & pause & exit /b 1 )
)

:: ── Paso 4: Construir instalador .exe ─────────────────────────────────────────
echo [4/4] Construyendo instalador Windows (.exe)...
echo ─────────────────────────────────────────────
call npm run dist
if errorlevel 1 ( echo [ERROR] electron-builder fallo & cd .. & pause & exit /b 1 )

cd ..

:: ── Resultado ─────────────────────────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════════════╗
echo ║           BUILD COMPLETADO CON EXITO         ║
echo ╚══════════════════════════════════════════════╝
echo.
echo  El instalador esta en:
echo  dist-installer\PYFIX-POS-Setup.exe
echo.
echo  Siguiente paso: ejecuta release.bat para subirlo a GitHub
echo.

:: Limpiar temporales de PyInstaller
if exist "build-tmp" rmdir /s /q "build-tmp"

pause
