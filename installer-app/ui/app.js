// ═══════════════════════════════════════════════════════
//  Pos.SoyFixio — Installer Wizard
// ═══════════════════════════════════════════════════════

const STEPS_ORDER = ['welcome', 'requirements', 'installing', 'complete']

// Configuración elegida por el usuario
let chosenPort = 8765
let chosenPath = 'C:\\Pos.SoyFixio'

const INSTALL_STEPS = [
  'Creando directorio de instalación',
  'Instalando Visual C++ Runtime',
  'Copiando motor del sistema',
  'Copiando interfaz de usuario',
  'Configurando accesos directos',
  'Iniciando el sistema'
]

// ── Helpers ──────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function now() {
  return new Date().toLocaleTimeString('es', { hour12: false })
}

// ── Navegación ───────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'))
  document.getElementById(`screen-${name}`)?.classList.remove('hidden')

  const idx = STEPS_ORDER.indexOf(name)
  document.querySelectorAll('.step-item').forEach((el, i) => {
    el.classList.remove('active', 'done')
    if (i < idx) el.classList.add('done')
    if (i === idx) el.classList.add('active')
  })
}

// ── Helpers de puerto y ruta ──────────────────────────────
function readPort() {
  const input = document.getElementById('input-port')
  const val = parseInt(input?.value)
  return (!isNaN(val) && val >= 1024 && val <= 65535) ? val : 8765
}

function readPath() {
  const input = document.getElementById('input-path')
  const val = input?.value?.trim()
  return val || 'C:\\Pos.SoyFixio'
}

// ── Pantalla 2: Requisitos ───────────────────────────────
async function runRequirementsCheck() {
  chosenPort = readPort()
  chosenPath = readPath()
  showScreen('requirements')

  const list = document.getElementById('req-list')
  const errBox = document.getElementById('req-error')
  const installBtn = document.getElementById('btn-start-install')

  errBox.classList.add('hidden')
  installBtn.classList.add('hidden')
  list.innerHTML = ''

  // Crear 4 placeholders con spinner
  const placeholderLabels = [
    'Versión de Windows',
    'Espacio libre en disco',
    'Visual C++ Runtime',
    `Puerto ${chosenPort}`
  ]

  placeholderLabels.forEach((_, i) => {
    const div = document.createElement('div')
    div.className = 'req-item checking'
    div.id = `req-idx-${i}`
    div.innerHTML = `
      <div class="req-icon"><div class="spinner"></div></div>
      <div class="req-info">
        <div class="req-name">Verificando...</div>
        <div class="req-detail">Por favor espere</div>
      </div>
    `
    list.appendChild(div)
  })

  // Ejecutar verificación real con el puerto elegido
  const results = await window.electron.checkRequirements(chosenPort)

  // Animar resultados uno a uno
  for (let i = 0; i < results.length; i++) {
    await delay(280 + i * 200)
    renderReqItem(results[i], i)
  }

  await delay(250)

  // Evaluar si hay bloqueantes
  const blockers = results.filter(r => r.required && !r.ok)

  if (blockers.length > 0) {
    const msgEl = document.getElementById('req-error-msg')
    const items = blockers.map(b => `&bull; <strong>${b.label}</strong>: ${b.description}`).join('<br>')
    msgEl.innerHTML = `No se puede continuar. ${blockers.length === 1 ? 'Requisito no cumplido' : 'Requisitos no cumplidos'}:<br>${items}`
    errBox.classList.remove('hidden')
  } else {
    installBtn.classList.remove('hidden')
  }
}

function renderReqItem(req, index) {
  const el = document.getElementById(`req-idx-${index}`)
  if (!el) return

  let status, badgeClass, badgeText, iconHtml

  if (req.ok) {
    status = 'ok'; badgeClass = 'ok'; badgeText = 'OK'
    iconHtml = `<svg viewBox="0 0 20 20" fill="currentColor" style="color:#22c55e">
      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
    </svg>`
  } else if (!req.required) {
    // "Auto" solo cuando hay acción automática disponible (p.ej. instalar vcredist)
    // "Aviso" cuando el problema existe pero no puede corregirse automáticamente
    const canAutoFix = req.action === 'install'
    status = 'warn'
    badgeClass = 'auto'
    badgeText = canAutoFix ? 'Auto' : 'Aviso'
    iconHtml = `<svg viewBox="0 0 20 20" fill="currentColor" style="color:#f59e0b">
      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
    </svg>`
  } else {
    status = 'fail'; badgeClass = 'fail'; badgeText = 'Error'
    iconHtml = `<svg viewBox="0 0 20 20" fill="currentColor" style="color:#ef4444">
      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>`
  }

  el.className = `req-item ${status}`
  el.innerHTML = `
    <div class="req-icon">${iconHtml}</div>
    <div class="req-info">
      <div class="req-name">${req.label}</div>
      <div class="req-detail">${req.description}</div>
    </div>
    <span class="req-badge ${badgeClass}">${badgeText}</span>
  `
}

// ── Pantalla 3: Instalación ──────────────────────────────
async function startInstall() {
  showScreen('installing')

  const logEl     = document.getElementById('install-log')
  const fillEl    = document.getElementById('progress-fill')
  const percentEl = document.getElementById('progress-percent')
  const labelEl   = document.getElementById('install-current-label')
  const trackEl   = document.getElementById('steps-track')

  // Construir track de pasos
  INSTALL_STEPS.forEach((label, i) => {
    const div = document.createElement('div')
    div.className = 'track-step'
    div.id = `track-step-${i}`
    div.innerHTML = `<span class="track-dot"></span><span>${label}</span>`
    trackEl.appendChild(div)
  })

  // Registrar listener de progreso
  window.electron.onProgress((data) => {
    // Barra de progreso
    fillEl.style.width = data.percent + '%'
    percentEl.textContent = data.percent + '%'
    labelEl.textContent = data.label

    // Marcar steps del track
    INSTALL_STEPS.forEach((_, i) => {
      const el = document.getElementById(`track-step-${i}`)
      if (!el) return
      el.classList.remove('active', 'done')
      if (i + 1 < data.step) el.classList.add('done')
      if (i + 1 === data.step) el.classList.add('active')
    })

    // Log
    const type = data.percent === 100 ? 'success' : 'info'
    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.innerHTML = `<span class="log-time">${now()}</span><span class="log-msg">${data.message}</span>`
    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight
  })

  const result = await window.electron.startInstall(chosenPort, chosenPath)

  if (result.ok) {
    showScreen('complete')
    const portEl = document.getElementById('complete-port')
    if (portEl) portEl.textContent = chosenPort
    const pathEl = document.getElementById('complete-path')
    if (pathEl) pathEl.textContent = chosenPath
  } else {
    showComplete(false, result.error)
  }
}

// ── Pantalla 4: Completado ───────────────────────────────
function showComplete(success, errorMsg) {
  showScreen('complete')

  if (!success) {
    const icon = document.getElementById('complete-icon')
    icon.className = 'complete-icon error'
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`
    document.getElementById('complete-title').textContent = 'Error en la instalación'
    document.getElementById('complete-msg').textContent   = errorMsg || 'Se produjo un error durante la instalación.'
    document.getElementById('complete-details').innerHTML = `
      <div class="info-row">
        <span class="info-label">Detalle del error</span>
        <span class="info-value" style="color:#ef4444;font-size:11px">${errorMsg}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Acción</span>
        <span class="info-value">Los archivos parciales fueron eliminados (rollback)</span>
      </div>
    `
    document.getElementById('btn-finish').textContent = 'Cerrar'
  }
}

// ── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Validación visual del input de puerto
  const portInput  = document.getElementById('input-port')
  const portStatus = document.getElementById('port-status')
  if (portInput && portStatus) {
    portInput.addEventListener('input', () => {
      const val = parseInt(portInput.value)
      if (isNaN(val) || val < 1024 || val > 65535) {
        portStatus.textContent = 'Rango válido: 1024–65535'
        portStatus.style.color = '#ef4444'
        portInput.style.borderColor = '#ef4444'
      } else if (val === 8765) {
        portStatus.textContent = 'Predeterminado'
        portStatus.style.color = 'var(--text-muted)'
        portInput.style.borderColor = 'var(--border)'
      } else {
        portStatus.textContent = `Puerto personalizado`
        portStatus.style.color = '#f59e0b'
        portInput.style.borderColor = '#f59e0b'
      }
    })
  }

  // Browse folder
  document.getElementById('btn-browse').addEventListener('click', async () => {
    const result = await window.electron.browseFolder()
    if (result) {
      const input = document.getElementById('input-path')
      input.value = result
      chosenPath = result
    }
  })

  document.getElementById('btn-check-reqs').addEventListener('click', () => {
    runRequirementsCheck()
  })

  document.getElementById('btn-back-welcome').addEventListener('click', () => {
    showScreen('welcome')
  })

  document.getElementById('btn-start-install').addEventListener('click', () => {
    startInstall()
  })

  document.getElementById('btn-finish').addEventListener('click', () => {
    window.close()
  })

  document.getElementById('btn-open-app').addEventListener('click', async () => {
    const btn = document.getElementById('btn-open-app')
    btn.disabled = true
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-color:rgba(255,255,255,.2);border-top-color:#fff"></span> Abriendo...'
    await window.electron.launchApp(chosenPort)
    setTimeout(() => {
      btn.disabled = false
      btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg> Abrir Pos.SoyFixio`
    }, 6000)
  })
})
