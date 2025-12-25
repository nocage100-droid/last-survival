@echo off
chcp 65001 > nul
title 최후의생존 전체 서버

echo ========================================
echo   최후의생존 (커피 프리 지원) 서버 시작
echo ========================================
echo.

:: 기존 프로세스 종료
echo [1/4] 기존 서버 프로세스 종료 중...
taskkill /F /IM bun.exe 2>nul
timeout /t 2 /nobreak > nul

cd /d "%~dp0"

echo [2/4] 관리자 API 서버 시작... (별도 창)
start "Suroi Admin API" cmd /c "cd /d %~dp0server && bun run admin-api.ts"

timeout /t 2 /nobreak > nul

echo [3/4] 게임 서버 시작...
echo.
echo ========================================
echo   게임:    http://localhost:3000
echo   관리자:  http://localhost:3000/admin/
echo   API:     http://localhost:8080
echo ========================================
echo.

echo [4/4] 브라우저에서 게임 열기...
start http://localhost:3000

echo.
echo Ctrl+C를 눌러 서버를 종료하세요.
echo.

bun dev

pause
