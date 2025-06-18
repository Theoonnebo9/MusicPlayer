const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let appSettings = {};

// Load settings
async function loadSettings() {
    try {
        const settingsPath = path.join(__dirname, 'settings.json');
        const data = await fs.readFile(settingsPath, 'utf8');
        appSettings = JSON.parse(data);
    } catch (error) {
        console.log('No settings file found, using defaults');
        appSettings = {
            showConsole: false, // This controls dev tools, not the window
            holidayMode: false,
            volume: 70,
            playback: {
                repeatMode: 0,
                shuffled: false,
                lastSongIndex: 0,
                lastPlaylist: 'library'
            },
            equalizer: {
                enabled: true,
                preset: 'flat',
                bands: {}
            }
        };
    }
    return appSettings;
}

// Save settings
async function saveSettings(settings) {
    try {
        const settingsPath = path.join(__dirname, 'settings.json');
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        show: true, // FIXED: Always show the main window!
        icon: path.join(__dirname, 'assets/icon.png')
    });

    // Load the app
    mainWindow.loadFile('index.html');

    // FIXED: Show console/dev tools ONLY if setting is enabled
    if (appSettings.showConsole) {
        mainWindow.webContents.openDevTools();
    }

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Set up menu
    createMenu();
}

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Import Music Folder',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory']
                        });
                        
                        if (!result.canceled) {
                            mainWindow.webContents.send('folder-selected', result.filePaths[0]);
                        }
                    }
                },
                {
                    label: 'Settings',
                    click: () => {
                        mainWindow.webContents.send('open-settings-modal');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Console',
                    accelerator: 'F12',
                    click: () => {
                        if (mainWindow.webContents.isDevToolsOpened()) {
                            mainWindow.webContents.closeDevTools();
                        } else {
                            mainWindow.webContents.openDevTools();
                        }
                    }
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forcereload' },
                { role: 'togglefullscreen' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(async () => {
    await loadSettings();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers
ipcMain.handle('window-control', async (event, action) => {
    switch (action) {
        case 'minimize':
            mainWindow.minimize();
            break;
        case 'maximize':
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
            break;
        case 'close':
            mainWindow.close();
            break;
    }
});

ipcMain.handle('load-settings', async () => {
    return appSettings;
});

ipcMain.handle('save-settings', async (event, settings) => {
    // Check if console setting changed
    const consoleChanged = appSettings.showConsole !== settings.showConsole;
    
    appSettings = { ...appSettings, ...settings };
    const success = await saveSettings(appSettings);
    
    // Restart app if console setting changed
    if (consoleChanged && success) {
        app.relaunch();
        app.exit();
    }
    
    return success;
});

ipcMain.handle('set-setting', async (event, key, value) => {
    appSettings[key] = value;
    return await saveSettings(appSettings);
});

ipcMain.handle('reset-settings', async () => {
    try {
        const settingsPath = path.join(__dirname, 'settings.json');
        await fs.unlink(settingsPath);
        return true;
    } catch (error) {
        console.error('Error resetting settings:', error);
        return false;
    }
});

// Music file handlers
ipcMain.handle('get-music-files', async (event, folderPath) => {
    try {
        const files = await fs.readdir(folderPath);
        const musicFiles = files
            .filter(file => file.toLowerCase().endsWith('.mp3'))
            .map(file => ({
                name: file,
                path: path.join(folderPath, file)
            }));
        return musicFiles;
    } catch (error) {
        console.error('Error reading music folder:', error);
        return [];
    }
});

// Playlist handlers
ipcMain.handle('get-playlist-files', async () => {
    try {
        const playlistDir = path.join(__dirname, 'playlists');
        const files = await fs.readdir(playlistDir);
        const playlistFiles = files
            .filter(file => file.endsWith('.txt'))
            .map(file => ({
                name: path.basename(file, '.txt'),
                path: path.join(playlistDir, file)
            }));
        return playlistFiles;
    } catch (error) {
        console.error('Error reading playlist directory:', error);
        return [];
    }
});

ipcMain.handle('read-playlist-file', async (event, filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Error reading playlist file:', error);
        return [];
    }
});

ipcMain.handle('write-playlist-file', async (event, filePath, songs) => {
    try {
        const fullPath = path.join(__dirname, filePath);
        await fs.writeFile(fullPath, songs.join('\n'));
        return true;
    } catch (error) {
        console.error('Error writing playlist file:', error);
        return false;
    }
});

ipcMain.handle('create-playlist-file', async (event, playlistName) => {
    try {
        const filePath = path.join(__dirname, 'playlists', `${playlistName}.txt`);
        
        // Check if file already exists
        try {
            await fs.access(filePath);
            return null; // File already exists
        } catch {
            // File doesn't exist, create it
            await fs.writeFile(filePath, '');
            return filePath;
        }
    } catch (error) {
        console.error('Error creating playlist file:', error);
        return null;
    }
});

// Delete playlist file handler
ipcMain.handle('delete-playlist-file', async (event, playlistName) => {
    try {
        const filePath = path.join(__dirname, 'playlists', `${playlistName}.txt`);
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        console.error('Error deleting playlist file:', error);
        return false;
    }
});

// Google Drive setup (placeholder)
ipcMain.handle('setup-google-drive', async () => {
    try {
        // Check if client_secret.json exists
        const secretPath = path.join(__dirname, 'client_secret.json');
        await fs.access(secretPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: 'client_secret.json not found' };
    }
});