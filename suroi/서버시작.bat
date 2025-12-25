@echo off
chcp 65001 > nul
title Suroi 게임 서버

echo ========================================
echo   Suroi 게임 서버 시작
echo ========================================
echo.

:: 기존 bun 프로세스 종료
echo [1/3] 기존 서버 프로세스 종료 중...
taskkill /F /IM bun.exe 2>nul
timeout /t 2 /nobreak > nul

:: 작업 디렉토리 이동
cd /d "%~dp0"

echo [2/3] 게임 서버 시작 중...
echo.
echo ----------------------------------------
echo   게임 주소: http://localhost:3000
echo   관리자: http://localhost:3000/admin/
echo ----------------------------------------
echo.
echo Ctrl+C를 눌러 서버를 종료하세요.
echo.

:: 서버 시작
bun dev

pause
