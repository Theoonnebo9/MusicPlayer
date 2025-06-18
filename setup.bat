@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo          NEURO MUSIC PLAYER - SETUP SCRIPT
echo ================================================================
echo.

:: Check if Node.js is installed
echo [1/8] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Make sure to install the LTS version
    pause
    exit /b 1
) else (
    echo ✓ Node.js is installed
)

:: Check if Python is installed
echo [2/8] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed!
    echo Please install Python from https://python.org/
    echo Make sure to add Python to PATH during installation
    pause
    exit /b 1
) else (
    echo ✓ Python is installed
)

:: Create project directory structure
echo [3/8] Creating directory structure...
if not exist "playlists" mkdir playlists
if not exist "music" mkdir music
if not exist "music\neuro" mkdir music\neuro
if not exist "music\evil" mkdir music\evil
if not exist "music\duet" mkdir music\duet
if not exist "assets" mkdir assets
echo ✓ Directory structure created

:: Create default playlist files
echo [4/8] Creating default playlist files...
cd playlists
if not exist "favorites.txt" echo. > favorites.txt
if not exist "blocked.txt" echo. > blocked.txt
if not exist "winter_music.txt" echo. > winter_music.txt
if not exist "halloween_music.txt" echo. > halloween_music.txt
if not exist "christmas_music.txt" echo. > christmas_music.txt
cd ..
echo ✓ Default playlist files created

:: Install Node.js dependencies
echo [5/8] Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo ❌ Failed to install Node.js dependencies
    pause
    exit /b 1
)
echo ✓ Node.js dependencies installed

:: Install Python dependencies
echo [6/8] Installing Python dependencies...
call pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client requests
if errorlevel 1 (
    echo ❌ Failed to install Python dependencies
    echo Trying with pip3...
    call pip3 install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client requests
    if errorlevel 1 (
        echo ❌ Failed to install Python dependencies with pip3
        echo Please install manually: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client requests
        pause
        exit /b 1
    )
)
echo ✓ Python dependencies installed

:: Create placeholder images if they don't exist
echo [7/8] Setting up placeholder images...
cd assets
if not exist "Neuro_sing.png" (
    if not exist "Neuro_sing.svg" (
        echo Creating placeholder for Neuro_sing.png...
        echo Please place your Neuro_sing.png image in the assets folder > Neuro_sing_placeholder.txt
        echo You can also run create_placeholder_images.bat to generate test images
    )
)
if not exist "Evil_sing.png" (
    if not exist "Evil_sing.svg" (
        echo Creating placeholder for Evil_sing.png...
        echo Please place your Evil_sing.png image in the assets folder > Evil_sing_placeholder.txt
        echo You can also run create_placeholder_images.bat to generate test images
    )
)
if not exist "Duet_sing.png" (
    if not exist "Duet_sing.svg" (
        echo Creating placeholder for Duet_sing.png...
        echo Please place your Duet_sing.png image in the assets folder > Duet_sing_placeholder.txt
        echo You can also run create_placeholder_images.bat to generate test images
    )
)
cd ..
echo ✓ Image placeholders set up

:: Create run scripts
echo [8/8] Creating run scripts...

:: Create start script
echo @echo off > start_app.bat
echo echo Starting Neuro Music Player... >> start_app.bat
echo call npm start >> start_app.bat

:: Create Google Drive sync scripts
echo @echo off > sync_music.bat
echo echo Starting Google Drive Music Sync... >> sync_music.bat
echo python google_drive_sync.py >> sync_music.bat
echo pause >> sync_music.bat

echo @echo off > sync_music_fast.bat
echo echo Starting OPTIMIZED Google Drive Music Sync... >> sync_music_fast.bat
echo python google_drive_sync_optimized.py >> sync_music_fast.bat
echo pause >> sync_music_fast.bat

:: Create development script
echo @echo off > dev_start.bat
echo echo Starting Neuro Music Player in Development Mode... >> dev_start.bat
echo call npm start >> dev_start.bat

:: Create optimized launcher
echo @echo off > start_app_optimized.bat
echo echo Starting Neuro Music Player ^(Optimized^)... >> start_app_optimized.bat
echo set ELECTRON_ENABLE_LOGGING=0 >> start_app_optimized.bat
echo set ELECTRON_DISABLE_SECURITY_WARNINGS=true >> start_app_optimized.bat
echo call npm start >> start_app_optimized.bat

echo ✓ Run scripts created

echo.
echo ================================================================
echo                    SETUP COMPLETE! 
echo ================================================================
echo.
echo 📁 Project structure created
echo 📦 Dependencies installed
echo 🎵 Playlist files ready
echo 🚀 Run scripts generated
echo.
echo NEXT STEPS:
echo.
echo 1. GOOGLE DRIVE SETUP (Required for music sync):
echo    - Go to https://console.cloud.google.com/
echo    - Create a new project or select existing
echo    - Enable Google Drive API
echo    - Create OAuth 2.0 credentials
echo    - Download client_secret.json to this folder
echo.
echo 2. ADD YOUR IMAGES:
echo    - Place Neuro_sing.png in assets/
echo    - Place Evil_sing.png in assets/
echo    - Place Duet_sing.png in assets/
echo.
echo 3. SYNC YOUR MUSIC:
echo    - Run: sync_music.bat (after setting up Google Drive)
echo.
echo 4. START THE APP:
echo    - Run: start_app.bat
echo.
echo ================================================================
echo.
echo QUICK START COMMANDS:
echo   start_app.bat                 - Start the music player
echo   create_placeholder_images.bat - Create test singer images
echo   quick_sync.bat                - Choose sync options (recommended for 800+ songs)
echo   sync_music_fast.bat           - Fast parallel sync (recommended)
echo   fix_permissions.bat           - Fix cache permission warnings
echo   reset_settings.bat            - Reset all settings to defaults
echo   dev_start.bat                 - Start in development mode
echo.
echo ================================================================
echo.

:: Check if client_secret.json exists
if not exist "client_secret.json" (
    echo ⚠️  WARNING: client_secret.json not found!
    echo    Music sync will not work until you add this file.
    echo    See instructions above for Google Drive setup.
    echo.
)

:: Check if images exist
set MISSING_IMAGES=0
if not exist "assets\Neuro_sing.png" (
    set MISSING_IMAGES=1
)
if not exist "assets\Evil_sing.png" (
    set MISSING_IMAGES=1
)
if not exist "assets\Duet_sing.png" (
    set MISSING_IMAGES=1
)

:: Check if images exist
set MISSING_IMAGES=0
if not exist "assets\Neuro_sing.png" (
    if not exist "assets\Neuro_sing.svg" (
        set MISSING_IMAGES=1
    )
)
if not exist "assets\Evil_sing.png" (
    if not exist "assets\Evil_sing.svg" (
        set MISSING_IMAGES=1
    )
)
if not exist "assets\Duet_sing.png" (
    if not exist "assets\Duet_sing.svg" (
        set MISSING_IMAGES=1
    )
)

if !MISSING_IMAGES! == 1 (
    echo ⚠️  WARNING: Singer images not found!
    echo    To see singer images in the app, you can:
    echo    Option 1: Add your PNG images to assets/ folder:
    echo              - Neuro_sing.png
    echo              - Evil_sing.png  
    echo              - Duet_sing.png
    echo    Option 2: Run create_placeholder_images.bat to generate test images
    echo.
)

echo Ready to launch! Run 'start_app.bat' when you're ready.
echo.
pause