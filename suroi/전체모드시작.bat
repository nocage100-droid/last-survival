@echo off
chcp 65001 > nul
title 최후의생존 - 전체 모드 서버

echo ================================================
echo   최후의생존 - 3가지 모드 동시 실행
echo ================================================
echo.

cd /d "%~dp0"

:: ========================================
:: 1단계: 기존 프로세스 및 포트 정리
:: ========================================
echo [1/6] 기존 서버 프로세스 종료 중...
taskkill /f /im bun.exe >nul 2>&1
timeout /t 2 >nul

echo [2/6] 사용 중인 포트 정리 중...
for %%p in (3000 8000 8001 8002 8003 8004 8005 8010 8011 8012 8013 8014 8015 8020 8021 8022 8023 8024 8025 8080) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)
echo        포트 정리 완료!
timeout /t 2 >nul

:: ========================================
:: 2단계: 서버 시작 (명령줄 인수로 config 지정)
:: ========================================
echo [3/6] 솔로 서버 시작 (포트 8000)...
start "솔로 서버 (8000)" cmd /k "cd /d %~dp0server && bun src/server.ts config-solo.json"

timeout /t 5 >nul

echo [4/6] 듀오 서버 시작 (포트 8010)...
start "듀오 서버 (8010)" cmd /k "cd /d %~dp0server && bun src/server.ts config-duo.json"

timeout /t 5 >nul

echo [5/6] 스쿼드 서버 시작 (포트 8020)...
start "스쿼드 서버 (8020)" cmd /k "cd /d %~dp0server && bun src/server.ts config-squad.json"

timeout /t 3 >nul

echo [6/6] 클라이언트만 시작 (포트 3000)...
start "클라이언트 (3000)" cmd /k "cd /d %~dp0client && bun run dev"

timeout /t 8 >nul

echo.
echo ================================================
echo   모든 서버가 시작되었습니다!
echo ================================================
echo.
echo   게임: http://localhost:3000
echo   관리자: http://localhost:3000/admin/
echo.
echo   서버 선택에서 모드를 고르세요:
echo   - 솔로 모드 (포트 8000)
echo   - 듀오 모드 (포트 8010)
echo   - 스쿼드 모드 (포트 8020)
echo.
echo ================================================

start http://localhost:3000

echo.
echo 종료하려면 아무 키나 누르세요...
pause >nul
taskkill /f /im bun.exe >nul 2>&1
