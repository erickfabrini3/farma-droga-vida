@echo off
title Droga Vida Popular - Site local
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js nao esta instalado.
  echo Instale o Node.js 22 ou mais recente e tente novamente.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando os componentes do site. Isso pode demorar alguns minutos...
  call npm install
  if errorlevel 1 (
    echo Nao foi possivel instalar os componentes.
    pause
    exit /b 1
  )
)

echo.
echo Site disponivel em http://localhost:5173
echo Painel: http://localhost:5173/admin
echo Para encerrar, pressione Ctrl + C.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
