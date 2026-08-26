@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo BYD Skyrail - Revisao local do notebook
echo Testes + build + Chrome real, sem gerar APK
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  echo O teste local nao foi executado.
  pause
  exit /b 2
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao foi encontrado no PATH.
  echo O teste local nao foi executado.
  pause
  exit /b 2
)

if not exist node_modules\vite\bin\vite.js (
  echo [1/4] Instalando dependencias do projeto...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
) else (
  echo [1/4] Dependencias ja disponiveis.
)

echo [2/4] Rodando testes automatizados...
call npm test
if errorlevel 1 goto :fail

echo [3/4] Gerando build web de teste...
call npm run build
if errorlevel 1 goto :fail

echo [4/4] Rodando smoke test em Google Chrome real...
call npm run test:browser
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo REVISAO LOCAL APROVADA
echo Nenhum APK foi gerado.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo REVISAO LOCAL REPROVADA
echo Verifique a mensagem de erro acima e envie uma captura no chat.
echo Nenhum APK foi gerado.
echo ============================================================
pause
exit /b 1
