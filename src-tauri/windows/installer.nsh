; Quantum - "Open in Quantum" Windows context menu
; Installed via NSIS hooks (Tauri 2 auto-includes this via installerHooks config)

!macro NSIS_HOOK_POSTINSTALL
  ; Directory right-click (e.g. right-click a folder)
  WriteRegStr HKCU "Software\Classes\Directory\shell\Quantum" "" "Open in Quantum"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Quantum" "Icon" "$INSTDIR\Quantum.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Quantum\command" "" '"$INSTDIR\Quantum.exe" "%1"'

  ; Background right-click (e.g. right-click empty space in a folder)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Quantum" "" "Open in Quantum"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Quantum" "Icon" "$INSTDIR\Quantum.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Quantum\command" "" '"$INSTDIR\Quantum.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up registry on uninstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Quantum"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Quantum"
!macroend
