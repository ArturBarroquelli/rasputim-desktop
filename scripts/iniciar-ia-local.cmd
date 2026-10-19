@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "LLAMA=vendor\llama\llama-server.exe"
if not exist "%LLAMA%" (
  echo [ERRO] llama-server.exe nao encontrado em vendor\llama\
  echo Copie o executavel e as DLLs oficiais do llama.cpp para essa pasta.
  pause
  exit /b 1
)

set "MODEL="
for %%F in (models\*.gguf) do (
  if not defined MODEL set "MODEL=%%F"
)
if not defined MODEL (
  echo [ERRO] Nenhum modelo .gguf encontrado em models\
  echo Copie o modelo local para a pasta models.
  pause
  exit /b 1
)

echo Iniciando IA local do Rasputim...
echo Modelo: %MODEL%
echo Endpoint: http://127.0.0.1:8080
"%LLAMA%" --model "%MODEL%" --host 127.0.0.1 --port 8080 --ctx-size 4096
endlocal
