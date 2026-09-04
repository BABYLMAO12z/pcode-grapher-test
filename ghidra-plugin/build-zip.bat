@echo off
setlocal
REM First-install/release build. Requires JDK 21 and GHIDRA_INSTALL_DIR.
if "%GHIDRA_INSTALL_DIR%"=="" if not "%GHIDRA%"=="" set "GHIDRA_INSTALL_DIR=%GHIDRA%"
if "%GHIDRA_INSTALL_DIR%"=="" (
  echo [ERR] Set GHIDRA_INSTALL_DIR to the Ghidra installation directory first.
  goto :end
)
call gradlew.bat clean buildExtension -PGHIDRA_INSTALL_DIR="%GHIDRA_INSTALL_DIR%"
if errorlevel 1 ( echo [ERR] Build failed. & goto :end )
echo.
echo ZIP created in dist\:
dir /b dist\*.zip
echo.
echo Install: Ghidra Project Manager -^> File -^> Install Extensions -^> [+] -^> choose this ZIP -^> restart Ghidra.
echo Then in CodeBrowser: File -^> Configure -^> Developer -^> enable PCODE Grapher HTTP bridge.
:end
endlocal
