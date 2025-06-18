@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo          NEURO MUSIC PLAYER - BUILD SCRIPT
echo ================================================================
echo.

:: Check if this is a clean build
if "%1"=="clean" (
    echo [CLEAN BUILD] Removing previous build artifacts...
    if exist "dist" rmdir /s /q "dist"
    if exist "build" rmdir /s /q "build"
    if exist "out" rmdir /s /q "out"
    echo ✓ Clean completed
    echo.
)

:: Check Node.js installation
echo [1/6] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
) else (
    echo ✓ Node.js is installed
)

:: Check if node_modules exists
echo [2/6] Checking dependencies...
if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo ✓ Dependencies are installed
)

:: Verify required files exist
echo [3/6] Verifying project files...
set MISSING_FILES=0

if not exist "main.js" (
    echo ❌ main.js not found
    set MISSING_FILES=1
)
if not exist "renderer.js" (
    echo ❌ renderer.js not found
    set MISSING_FILES=1
)
if not exist "index.html" (
    echo ❌ index.html not found
    set MISSING_FILES=1
)
if not exist "styles.css" (
    echo ❌ styles.css not found
    set MISSING_FILES=1
)
if not exist "package.json" (
    echo ❌ package.json not found
    set MISSING_FILES=1
)

if !MISSING_FILES! == 1 (
    echo ❌ Required project files are missing!
    pause
    exit /b 1
) else (
    echo ✓ All required files present
)

:: Create build directories
echo [4/6] Preparing build environment...
if not exist "assets" mkdir assets
if not exist "playlists" mkdir playlists

:: Create placeholder files if images don't exist
if not exist "assets\Neuro_sing.png" (
    echo Creating placeholder for Neuro_sing.png...
    echo placeholder > "assets\Neuro_sing_placeholder.txt"
)
if not exist "assets\Evil_sing.png" (
    echo Creating placeholder for Evil_sing.png...
    echo placeholder > "assets\Evil_sing_placeholder.txt"
)
if not exist "assets\Duet_sing.png" (
    echo Creating placeholder for Duet_sing.png...
    echo placeholder > "assets\Duet_sing_placeholder.txt"
)

:: Create default playlist files
cd playlists
if not exist "favorites.txt" echo. > favorites.txt
if not exist "blocked.txt" echo. > blocked.txt
if not exist "winter_music.txt" echo. > winter_music.txt
if not exist "halloween_music.txt" echo. > halloween_music.txt
if not exist "christmas_music.txt" echo. > christmas_music.txt
if not exist "summer_music.txt" echo. > summer_music.txt
cd ..

echo ✓ Build environment ready

:: Run electron-builder
echo [5/6] Building application...
echo This may take several minutes...
echo.
call npm run build
if errorlevel 1 (
    echo ❌ Build failed!
    echo Check the output above for errors.
    pause
    exit /b 1
)

echo ✓ Build completed successfully

:: Create portable package
echo [6/6] Creating portable package...
if exist "dist" (
    echo ✓ Build output created in 'dist' folder
    
    :: List the created files
    echo.
    echo Created files:
    dir /b "dist\*.exe" 2>nul
    dir /b "dist\*.msi" 2>nul
    dir /b "dist\*.zip" 2>nul
    
    :: Create a simple installer info
    echo.
    echo ================================================================
    echo                    BUILD SUCCESSFUL!
    echo ================================================================
    echo.
    echo 📦 Application built successfully
    echo 📁 Output location: %CD%\dist\
    echo.
    echo DISTRIBUTION FILES:
    for %%f in ("dist\*.exe") do echo   - %%~nxf (Windows Installer)
    for %%f in ("dist\*.msi") do echo   - %%~nxf (MSI Installer)
    
    echo.
    echo INSTALLATION NOTES:
    echo - The installer includes all dependencies
    echo - Users do NOT need Node.js or Python installed
    echo - Google Drive sync requires client_secret.json
    echo - Singer images should be placed in the installation folder
    echo.
    echo ================================================================
) else (
    echo ❌ Build output not found
    echo Something went wrong during the build process.
)

echo.
echo Build process complete!
pause