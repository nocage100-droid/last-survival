@echo off
chcp 65001 > nul
title Suroi 관리자 API 서버

echo ========================================
echo   Suroi 관리자 API 서버
echo ========================================
echo.

cd /d "%~dp0server"

echo [정보] 관리자 API 서버를 시작합니다...
echo.
echo ----------------------------------------
echo   API 주소: http://localhost:8080
echo ----------------------------------------
echo.
echo 게임 서버(서버시작.bat)도 별도로 실행하세요!
echo Ctrl+C를 눌러 서버를 종료하세요.
echo.

bun run admin-api.ts

pause
