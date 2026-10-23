@echo off
title Sistema de Gestion Comunitaria - Loteo Los Manios
cd /d "%~dp0"
echo ================================================================
echo Iniciando Plataforma Loteo Los Manios en http://localhost:3050
echo ================================================================
start http://localhost:3050
node server.js
pause
