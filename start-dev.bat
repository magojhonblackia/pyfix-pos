@echo off
cd /d "%~dp0"
title PYFIX POS - Modo Desarrollo

echo.
echo =============================================
echo     PYFIX POS - Iniciando en modo DEV
echo =============================================
echo.

:: Matar cualquier proceso anterior en los puertos usados
echo [1/3] Liberando puertos anteriores...
powershell -Command "$conns = Get-NetTCPConnection -LocalPort 8765,5173 -ErrorAction SilentlyContinue; foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
timeout /t 1 /nobreak >nul

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado.
    pause & exit /b 1
)

:: Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    pause & exit /b 1
)

echo [2/3] Instalando dependencias si hace falta...
cd frontend
if not exist "node_modules" call npm install
cd ..\electron
if not exist "node_modules" call npm install
cd ..

echo [3/3] Arrancando backend + frontend + electron...
echo.
echo  Backend  -> http://127.0.0.1:8765
echo  Frontend -> http://localhost:5173
echo.

:: Instalar dependencias del backend si hace falta
cd backend
pip install -r requirements.txt -q 2>nul
cd ..

:: Abrir 3 ventanas: backend, frontend (vite), electron
start "PYFIX Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8765 --reload"
timeout /t 3 /nobreak >nul

start "PYFIX Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 4 /nobreak >nul

start "PYFIX Electron" cmd /k "cd /d %~dp0electron && npx electron ."

echo.
echo Abiertos 3 terminales. Espera unos segundos y la app se abre sola.
echo Cierra esta ventana cuando termines de trabajar.
echo.
pause
