const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const net = require('net')

const API_PORT = 8765
const IS_PACKAGED = app.isPackaged

let pythonProcess = null
let mainWindow = null

// ─── Rutas según modo ───────────────────────────────────────────────────────
function getBackendExecutable() {
  if (IS_PACKAGED) {
    // En producción: backend compilado con PyInstaller dentro de resources/
    return path.join(process.resourcesPath, 'backend', 'backend.exe')
  }
  // En desarrollo: usa Python del sistema
  return process.platform === 'win32' ? 'python' : 'python3'
}

function getFrontendUrl() {
  if (IS_PACKAGED) {
    // En producción: sirve los archivos estáticos compilados de Vite
    return `file://${path.join(process.resourcesPath, 'frontend', 'index.html')}`
  }
  // En desarrollo: Vite dev server
  return 'http://localhost:5173'
}

// ─── Iniciar backend ─────────────────────────────────────────────────────────
function startPythonBackend() {
  let args, cwd, executable

  if (IS_PACKAGED) {
    // Producción: ejecutar el .exe compilado con PyInstaller
    executable = getBackendExecutable()
    args = []
    cwd = path.join(process.resourcesPath, 'backend')
  } else {
    // Desarrollo: python -m uvicorn ...
    executable = getBackendExecutable()
    args = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(API_PORT)]
    cwd = path.join(__dirname, '..', 'backend')
  }

  pythonProcess = spawn(executable, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      API_HOST: '127.0.0.1',
    },
  })

  pythonProcess.stdout.on('data', (data) => {
    console.log('[backend]', data.toString().trim())
  })

  pythonProcess.stderr.on('data', (data) => {
    console.error('[backend]', data.toString().trim())
  })

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[backend] proceso terminado — code=${code} signal=${signal}`)
    pythonProcess = null
  })

  pythonProcess.on('error', (err) => {
    console.error('[backend] error al iniciar:', err.message)
    dialog.showErrorBox(
      'Error al iniciar el backend',
      IS_PACKAGED
        ? `No se pudo iniciar el servidor interno.\n\n${err.message}\n\nIntenta reinstalar PYFIX POS.`
        : `No se pudo iniciar el servidor Python.\n\n${err.message}\n\nAsegúrate de tener Python instalado y las dependencias instaladas (pip install -r requirements.txt).`
    )
  })
}

// ─── Esperar que el backend responda ─────────────────────────────────────────
async function waitForBackend(port, maxWaitMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => resolve(false))
    })
    if (ok) return true
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

// ─── Crear ventana principal ──────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PYFIX POS',
    // Ocultar barra de menú nativa
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const url = getFrontendUrl()
  console.log('[electron] Cargando UI desde:', url)
  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Ciclo de vida de la app ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  console.log(`[electron] Modo: ${IS_PACKAGED ? 'PRODUCCIÓN' : 'DESARROLLO'}`)
  console.log('[electron] Iniciando backend...')
  startPythonBackend()

  console.log('[electron] Esperando que el backend esté disponible...')
  const backendReady = await waitForBackend(API_PORT)

  if (!backendReady) {
    dialog.showErrorBox(
      'Backend no disponible',
      `El servidor interno no respondió en el puerto ${API_PORT}.\n\n` +
      (IS_PACKAGED
        ? 'Intenta cerrar y volver a abrir PYFIX POS. Si el problema persiste, reinstala la aplicación.'
        : `Verifica que Python esté instalado y las dependencias:\n  pip install -r backend/requirements.txt`)
    )
    app.quit()
    return
  }

  console.log('[electron] Backend listo. Abriendo ventana...')
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (pythonProcess) {
    console.log('[electron] Terminando proceso backend...')
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
})

app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow()
  }
})
