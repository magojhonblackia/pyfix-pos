const fs = require('fs')
const path = require('path')
const os = require('os')
const net = require('net')
const { exec } = require('child_process')

const DEFAULT_INSTALL_PATH = 'C:\\Pos.SoyFixio'

// logFile se establece dinámicamente en install() según la ruta elegida
let _logFile = null

function log(message) {
  console.log(message)
  if (_logFile) {
    try { fs.appendFileSync(_logFile, `[${new Date().toISOString()}] ${message}\n`) } catch {}
  }
}

function execAsync(command, timeoutMs = 30000) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' })
    })
  })
}

// ─────────────────────────────────────────────────────────
// waitForPort — sondea el puerto hasta que responda o timeout
// ─────────────────────────────────────────────────────────
function waitForPort(port, maxWaitMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now()
    function check() {
      if (Date.now() - start >= maxWaitMs) { resolve(false); return }
      const socket = net.connect(port, '127.0.0.1')
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error',   () => setTimeout(check, 1000))
    }
    check()
  })
}

// ─────────────────────────────────────────────────────────
// killBackendProcess — mata backend.exe por nombre de imagen
// Libera el bloqueo de archivo ANTES de intentar sobreescribir.
// También mata por puerto como fallback.
// ─────────────────────────────────────────────────────────
async function killBackendProcess(port) {
  // 1. Matar por nombre de imagen (cubre el caso donde el proceso está
  //    iniciando pero aún no ha abierto el puerto)
  await execAsync('taskkill /F /IM backend.exe', 5000).catch(() => {})

  // 2. Matar también cualquier proceso que use el puerto (por si hay otro proceso)
  try {
    const { stdout } = await execAsync('netstat -ano', 5000)
    const re = new RegExp(`[:.](${port})\\s+\\S+\\s+(?:LISTENING|ESTABLISHED)\\s+(\\d+)`, 'g')
    const pids = new Set()
    let m
    while ((m = re.exec(stdout)) !== null) {
      if (m[2] && m[2] !== '0') pids.add(m[2])
    }
    for (const pid of pids) {
      await execAsync(`taskkill /F /PID ${pid}`, 3000).catch(() => {})
    }
    if (pids.size > 0) {
      log(`⚠ Procesos en puerto ${port} terminados: ${[...pids].join(', ')}`)
    }
  } catch { /* netstat falló — continuar */ }

  // 3. Esperar a que el SO libere los handles de archivo
  await new Promise(r => setTimeout(r, 2000))
  log('✔ Procesos anteriores detenidos')
}

// ─────────────────────────────────────────────────────────
// copyDirSync — copia un directorio recursivamente con fs
// (compatible con rutas dentro del asar de Electron)
// ─────────────────────────────────────────────────────────
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ─────────────────────────────────────────────────────────
// findVcRedist — busca vc_redist.x64.exe en múltiples rutas
// En producción usa la ruta app.asar.unpacked para ejecutarlo
// ─────────────────────────────────────────────────────────
function findVcRedist() {
  // Regex que matchea "app.asar" con o sin separador al final
  const unpackedDir = __dirname.replace(/app\.asar([\\\/]|$)/, 'app.asar.unpacked$1')

  const candidates = [
    // 1. Ruta desempaquetada (asarUnpack → ejecutable real en disco)
    path.join(unpackedDir, 'vc_redist.x64.exe'),
    // 2. Raíz del installer-app (desarrollo)
    path.join(__dirname, 'vc_redist.x64.exe'),
    // 3. Carpeta build del proyecto Electron (desarrollo)
    path.join(__dirname, '..', 'electron', 'build', 'vc_redist.x64.exe'),
    // 4. Assets del installer
    path.join(__dirname, 'assets', 'vc_redist.x64.exe'),
  ]
  return candidates.find(p => fs.existsSync(p)) || null
}

// ─────────────────────────────────────────────────────────
// isVcRedistInstalled — comprueba varias claves de registro
// Cubre VC++ 2015-2022 (v14.x) en instalaciones 32 y 64 bit
// ─────────────────────────────────────────────────────────
async function isVcRedistInstalled() {
  const keys = [
    // VC++ 2015-2022 Redistributable x64 (clave principal)
    'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    // VC++ 2015-2022 Redistributable x64 (WOW6432Node — Windows 64-bit)
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
    // Fallback: buscar en Uninstall por nombre
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]

  // Método 1: claves directas con valor Installed=1
  for (const key of keys.slice(0, 2)) {
    try {
      const { stdout } = await execAsync(`reg query "${key}" /v Installed`, 3000)
      if (/Installed\s+REG_DWORD\s+0x1/i.test(stdout)) return true
    } catch {}
  }

  // Método 2: buscar en Uninstall el DisplayName que contenga "Visual C++ 2015"
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Microsoft Visual C++ 2015" /k',
      8000
    )
    if (/Microsoft Visual C\+\+ 201[5-9].*Redistributable/i.test(stdout)) return true
  } catch {}

  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Microsoft Visual C++ 2015" /k',
      8000
    )
    if (/Microsoft Visual C\+\+ 201[5-9].*Redistributable/i.test(stdout)) return true
  } catch {}

  return false
}

// ─────────────────────────────────────────────────────────
// checkRequirements — verifica el sistema antes de instalar
// ─────────────────────────────────────────────────────────
async function checkRequirements(port = 8765) {
  const results = []

  // 1. Versión de Windows (Build >= 10240 = Windows 10)
  {
    let build = 0

    // Método primario: os.release() — sincrónico, sin shell, 100% fiable
    // En Windows retorna "10.0.BUILDNUMBER" (ej. "10.0.26200" en Windows 11)
    try {
      const m = os.release().match(/^\d+\.\d+\.(\d+)/)
      if (m) build = parseInt(m[1])
    } catch {}

    // Fallback: PowerShell
    if (build === 0) {
      try {
        const { stdout: psOut } = await execAsync(
          'powershell -NoProfile -ExecutionPolicy Bypass -command "(Get-ItemProperty -Path \\"HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows NT\\\\CurrentVersion\\" -Name CurrentBuildNumber).CurrentBuildNumber"',
          6000
        )
        const psBuild = parseInt(psOut.replace(/\D/g, ''))
        if (!isNaN(psBuild) && psBuild > 0) build = psBuild
      } catch {}
    }

    // Fallback: wmic
    if (build === 0) {
      try {
        const { stdout: wmicOut } = await execAsync('wmic os get BuildNumber /value', 5000)
        const m = wmicOut.match(/BuildNumber=(\d+)/)
        if (m) build = parseInt(m[1])
      } catch {}
    }

    // Fallback: ver command
    if (build === 0) {
      try {
        const { stdout: verOut } = await execAsync('cmd /c ver', 3000)
        const m = verOut.match(/(\d+)\.(\d+)\.(\d+)/)
        if (m) build = parseInt(m[3])
      } catch {}
    }

    const label = build >= 22000
      ? `Windows 11 (Build ${build})`
      : build >= 10240
        ? `Windows 10 (Build ${build})`
        : build > 0
          ? `Build ${build} — no compatible`
          : 'No se pudo verificar'

    const detectedOk = build === 0 ? true : build >= 10240
    results.push({
      id: 'windows',
      label: 'Windows 10 o superior',
      description: build === 0
        ? 'No se pudo verificar — se asumirá compatible'
        : (build >= 10240 ? `${label} — Compatible` : label),
      ok: detectedOk,
      required: true,
      action: null
    })
  }

  // 2. Espacio libre en disco C:
  try {
    const { stdout } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value', 6000)
    const match = stdout.match(/FreeSpace=(\d+)/)
    const bytes = match ? parseInt(match[1]) : NaN
    const mb = isNaN(bytes) ? 0 : Math.floor(bytes / (1024 * 1024))
    results.push({
      id: 'disk',
      label: 'Espacio libre en disco (200 MB)',
      description: isNaN(bytes)
        ? 'No se pudo verificar el espacio disponible'
        : `${mb.toLocaleString('es-PE')} MB disponibles en C:`,
      ok: isNaN(bytes) ? true : mb >= 200,
      required: false,
      action: null
    })
  } catch {
    results.push({
      id: 'disk',
      label: 'Espacio libre en disco (200 MB)',
      description: 'No se pudo verificar — se asumirá disponible',
      ok: true,
      required: false,
      action: null
    })
  }

  // 3. Visual C++ 2015-2022 Redistributable (x64)
  try {
    const installed  = await isVcRedistInstalled()
    const vcFile     = findVcRedist()
    const canInstall = !installed && vcFile !== null
    results.push({
      id: 'vcredist',
      label: 'Visual C++ 2015-2022 Runtime',
      description: installed
        ? 'Ya instalado — no se requiere acción'
        : vcFile
          ? 'No encontrado — se instalará automáticamente'
          : 'No encontrado y archivo de instalación no disponible',
      ok: installed,
      required: false,
      action: canInstall ? 'install' : null
    })
  } catch {
    results.push({
      id: 'vcredist',
      label: 'Visual C++ 2015-2022 Runtime',
      description: 'Se instalará automáticamente',
      ok: false,
      required: false,
      action: 'install'
    })
  }

  // 4. Puerto disponible
  try {
    const { stdout } = await execAsync('netstat -ano', 6000)
    const portInUse = new RegExp(`[:.]${port}\\s`).test(stdout)
    results.push({
      id: 'port',
      label: `Puerto ${port} disponible`,
      description: portInUse
        ? `Puerto ${port} ocupado — elige otro o cierra el proceso que lo usa`
        : `Puerto ${port} disponible`,
      ok: !portInUse,
      required: false,
      action: null
    })
  } catch {
    results.push({
      id: 'port',
      label: `Puerto ${port} disponible`,
      description: 'No se pudo verificar — se asumirá disponible',
      ok: true,
      required: false,
      action: null
    })
  }

  return results
}

// ─────────────────────────────────────────────────────────
// createLauncher — escribe launch.vbs con polling WinHTTP
// (espera hasta que el backend responda en lugar de sleep fijo)
// ─────────────────────────────────────────────────────────
function createLauncher(port = 8765, installPath) {
  const launchVbs  = path.join(installPath, 'launch.vbs')
  const backendExe = path.join(installPath, 'backend.exe').replace(/\\/g, '\\\\')

  const vbsContent = [
    'Set oShell = CreateObject("WScript.Shell")',
    '',
    '\'  Configurar variables de entorno para el backend',
    'Dim oEnv',
    'Set oEnv = oShell.Environment("PROCESS")',
    `oEnv("API_PORT") = "${port}"`,
    'oEnv("API_HOST") = "127.0.0.1"',
    'oEnv("HARDWARE_MOCK") = "false"',
    `oEnv("APP_VERSION") = "${process.env.APP_VERSION || '3.0.1'}"`,
    `oEnv("GITHUB_REPO") = "${process.env.GITHUB_REPO || 'magojhonblackia/pyfix-pos'}"`,
    '',
    '\'  Iniciar backend en segundo plano (sin ventana)',
    'On Error Resume Next',
    `oShell.Run Chr(34) & "${backendExe}" & Chr(34), 0, False`,
    'On Error GoTo 0',
    '',
    '\'  Esperar que el backend responda (polling WinHTTP, max 60s)',
    'Dim http, ready, attempt',
    'Set http = CreateObject("WinHttp.WinHttpRequest.5.1")',
    'ready = False',
    'For attempt = 1 To 60',
    '  WScript.Sleep 1000',
    '  On Error Resume Next',
    `  http.Open "GET", "http://127.0.0.1:${port}/health", False`,
    '  http.SetTimeouts 800, 800, 800, 800',
    '  http.Send',
    '  If Err.Number = 0 Then',
    '    If http.Status = 200 Then',
    '      ready = True',
    '      Exit For',
    '    End If',
    '  End If',
    '  Err.Clear',
    '  On Error GoTo 0',
    'Next',
    'Set http = Nothing',
    '',
    '\'  Abrir la interfaz en el navegador predeterminado',
    `oShell.Run "cmd /c start http://127.0.0.1:${port}", 0, False`,
  ].join('\r\n')

  fs.writeFileSync(launchVbs, vbsContent, 'utf8')
  return launchVbs
}

// ─────────────────────────────────────────────────────────
// install — copia archivos e instala el sistema
// ─────────────────────────────────────────────────────────
const STEPS = [
  'Creando directorio de instalación',
  'Instalando Visual C++ Runtime',
  'Copiando motor del sistema',
  'Copiando interfaz de usuario',
  'Configurando accesos directos',
  'Esperando que el servidor esté listo'
]

async function install(port = 8765, onProgress, installPath = DEFAULT_INSTALL_PATH) {
  // Establecer archivo de log en la carpeta de instalación
  _logFile = path.join(installPath, 'install.log')

  function progress(stepIdx, message) {
    const pct = Math.round((stepIdx / STEPS.length) * 100)
    onProgress({
      step: stepIdx + 1,
      total: STEPS.length,
      label: STEPS[stepIdx] || 'Finalizando...',
      message,
      percent: pct
    })
  }

  // Saber si el directorio ya existía antes de instalar
  // (para no borrar una instalación funcional en caso de error)
  const dirExistedBefore = fs.existsSync(installPath)

  try {
    // Paso 0 — Detener procesos anteriores + crear directorio
    progress(0, `Deteniendo versión anterior (si existe)...`)
    await killBackendProcess(port)

    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true })
    }
    log('✔ Directorio de instalación listo')

    // Paso 1 — Visual C++ Redistributable
    progress(1, 'Verificando Visual C++ Redistributable...')
    const vcAlreadyInstalled = await isVcRedistInstalled()
    if (vcAlreadyInstalled) {
      log('✔ Visual C++ ya estaba instalado — omitiendo')
    } else {
      const vcRedist = findVcRedist()
      if (vcRedist) {
        progress(1, 'Instalando Visual C++ (puede tardar unos segundos)...')
        await execAsync(`"${vcRedist}" /install /quiet /norestart`, 120000)
        const nowInstalled = await isVcRedistInstalled()
        log(nowInstalled
          ? '✔ Visual C++ Redistributable instalado correctamente'
          : '⚠ Visual C++ puede no haberse instalado — el sistema puede no funcionar')
      } else {
        log('⚠ vc_redist.x64.exe no encontrado en ninguna ruta conocida — omitiendo')
      }
    }

    // Paso 2 — Copiar backend
    progress(2, 'Copiando backend.exe al directorio de instalación...')
    const backendSrc  = path.join(__dirname, 'backend.exe')
    const backendDest = path.join(installPath, 'backend.exe')
    fs.copyFileSync(backendSrc, backendDest)
    log('✔ Motor del sistema copiado')

    // Paso 3 — Copiar frontend
    // NOTA: xcopy no funciona con rutas dentro del asar de Electron.
    // copyDirSync usa el fs parchado de Electron (compatible con asar).
    progress(3, 'Copiando archivos de interfaz de usuario...')
    const frontendSrc  = path.join(__dirname, 'frontend-dist')
    const frontendDest = path.join(installPath, 'frontend')
    if (fs.existsSync(frontendDest)) fs.rmSync(frontendDest, { recursive: true, force: true })
    copyDirSync(frontendSrc, frontendDest)

    // Parchear el puerto en el bundle JS si el usuario eligió uno distinto
    if (port !== 8765) {
      try {
        const assetsDir = path.join(frontendDest, 'assets')
        const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'))
        for (const jsFile of jsFiles) {
          const jsPath = path.join(assetsDir, jsFile)
          const content = fs.readFileSync(jsPath, 'utf8')
          if (content.includes('127.0.0.1:8765')) {
            fs.writeFileSync(jsPath, content.replace(/127\.0\.0\.1:8765/g, `127.0.0.1:${port}`), 'utf8')
            log(`✔ Puerto parcheado en bundle: 8765 → ${port}`)
          }
        }
      } catch (patchErr) {
        log(`⚠ No se pudo parchear el bundle JS: ${patchErr.message}`)
      }
    }
    log('✔ Interfaz de usuario copiada')

    // Paso 4 — Crear launcher + accesos directos
    progress(4, 'Creando accesos directos y lanzador...')

    const launchVbs = createLauncher(port, installPath)
    log('✔ Lanzador creado: ' + launchVbs)

    // Copiar ícono al directorio de instalación (facilita buscarlo desde el .lnk)
    const iconSrc = path.join(__dirname, '..', 'electron', 'build', 'icon.ico')
    const iconDst = path.join(installPath, 'icon.ico')
    if (fs.existsSync(iconSrc) && !fs.existsSync(iconDst)) {
      try { fs.copyFileSync(iconSrc, iconDst) } catch {}
    }
    const iconPath = fs.existsSync(iconDst) ? iconDst : ''

    // Construye el script PowerShell para crear un acceso directo .lnk
    // Target = wscript.exe (ejecuta el VBS sin abrir ventana de cmd)
    // Arguments = "C:\Pos.SoyFixio\launch.vbs"
    const makeShortcut = (dest) => {
      const lines = [
        `$ws = New-Object -COM WScript.Shell`,
        `$s  = $ws.CreateShortcut('${dest}')`,
        `$s.TargetPath       = 'wscript.exe'`,
        `$s.Arguments        = '/nologo "${launchVbs}"'`,
        `$s.WorkingDirectory = '${installPath}'`,
        `$s.Description      = 'Pos.SoyFixio - Sistema de Punto de Venta'`,
      ]
      if (iconPath) lines.push(`$s.IconLocation = '${iconPath},0'`)
      lines.push(`$s.Save()`)
      return lines.join('; ')
    }

    // Escritorio público (visible para todos los usuarios del equipo)
    const desktopLnk = 'C:\\Users\\Public\\Desktop\\Pos.SoyFixio.lnk'
    // Escritorio del usuario actual (cubre el caso en que Public\\Desktop no sea visible)
    const userDesktopLnk = path.join(
      process.env.USERPROFILE || 'C:\\Users\\Default',
      'Desktop',
      'Pos.SoyFixio.lnk'
    )
    const startMenuLnk = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Pos.SoyFixio.lnk'

    // Crear en escritorio público
    await execAsync(`powershell -NoProfile -Command "${makeShortcut(desktopLnk)}"`)
      .catch(e => log('⚠ Escritorio público: ' + e.message))
    // Crear también en escritorio del usuario actual (doble seguridad)
    await execAsync(`powershell -NoProfile -Command "${makeShortcut(userDesktopLnk)}"`)
      .catch(e => log('⚠ Escritorio usuario: ' + e.message))
    // Menú Inicio
    await execAsync(`powershell -NoProfile -Command "${makeShortcut(startMenuLnk)}"`)
      .catch(e => log('⚠ Menú Inicio: ' + e.message))

    log('✔ Accesos directos creados (Escritorio público, Escritorio usuario, Menú Inicio)')

    // Paso 5 — Iniciar backend y esperar que responda (polling real)
    progress(5, 'Iniciando servidor — esto puede tardar hasta 30 segundos...')
    const { spawn } = require('child_process')

    spawn(backendDest, [], {
      detached: true,
      stdio:    'ignore',
      cwd:      installPath,
      env: {
        ...process.env,
        API_PORT:      String(port),
        API_HOST:      '127.0.0.1',
        HARDWARE_MOCK: 'false',
        APP_VERSION:   process.env.APP_VERSION || '3.0.1',
        GITHUB_REPO:   process.env.GITHUB_REPO || 'magojhonblackia/pyfix-pos',
      }
    }).unref()

    log('✔ Backend iniciado en segundo plano')

    // Completado (notificar al renderer antes de esperar el backend)
    onProgress({
      step:    STEPS.length,
      total:   STEPS.length,
      label:   '¡Instalación completada!',
      message: `Pos.SoyFixio instalado correctamente en ${installPath}`,
      percent: 100
    })

    // Esperar hasta que el backend responda (PyInstaller onefile puede tardar 30s+)
    const backendReady = await waitForPort(port, 60000)
    if (backendReady) {
      log('✔ Backend listo — abriendo navegador')
    } else {
      log('⚠ Backend no respondió en 60s — abriendo navegador de todas formas')
    }
    exec(`cmd /c start http://127.0.0.1:${port}`)

    return { ok: true }

  } catch (error) {
    log('❌ ERROR: ' + error.message)
    // Solo hacer rollback (borrar directorio) si fue una instalación NUEVA.
    // Si el directorio ya existía antes, NO borrarlo — hay una versión anterior
    // funcional que no debemos eliminar por un error en la actualización.
    if (!dirExistedBefore) {
      try {
        fs.rmSync(installPath, { recursive: true, force: true })
        log('Rollback ejecutado — directorio eliminado (instalación nueva)')
      } catch {}
    } else {
      log('Rollback omitido — se conserva la instalación anterior')
    }
    return { ok: false, error: error.message }
  }
}

module.exports = { install, checkRequirements, DEFAULT_PORT: 8765, DEFAULT_INSTALL_PATH }
