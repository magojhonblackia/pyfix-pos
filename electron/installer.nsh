; ─── installer.nsh ──────────────────────────────────────────────────────────
; Instalador PYFIX POS · pos.SoyFixio.com  —  dark premium
; ─────────────────────────────────────────────────────────────────────────────

!include "LogicLib.nsh"
!include "WinVer.nsh"


; ═══════════════════════════════════════════════════════════════════════════════
; IMAGEN DE CABECERA  (en cada pantalla excepto Welcome/Finish)
; ═══════════════════════════════════════════════════════════════════════════════
!ifndef MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE
!endif
!ifndef MUI_HEADERIMAGE_BITMAP
  !define MUI_HEADERIMAGE_BITMAP  "${BUILD_RESOURCES_DIR}\installer-header.bmp"
!endif
!ifndef MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_RIGHT
!endif


; ═══════════════════════════════════════════════════════════════════════════════
; PAGINA DE BIENVENIDA
; ═══════════════════════════════════════════════════════════════════════════════
!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE   "Bienvenido a PYFIX POS 3.0"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT    "Sistema de punto de venta para minimarkets y tiendas de barrio.$\r$\n$\r$\nEste asistente instalara en tu equipo:$\r$\n$\r$\n  - PYFIX POS (interfaz y motor de ventas)$\r$\n  - Servidor interno (FastAPI + SQLite)$\r$\n  - Visual C++ Redistributable (si es necesario)$\r$\n$\r$\nLa instalacion tarda menos de 2 minutos y no requiere internet.$\r$\n$\r$\nSoporte: pos.SoyFixio.com"
!endif


; ═══════════════════════════════════════════════════════════════════════════════
; PAGINA DE FINALIZACION
; ═══════════════════════════════════════════════════════════════════════════════
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE    "PYFIX POS listo para usar"
!endif
!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT     "PYFIX POS 3.0 se ha instalado correctamente.$\r$\n$\r$\nPuedes iniciarlo desde el acceso directo del Escritorio o desde el Menu Inicio.$\r$\n$\r$\nSoporte y capacitacion:$\r$\npos.SoyFixio.com"
!endif
!ifndef MUI_FINISHPAGE_RUN_TEXT
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir PYFIX POS ahora"
!endif
!ifndef MUI_FINISHPAGE_LINK
  !define MUI_FINISHPAGE_LINK         "Abrir pos.SoyFixio.com"
!endif
!ifndef MUI_FINISHPAGE_LINK_LOCATION
  !define MUI_FINISHPAGE_LINK_LOCATION "https://pos.SoyFixio.com"
!endif


; ═══════════════════════════════════════════════════════════════════════════════
; VERIFICACION DE REQUISITOS  —  corre antes de mostrar cualquier pantalla
;
; Flujo:
;   1. Verifica version de Windows (Win 10+)
;   2. Verifica Visual C++ 2022 x64 Runtime
;   3. Muestra dialogo con el estado de cada requisito
;   4. Si hay algo faltante: lo describe y avisa que se instalara sin internet
;   5. El usuario puede Aceptar o Cancelar antes de que empiece algo
; ═══════════════════════════════════════════════════════════════════════════════
!macro customInit

  ; ── 1. Windows 10 o superior (requisito minimo, bloquea si no cumple) ──────
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP \
      "PYFIX POS requiere Windows 10 o Windows 11.$\n$\nTu version de Windows no es compatible.$\nActualiza el sistema operativo e intenta de nuevo."
    Abort
  ${EndIf}

  ; ── 2. Construir lista de estado de dependencias ───────────────────────────
  StrCpy $R0 ""    ; lista acumulada de resultados (texto)
  StrCpy $R1 0     ; contador de componentes que se instalaran automaticamente

  ; Windows OK (ya paso el check anterior)
  StrCpy $R0 "$R0  [OK]   Windows 10 / 11$\n"

  ; Visual C++ 2022 Redistributable x64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    StrCpy $R0 "$R0  [OK]   Visual C++ 2022 Redistributable (x64)$\n"
  ${Else}
    StrCpy $R0 "$R0  [---]  Visual C++ 2022 Redistributable (x64)$\n"
    IntOp $R1 $R1 + 1
  ${EndIf}

  ; ── 3. Construir mensaje final segun resultado ─────────────────────────────
  ${If} $R1 > 0
    StrCpy $R2 "Un componente marcado [---] se instalara automaticamente.$\nEsta incluido en este instalador — no requiere internet.$\n"
  ${Else}
    StrCpy $R2 "Tu equipo cumple todos los requisitos del sistema.$\n"
  ${EndIf}

  ; ── 4. Mostrar dialogo de verificacion ────────────────────────────────────
  ;   IDOK +2  → salta el Abort (continua instalacion)
  ;   Cancel   → cae al Abort (cierra el instalador)
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
    "pos.SoyFixio.com — Verificacion del Sistema$\n$\nResultado del analisis:$\n$\n$R0$\n$R2$\nAceptar para instalar   |   Cancelar para salir." \
    IDOK +2
  Abort

!macroend


; ═══════════════════════════════════════════════════════════════════════════════
; INSTALACION  —  progreso paso a paso (corre despues de copiar archivos)
; ═══════════════════════════════════════════════════════════════════════════════
!macro customInstall

  SetDetailsPrint both

  ; ── Paso 1: Visual C++ Redistributable ────────────────────────────────────
  DetailPrint "[ 1 / 3 ]  Verificando Visual C++ Redistributable x64..."

  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"

  ${If} $0 == 1
    DetailPrint "[ 1 / 3 ]  Visual C++ x64 - OK (ya estaba instalado)"
  ${Else}
    DetailPrint "[ 1 / 3 ]  Visual C++ x64 - instalando desde paquete incluido..."

    IfFileExists "$INSTDIR\resources\vc_redist.x64.exe" vcLocal vcDownload

    vcLocal:
      ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /quiet /norestart' $0
      Delete "$INSTDIR\resources\vc_redist.x64.exe"
      Goto vcDone

    vcDownload:
      DetailPrint "[ 1 / 3 ]  Archivo local no encontrado — descargando de internet..."
      nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -Command "Invoke-WebRequest -Uri ''https://aka.ms/vs/17/release/vc_redist.x64.exe'' -OutFile ''$TEMP\vc_redist_pyfix.exe'' -UseBasicParsing; Start-Process -Wait ''$TEMP\vc_redist_pyfix.exe'' -ArgumentList ''/quiet /norestart''"'
      Pop $0

    vcDone:
    ${If} $0 == 0
      DetailPrint "[ 1 / 3 ]  Visual C++ x64 - instalado correctamente"
    ${Else}
      DetailPrint "[ 1 / 3 ]  Visual C++ x64 - fallo (cod: $0) — PYFIX POS puede no iniciar"
      MessageBox MB_OK|MB_ICONINFORMATION \
        "Visual C++ Redistributable no pudo instalarse.$\n$\nSi PYFIX POS no abre, descargalo manualmente:$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
    ${EndIf}
  ${EndIf}

  ; ── Paso 2: Archivos PYFIX POS ────────────────────────────────────────────
  DetailPrint "[ 2 / 3 ]  Registrando archivos de PYFIX POS..."

  ; ── Paso 3: Accesos directos con icono correcto ───────────────────────────
  DetailPrint "[ 3 / 3 ]  Creando accesos directos..."

  ; Recrear shortcuts apuntando explicitamente al icono de PYFIX POS
  ; Esto corrige el caso donde Windows muestra un icono generico de Electron
  SetShellVarContext all

  ; Escritorio
  CreateShortCut "$DESKTOP\PYFIX POS.lnk" \
    "$INSTDIR\PYFIX POS.exe" "" \
    "$INSTDIR\resources\app-icon.ico" 0 \
    SW_SHOWNORMAL "" "PYFIX POS - Sistema de punto de venta"

  ; Menu Inicio
  CreateDirectory "$SMPROGRAMS\PYFIX POS"
  CreateShortCut "$SMPROGRAMS\PYFIX POS\PYFIX POS.lnk" \
    "$INSTDIR\PYFIX POS.exe" "" \
    "$INSTDIR\resources\app-icon.ico" 0 \
    SW_SHOWNORMAL "" "PYFIX POS - Sistema de punto de venta"

  SetDetailsPrint lastused
  DetailPrint "  Instalacion completa. Haz clic en Finalizar."

!macroend


; Macro requerida por electron-builder
!macro customUnInstall
!macroend
