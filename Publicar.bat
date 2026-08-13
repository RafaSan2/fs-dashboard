@echo off
title Publicar FS Dashboard
cd /d C:\FS

echo ==========================================
echo       PUBLICANDO FS DASHBOARD
echo ==========================================
echo.

echo [1/3] Preparando archivos...
git add .

echo.
echo [2/3] Verificando cambios...
git diff --cached --quiet

if %errorlevel%==0 (
    echo.
    echo No hay cambios para publicar.
    echo.
    goto FIN
)

echo.
echo Creando nueva version...
git commit -m "Actualizacion de pantalla"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: No se pudo crear el commit.
    goto ERROR
)

echo.
echo [3/3] Enviando a GitHub...
git push origin main

if %errorlevel% neq 0 (
    echo.
    echo ERROR: No se pudo enviar la actualizacion a GitHub.
    goto ERROR
)

echo.
echo ==========================================
echo       PUBLICACION COMPLETADA
echo ==========================================
echo.
echo GitHub Pages comenzara a actualizarse.
echo.

goto FIN

:ERROR
echo.
echo ==========================================
echo             PUBLICACION FALLIDA
echo ==========================================
echo.

:FIN
pause