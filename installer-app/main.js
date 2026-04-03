const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const installer = require('./installer')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'))
  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => app.quit())

ipcMain.handle('check-requirements', async (_event, port) => {
  return await installer.checkRequirements(port || 8765)
})

ipcMain.handle('start-install', async (_event, port, installPath) => {
  return await installer.install(
    port || 8765,
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress)
      }
    },
    installPath || installer.DEFAULT_INSTALL_PATH
  )
})

ipcMain.handle('browse-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta de instalación',
    defaultPath: 'C:\\',
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('launch-app', (_event, port) => {
  const { exec } = require('child_process')
  const fs   = require('fs')
  const path = require('path')
  const vbs  = path.join('C:\\Pos.SoyFixio', 'launch.vbs')
  if (fs.existsSync(vbs)) {
    exec(`wscript "${vbs}"`)
  } else {
    // fallback: abrir via HTTP con cmd /c start (evita chrome-error CORS)
    const appPort = port || 8765
    exec(`cmd /c start http://127.0.0.1:${appPort}`)
  }
  return { ok: true }
})
