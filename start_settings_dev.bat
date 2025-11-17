@echo off
REM Start Settings Mock Server and Frontend (Windows)

echo ========================================
echo Starting Settings Module Development
echo ========================================
echo.

REM Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js first
    pause
    exit /b 1
)

REM Start mock server
echo Starting Mock Server on port 3001...
cd settings-mock-server
if not exist "node_modules\" (
    echo Installing mock server dependencies...
    call npm install
)
start "Mock Server" cmd /k npm start
timeout /t 3 >nul
echo Mock Server started
echo.

REM Start frontend
echo Starting Frontend on port 3000...
cd ..\client

REM Check if .env exists
if not exist ".env" (
    echo .env file not found. Creating from .env.example...
    copy .env.example .env
)

if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
)
start "Frontend" cmd /k npm start
echo Frontend started
echo.

echo ========================================
echo Settings Module is running!
echo.
echo Mock Server: http://localhost:3001
echo Frontend: http://localhost:3000
echo Settings: http://localhost:3000/settings
echo.
echo Press any key to stop all servers...
echo ========================================
pause >nul

REM Kill all node processes (careful!)
REM taskkill /F /IM node.exe
echo Servers stopped
