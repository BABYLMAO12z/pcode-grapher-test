@echo off
setlocal
REM Development loop: compile the plugin and copy its JAR into an installed extension.
REM Set GHIDRA_INSTALL_DIR once, for example:
REM   set "GHIDRA_INSTALL_DIR=C:\tools\ghidra_12.1.3_PUBLIC"
if "%GHIDRA_INSTALL_DIR%"=="" if not "%GHIDRA%"=="" set "GHIDRA_INSTALL_DIR=%GHIDRA%"
if "%GHIDRA_INSTALL_DIR%"=="" (
  echo [ERR] Set GHIDRA_INSTALL_DIR to the Ghidra 12.1.3 installation directory first.
  goto :end
)

echo === [1/2] Build plugin JAR ===
call gradlew.bat jar -PGHIDRA_INSTALL_DIR="%GHIDRA_INSTALL_DIR%"
if errorlevel 1 ( echo [ERR] Build failed. & goto :end )

if "%GHIDRA_EXTENSIONS_DIR%"=="" set "GHIDRA_EXTENSIONS_DIR=%APPDATA%\ghidra\ghidra_12.1.3_PUBLIC\Extensions"
set "DST=%GHIDRA_EXTENSIONS_DIR%\PcodeGrapherBridge\lib"
if not exist "%DST%" (
  echo [!] Extension is not installed yet. Run build-zip.bat, install the ZIP, restart Ghidra, then run this file.
  goto :end
)

echo === [2/2] Deploy plugin JAR ===
copy /y "build\libs\PcodeGrapherBridge.jar" "%DST%\" >nul
if errorlevel 1 ( echo [ERR] Copy failed. & goto :end )
echo Done. Restart Ghidra to load the updated bridge.
:end
endlocal
