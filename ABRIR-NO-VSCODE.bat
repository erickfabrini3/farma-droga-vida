@echo off
cd /d "%~dp0"
where code >nul 2>&1
if errorlevel 1 (
  echo O comando do VS Code nao foi encontrado.
  echo Abra o VS Code e selecione Arquivo ^> Abrir Pasta.
  pause
  exit /b 1
)
code .
