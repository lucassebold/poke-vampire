@echo off
cd /d "%~dp0"
echo Starting Poke Survivors online server on http://localhost:8780 ...
start "" http://localhost:8780
node server.js
