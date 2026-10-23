@echo off
title Multipunk
cd /d "%~dp0"
if not exist node_modules\ws (
  echo Instalando dependencias...
  call npm install --omit=dev
)
set HOST=127.0.0.1
start "" http://127.0.0.1:8765
node server.js
