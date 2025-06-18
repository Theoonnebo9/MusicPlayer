# 🎵 Neuro Music Player

A modern, Spotify-inspired music player designed specifically for Neuro-sama, Evil Neuro, and Duet songs. Features advanced equalizer, playlist management, seasonal music filtering, and Google Drive synchronization.

![Neuro Music Player](https://img.shields.io/badge/Platform-Windows-blue) ![Version](https://img.shields.io/badge/Version-1.0.0-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

### 🎛️ **Advanced Audio Controls**
- **Spotify-style Equalizer** with 22 presets (Acoustic, Bass Booster, Rock, Electronic, etc.)
- **10-band frequency control** (60Hz to 16kHz)
- **Volume control** with mute functionality
- **Repeat modes**: Off, All, Single
- **Shuffle playback**

### 🎭 **Artist Recognition**
- **Smart file parsing** - automatically detects Neuro, Evil, or Duet based on folder/filename
- **Dynamic artist display** with custom images for each singer
- **Date extraction** from filename (DD MM YY format)
- **Evil tag handling** - ignores "(evil)" identifier in filenames

### 📋 **Playlist Management**
- **Favorites system** - heart songs you love
- **Block list** - hide songs you don't want to hear
- **Custom playlists** - create unlimited playlists via text files
- **Seasonal music** - automatic holiday music filtering
- **Search functionality** - find songs by title or artist

### 🎄 **Seasonal Features**
- **Holiday mode** - restricts seasonal music to appropriate times
- **Winter Music** (December - February)
- **Halloween Music** (October)
- **Christmas Music** (December 15-31)
- **Summer Music** (June - August)
- **Development override** - disable seasonal restrictions for testing

### ☁️ **Google Drive Integration**
- **Automatic sync** from your specified Google Drive folders
- **Folder monitoring** for the three music categories:
  - Neuro music: `118gr4QuaGQGKfJ0X8VBCytvPjdzPayPY`
  - Evil music: `16WT3-_bOG2I50YS9eBwNK9W99Uh-QhwK`
  - Duet music: `16XWYR_-i0vAvKkmI9a77ZLiZTp20WHjs`

### 🎨 **Modern UI Design**
- **Spotify-inspired interface** with dark theme
- **Gradient backgrounds** and glassmorphism effects
- **Smooth animations** and hover effects
- **Responsive design** for different window sizes
- **Custom window controls** (minimize, maximize, close)

## 🚀 Quick Start

### Prerequisites
- **Windows 10/11**
- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Python** (v3.8 or higher) - [Download here](https://python.org/)
- **Google Drive API credentials** (for music sync)

### Installation

1. **Download and extract** all project files to a folder
2. **Run the setup script**:
   ```batch
   setup.bat
   ```
3. **Follow the setup instructions** displayed in the console

### Google Drive Setup (Required for Music Sync)

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create a new project** or select existing
3. **Enable Google Drive API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. **Create OAuth 2.0 credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Desktop Application"
   - Download the JSON file
5. **Rename the file** to `client_secret.json` and place it in the project root

### Adding Singer Images

Place these PNG images in the `assets/` folder:
- `Neuro_sing.png` - Image shown when Neuro sings
- `Evil_sing.png` - Image shown when Evil sings  
- `Duet_sing.png` - Image shown when both sing

## 🎮 Usage

### Starting the Application
```batch
start_app.bat
```

### Syncing Music from Google Drive

For **large libraries (800+ songs)**, use the optimized sync:

```batch
quick_sync.bat
```

**Sync Options:**
- **Quick Test** - Download 50 songs per artist (150 total) for testing
- **Fast Sync** - 5 parallel downloads (recommended for most users)  
- **Faster Sync** - 8 parallel downloads (requires good internet)
- **Resume** - Continue interrupted downloads
- **Status Check** - See current download progress

**For smaller libraries:**
```batch
sync_music.bat
```

## ⚡ Performance & Large Libraries

### Download Speed Optimization
The app includes an **optimized sync engine** specifically designed for large music libraries:

- **Parallel Downloads**: 5-8 simultaneous downloads vs 1 at a time
- **Resume Capability**: Interrupted downloads continue where they left off  
- **Smart Skipping**: Won't re-download files that already exist
- **Progress Tracking**: Real-time statistics and ETA
- **Memory Efficient**: 1MB chunks to handle large files smoothly

### Expected Download Times (800 songs ≈ 3-4GB):
- **Standard Sync**: 2-4 hours (single-threaded)
- **Fast Sync (5 threads)**: 30-60 minutes  
- **Faster Sync (8 threads)**: 20-40 minutes
- **Resume Feature**: Start from interruption point

### Tips for Large Libraries:
1. **Start with Quick Test** - Download 150 songs to test setup
2. **Use Fast Sync** - Parallel downloads are much faster
3. **Stable Internet** - Downloads can resume if interrupted
4. **Close Other Apps** - Free up bandwidth for faster downloads
5. **Background Download** - Use the app while downloading continues

### Development Mode
```batch
dev_start.bat
```

## 📁 Project Structure

```
neuro-music-player/
├── assets/                     # Singer images
│   ├── Neuro_sing.png
│   ├── Evil_sing.png
│   └── Duet_sing.png
├── music/                      # Downloaded music files
│   ├── neuro/
│   ├── evil/
│   └── duet/
├── playlists/                  # Playlist text files
│   ├── favorites.txt
│   ├── blocked.txt
│   ├── winter_music.txt
│   ├── halloween_music.txt
│   ├── christmas_music.txt
│   └── summer_music.txt
├── main.js                     # Electron main process
├── renderer.js                 # Frontend logic
├── index.html                  # Main UI
├── styles.css                  # Styling
├── google_drive_sync.py        # Google Drive sync script
├── package.json                # Node.js dependencies
├── requirements.txt            # Python dependencies
├── client_secret.json          # Google API credentials (you provide)
└── setup.bat                   # Setup script
```

## 🎵 File Naming Convention

The application automatically parses song information from filenames:

### Format Examples:
- `Song Title (11 13 24).mp3` - Neuro song from Nov 13, 2024
- `Song Title (evil) (11 13 24).mp3` - Evil song from Nov 13, 2024
- `Song Title (11 13 24).mp3` (in duet folder) - Duet song from Nov 13, 2024

### Parsing Rules:
- **Date**: Last parentheses with format `(DD MM YY)`
- **Evil identifier**: `(evil)` tag (ignored in display, used for artist detection)
- **Artist detection**: Based on source folder or evil tag
- **Clean title**: Everything before date/evil tags

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `←` | Previous song |
| `→` | Next song |
| `Ctrl+R` | Toggle repeat |
| `Ctrl+S` | Focus search |
| `Esc` | Close modal |

## 🎛️ Equalizer Presets

The application includes all Spotify equalizer presets:

**Music Genres:**
- Acoustic, Classical, Dance, Electronic, Hip-Hop, Jazz, Latin, Pop, R&B, Rock

**Audio Enhancement:**
- Bass Booster, Bass Reducer, Treble Booster, Treble Reducer, Vocal Booster
- Deep, Loudness, Small Speakers, Spoken Word

**Special:**
- Flat (no EQ), Lounge, Piano

## 📋 Playlist Management

### Built-in Playlists:
- **Favorites** - Songs you've hearted
- **Blocked** - Songs that won't play
- **Seasonal playlists** - Winter, Halloween, Christmas, Summer

### Creating Custom Playlists:
1. Click the "+" button in the sidebar
2. Enter a playlist name
3. Add songs by clicking the "+" button next to any song
4. Playlists are saved as text files in `playlists/` folder

### Manual Playlist Editing:
You can directly edit playlist files in the `playlists/` folder. Each line should contain the exact filename of an MP3 file.

## 🎄 Seasonal Music

### Holiday Mode:
When enabled, seasonal music only plays during appropriate times:
- **Winter**: December - February
- **Halloween**: October only  
- **Christmas**: December 15-31
- **Summer**: June - August

### Development Override:
Disable holiday mode in settings to test seasonal playlists year-round.

## 🔧 Advanced Configuration

### Custom Google Drive Folders:
Edit `google_drive_sync.py` to change folder IDs:
```python
DRIVE_FOLDERS = {
    'neuro': 'your_neuro_folder_id',
    'evil': 'your_evil_folder_id', 
    'duet': 'your_duet_folder_id'
}
```

### Audio Settings:
The application uses Web Audio API for the equalizer. Audio context is automatically created when the app starts.

## 🐛 Troubleshooting

### Common Issues:

**App won't start:**
- Ensure Node.js is installed and in PATH
- Run `npm install` in the project directory
- Check for missing dependencies

**Google Drive sync fails:**
- Verify `client_secret.json` is in the project root
- Check your Google Drive API quotas
- Ensure the Drive folders are accessible to your account

**Audio not playing:**
- Check if MP3 files are valid
- Verify file paths in playlists
- Check audio codec support

**Images not showing:**
- Ensure PNG files are in `assets/` folder
- Check file names match exactly: `Neuro_sing.png`, `Evil_sing.png`, `Duet_sing.png`

### Debug Mode:
Press `F12` to open developer tools and check the console for errors.

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review console logs in debug mode
3. Ensure all dependencies are installed
4. Verify Google Drive setup is complete

## 🎉 Acknowledgments

- **Spotify** for UI/UX inspiration
- **Neuro-sama** and **Evil Neuro** for the amazing content
- **Electron** for the cross-platform framework
- **Google Drive API** for cloud storage integration

---

**Enjoy your Neuro music experience! 🎵🤖**
