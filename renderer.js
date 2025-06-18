const { ipcRenderer } = require('electron');
const path = require('path');

// Application State
let musicLibrary = [];
let currentPlaylist = [];
let shuffledPlaylist = []; // New: for shuffle functionality
let currentSongIndex = 0;
let isPlaying = false;
let isShuffled = false;
let repeatMode = 0; // 0: off, 1: all, 2: one
let currentSong = null;
let playlists = {};
let appSettings = {};
let lastPlayedIndex = 0; // For anti-consecutive logic
let previousVolume = 70; // Store previous volume for unmute
let nameSort = 'asc'; // Track name sorting direction
let dateSort = 'asc'; // Track date sorting direction

// Artist filter state
let selectedArtists = new Set(['Neuro', 'Evil', 'Duet']); // All selected by default

// ADD THESE NEW TRACKING VARIABLES:
let currentView = {
    section: 'library',
    playlist: null
};

// Audio Context for Equalizer
let audioContext;
let audioSource;
let equalizer = {};
let gainNode;

// DOM Elements
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const repeatBtn = document.getElementById('repeat-btn');
const progressSlider = document.getElementById('progress-slider');
const progress = document.getElementById('progress');
const currentTimeSpan = document.getElementById('current-time');
const durationSpan = document.getElementById('duration');
const volumeSlider = document.getElementById('volume-slider');
const volumeBtn = document.getElementById('volume-btn');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    await loadAppSettings(); // Load settings first
    setupEventListeners();
    setupAudioContext();
    await loadDownloadedMusic();
    await loadPlaylists();
    initializeArtistFilter(); // ADD THIS LINE
    applyLoadedSettings();
    updateSeasonalMusic();
    updateFavoritesCount();
    updateHolidayStatus();
    setInterval(updateSeasonalMusic, 60000);
    setInterval(autoSaveSettings, 30000);
    
    console.log('Application initialized successfully');
});

// Settings Management
async function loadAppSettings() {
    try {
        appSettings = await ipcRenderer.invoke('load-settings');
        console.log('Settings loaded:', appSettings);
    } catch (error) {
        console.error('Error loading settings:', error);
        appSettings = {}; // Fallback to empty settings
    }
}

async function saveAppSettings(newSettings = null) {
    try {
        if (newSettings) {
            // Merge new settings
            appSettings = { ...appSettings, ...newSettings };
        }
        
        // Always include current state
        const currentSettings = {
            ...appSettings,
            volume: volumeSlider.value,
            playback: {
                repeatMode: repeatMode,
                shuffled: isShuffled,
                lastSongIndex: currentSongIndex,
                lastPlaylist: currentView.playlist || currentView.section,
                // ADD CURRENT SONG TRACKING:
                currentSong: currentSong ? {
                    path: currentSong.path,
                    filename: currentSong.filename,
                    title: currentSong.title,
                    artist: currentSong.artist
                } : null
            },
            equalizer: getCurrentEqualizerSettings(),
            selectedArtists: Array.from(selectedArtists),
            currentView: {
                section: currentView.section,
                playlist: currentView.playlist
            }
        };
        
        const success = await ipcRenderer.invoke('save-settings', currentSettings);
        if (success) {
            console.log('Settings saved successfully');
        }
        return success;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
}

async function setSetting(key, value) {
    try {
        return await ipcRenderer.invoke('set-setting', key, value);
    } catch (error) {
        console.error('Error setting value:', key, value, error);
        return false;
    }
}

function applyLoadedSettings() {
    // Apply volume
    if (appSettings.volume !== undefined) {
        volumeSlider.value = appSettings.volume;
        previousVolume = appSettings.volume;
        setVolume();
    }
    
    // Apply holiday mode
    const holidayMode = appSettings.holidayMode === true;
    const holidayCheckbox = document.getElementById('holiday-mode');
    if (holidayCheckbox) {
        holidayCheckbox.checked = holidayMode;
    }
    
    // Apply repeat mode
    if (appSettings.playback?.repeatMode !== undefined) {
        repeatMode = appSettings.playback.repeatMode;
        updateRepeatButton();
    }
    
    // Apply shuffle state
    if (appSettings.playback?.shuffled !== undefined) {
        isShuffled = appSettings.playback.shuffled;
        updateShuffleButton();
    }
    
    // RESTORE ARTIST FILTER SELECTION
    if (appSettings.selectedArtists && Array.isArray(appSettings.selectedArtists)) {
        selectedArtists = new Set(appSettings.selectedArtists);
        console.log('Restored artist filter:', Array.from(selectedArtists));
        
        setTimeout(() => {
            const filterMenu = document.getElementById('artist-filter-menu');
            if (filterMenu) {
                const checkboxes = filterMenu.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = selectedArtists.has(checkbox.value);
                });
                updateArtistFilter();
            }
        }, 100);
    }
    
    // RESTORE CURRENT VIEW
    if (appSettings.currentView) {
        currentView = { ...appSettings.currentView };
        console.log('Restored current view:', currentView);
        
        setTimeout(() => {
            restoreCurrentView();
            // RESTORE CURRENT SONG AFTER VIEW IS RESTORED
            restoreCurrentSong();
        }, 500);
    } else if (appSettings.playback?.lastPlaylist) {
        currentView = {
            section: null,
            playlist: appSettings.playback.lastPlaylist
        };
        setTimeout(() => {
            restoreCurrentView();
            restoreCurrentSong();
        }, 500);
    }
    
    // Apply equalizer settings
    if (appSettings.equalizer) {
        applyEqualizerSettings(appSettings.equalizer);
    }
    
    updateSeasonInfo();
    updateHolidayStatus();
    
    console.log('Settings applied to UI');
}

function restoreCurrentSong() {
    if (!appSettings.playback?.currentSong) {
        console.log('No previous song to restore');
        return;
    }
    
    const savedSong = appSettings.playback.currentSong;
    console.log('Attempting to restore song:', savedSong);
    
    // Find the song in current playlist
    const songIndex = currentPlaylist.findIndex(song => 
        song.path === savedSong.path || song.filename === savedSong.filename
    );
    
    if (songIndex !== -1) {
        console.log(`Found saved song at index ${songIndex}: ${savedSong.title}`);
        
        // Load the song but don't auto-play
        currentSongIndex = songIndex;
        currentSong = currentPlaylist[songIndex];
        
        // Set up audio player
        audioPlayer.src = currentSong.path;
        audioPlayer.load();
        audioPlayer.currentTime = 0; // Start from beginning
        
        // Update UI
        updatePlayerInfo();
        updateSingerDisplay();
        updatePlayerFavoriteButton();
        displaySongs(); // Refresh to show playing state
        
        console.log(`Restored song: ${currentSong.title} by ${currentSong.artist}`);
    } else {
        console.log(`Could not find saved song: ${savedSong.title}`);
    }
}

function restoreCurrentView() {
    console.log('Restoring view:', currentView);
    
    if (currentView.playlist) {
        // Restore playlist view
        console.log(`Restoring playlist: ${currentView.playlist}`);
        loadPlaylist(currentView.playlist);
    } else if (currentView.section) {
        // Restore section view
        console.log(`Restoring section: ${currentView.section}`);
        switchSection(currentView.section);
    } else {
        // Default to library
        console.log('No saved view, defaulting to library');
        switchSection('library');
    }
}

function updateSeasonInfo() {
    const seasonInfo = document.getElementById('season-info');
    if (!seasonInfo) return;
    
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    let currentSeason = 'Off-season';
    if (month === 12 || month === 1 || month === 2) {
        currentSeason = '❄️ Winter';
    } else if (month >= 6 && month <= 8) {
        currentSeason = '☀️ Summer';
    } else if (month === 10) {
        currentSeason = '🎃 Halloween';
    } else if (month === 12 && day >= 15) {
        currentSeason = '🎄 Christmas';
    } else if (month === 3 || month === 4 || month === 5) {
        currentSeason = '🌸 Spring';
    } else if (month === 9 || month === 11) {
        currentSeason = '🍂 Autumn';
    }
    
    seasonInfo.textContent = `Current season: ${currentSeason} (${month}/${day})`;
}

function updateHolidayStatus() {
    const holidayStatus = document.getElementById('holiday-status');
    if (!holidayStatus) return;
    
    const holidayMode = appSettings.holidayMode === true;
    if (!holidayMode) {
        holidayStatus.textContent = '🔓 All seasonal songs available year-round';
        holidayStatus.style.color = '#1db954';
        return;
    }
    
    const totalSongs = musicLibrary.length;
    const availableSongs = getFilteredLibrary().length;
    const filteredCount = totalSongs - availableSongs;
    
    if (filteredCount > 0) {
        holidayStatus.textContent = `🚫 ${filteredCount} seasonal songs currently filtered out`;
        holidayStatus.style.color = '#e67e22';
    } else {
        holidayStatus.textContent = '✅ No seasonal songs being filtered (all seasons active)';
        holidayStatus.style.color = '#1db954';
    }
}

function getCurrentEqualizerSettings() {
    const eqSettings = {
        enabled: true,
        preset: document.getElementById('eq-preset')?.value || 'custom', // Fixed: show custom when manually adjusted
        bands: {}
    };
    
    document.querySelectorAll('.eq-slider').forEach(slider => {
        const freq = slider.dataset.freq;
        eqSettings.bands[freq] = parseFloat(slider.value);
    });
    
    return eqSettings;
}

function applyEqualizerSettings(eqSettings) {
    if (eqSettings.preset && eqSettings.preset !== 'custom') {
        document.getElementById('eq-preset').value = eqSettings.preset;
    }
    
    if (eqSettings.bands) {
        document.querySelectorAll('.eq-slider').forEach(slider => {
            const freq = slider.dataset.freq;
            if (eqSettings.bands[freq] !== undefined) {
                slider.value = eqSettings.bands[freq];
                updateEQValue(slider);
                updateEqualizer({ target: slider });
            }
        });
    }
}

function autoSaveSettings() {
    // Auto-save current state periodically
    saveAppSettings();
}

// Artist Filter Functions
function initializeArtistFilter() {
    const filterBtn = document.getElementById('artist-filter-btn');
    const filterMenu = document.getElementById('artist-filter-menu');
    const checkboxes = filterMenu.querySelectorAll('input[type="checkbox"]');
    const selectAllBtn = document.getElementById('select-all-artists');
    const clearAllBtn = document.getElementById('clear-all-artists');
    
    // Toggle dropdown
    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = filterMenu.classList.contains('show');
        
        if (isOpen) {
            closeArtistFilter();
        } else {
            openArtistFilter();
        }
    });
    
// Checkbox changes
checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        const artist = checkbox.value;
        
        if (checkbox.checked) {
            selectedArtists.add(artist);
        } else {
            selectedArtists.delete(artist);
        }
        
        updateArtistFilter();
        applyFilters();
        
        // SAVE SETTINGS WHEN ARTIST FILTER CHANGES
        saveAppSettings();
    });

    document.addEventListener('DOMContentLoaded', async () => {
    await loadAppSettings();
    setupEventListeners();
    setupAudioContext();
    await loadDownloadedMusic();
    await loadPlaylists();
    initializeArtistFilter();
    applyLoadedSettings();
    updateSeasonalMusic();
    updateFavoritesCount();
    updateHolidayStatus();
    setInterval(updateSeasonalMusic, 60000);
    setInterval(autoSaveSettings, 30000);
    
    // Initialize shuffle button state
    updateShuffleButton();
    
    console.log('Application initialized successfully');
});
});

// Select all button
selectAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedArtists.add(checkbox.value);
    });
    updateArtistFilter();
    applyFilters();
    saveAppSettings();
});

// Clear all button
clearAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        selectedArtists.delete(checkbox.value);
    });
    updateArtistFilter();
    applyFilters();
    saveAppSettings();
});
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
            closeArtistFilter();
        }
    });
    
    // Initialize display
    updateArtistFilter();
}

function openArtistFilter() {
    const filterBtn = document.getElementById('artist-filter-btn');
    const filterMenu = document.getElementById('artist-filter-menu');
    
    filterBtn.classList.add('active');
    filterMenu.classList.add('show');
}

function closeArtistFilter() {
    const filterBtn = document.getElementById('artist-filter-btn');
    const filterMenu = document.getElementById('artist-filter-menu');
    
    filterBtn.classList.remove('active');
    filterMenu.classList.remove('show');
}

function updateArtistFilter() {
    const filterText = document.getElementById('artist-filter-text');
    const filterBtn = document.getElementById('artist-filter-btn');
    
    const selectedCount = selectedArtists.size;
    const totalCount = 3;
    
    // Update button text
    if (selectedCount === 0) {
        filterText.textContent = 'No Artists';
        filterBtn.style.borderColor = '#e22134';
        filterBtn.style.color = '#e22134';
    } else if (selectedCount === totalCount) {
        filterText.textContent = 'All Artists';
        filterBtn.style.borderColor = '#535353';
        filterBtn.style.color = '#ffffff';
    } else {
        const artistList = Array.from(selectedArtists).join(', ');
        filterText.textContent = artistList;
        filterBtn.style.borderColor = '#1db954';
        filterBtn.style.color = '#1db954';
    }
    
    // Add count indicator if partially selected
    let countIndicator = filterBtn.querySelector('.filter-count');
    if (selectedCount > 0 && selectedCount < totalCount) {
        if (!countIndicator) {
            countIndicator = document.createElement('span');
            countIndicator.className = 'filter-count';
            filterBtn.insertBefore(countIndicator, filterBtn.lastElementChild);
        }
        countIndicator.textContent = selectedCount;
    } else if (countIndicator) {
        countIndicator.remove();
    }
}

function applyFilters() {
    // Determine what view we're currently in and refresh it appropriately
    const activeSection = document.querySelector('.nav-item.active')?.dataset.section;
    const activePlaylist = document.querySelector('.seasonal-item.active, .playlist-item.active')?.dataset.playlist;
    
    if (activePlaylist) {
        // We're in a specific playlist - reload it with new filters
        loadPlaylist(activePlaylist);
    } else if (activeSection === 'library') {
        // We're in library view
        currentPlaylist = getFilteredLibrary();
        currentPlaylist.sort((a, b) => a.title.localeCompare(b.title));
        displaySongs();
        updateLibraryHeaderInfo();
    } else if (activeSection === 'blocked') {
        // We're in blocked songs view
        loadBlockedSongs();
    } else if (activeSection === 'favorites') {
        // We're in favorites but no active playlist item (shouldn't happen, but handle it)
        loadPlaylist('favorites');
    }
    
    // Reset shuffle if active
    if (isShuffled) {
        createSmartShuffledPlaylist();
    }
    
    // Clear any active search when filters change
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value) {
        searchInput.value = '';
    }
}
function updateLibraryHeaderInfo() {
    const singerName = document.getElementById('singer-name');
    const songDate = document.getElementById('song-date');
    
    if (!singerName || !songDate) return;
    
    const totalSongs = musicLibrary.length;
    const availableSongs = currentPlaylist.length;
    const filteredCount = totalSongs - availableSongs;
    const selectedCount = selectedArtists.size;
    
    if (availableSongs > 0) {
        if (selectedCount === 3) {
            singerName.textContent = 'Your Music Library';
        } else if (selectedCount === 1) {
            const artist = Array.from(selectedArtists)[0];
            singerName.textContent = `${artist} Songs`;
        } else {
            const artists = Array.from(selectedArtists).join(' & ');
            singerName.textContent = `${artists} Songs`;
        }
        
        let statusText = `${availableSongs} songs available`;
        if (filteredCount > 0) {
            statusText += ` (${filteredCount} songs filtered)`;
        }
        songDate.textContent = statusText;
    } else {
        singerName.textContent = 'No Songs Available';
        if (selectedCount === 0) {
            songDate.textContent = 'No artists selected';
        } else if (totalSongs > 0) {
            songDate.textContent = 'All songs are filtered out';
        } else {
            songDate.textContent = 'Click Refresh Library or check music folders';
        }
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Window controls
    document.getElementById('minimize-btn').addEventListener('click', () => {
        ipcRenderer.invoke('window-control', 'minimize');
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
        ipcRenderer.invoke('window-control', 'maximize');
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
        ipcRenderer.invoke('window-control', 'close');
    });

    // Player controls
    playBtn.addEventListener('click', togglePlayPause);
    prevBtn.addEventListener('click', previousSong);
    nextBtn.addEventListener('click', nextSong);
    repeatBtn.addEventListener('click', toggleRepeat);
    
    // Progress and volume
    progressSlider.addEventListener('input', seekTo);
    volumeSlider.addEventListener('input', setVolume);
    volumeBtn.addEventListener('click', toggleMute);
    
    // Search
    document.getElementById('search-input').addEventListener('input', searchSongs);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const section = item.dataset.section;
            console.log('Nav item clicked:', section);
            if (section) {
                switchSection(section);
            }
        });
    });
    
    // Seasonal playlists
    document.querySelectorAll('.seasonal-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const playlist = item.dataset.playlist;
            console.log('Seasonal playlist clicked:', playlist);
            
            if (playlist) {
                console.log('Loading seasonal playlist:', playlist);
                loadPlaylist(playlist);
            } else {
                console.error('No playlist data attribute found on seasonal item');
            }
        });
    });
    
    // Player favorite button
    const favoriteBtn = document.getElementById('favorite-btn');
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', toggleCurrentSongFavorite);
    } else {
        console.warn('Favorite button not found in player controls');
    }
    
    // Modal controls
    document.getElementById('equalizer-btn').addEventListener('click', openEqualizer);
    document.getElementById('create-playlist-btn').addEventListener('click', openCreatePlaylist);
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    
    // Settings
    document.getElementById('holiday-mode').addEventListener('change', toggleHolidayMode);
    document.getElementById('import-music-btn').addEventListener('click', importMusicFolder);
    document.getElementById('sync-drive-btn').addEventListener('click', syncGoogleDrive);
    
    // Add reset settings button
    const resetBtn = document.getElementById('reset-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllSettings);
    }
    
    // Add test seasonal button
    const testSeasonalBtn = document.getElementById('test-seasonal-btn');
    if (testSeasonalBtn) {
        testSeasonalBtn.addEventListener('click', testSeasonalPlaylists);
    }
    
    // Add refresh library button functionality
    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Library';
    refreshBtn.className = 'import-btn';
    refreshBtn.style.marginLeft = '12px';
    refreshBtn.addEventListener('click', refreshMusicLibrary);
    document.getElementById('import-music-btn').parentNode.appendChild(refreshBtn);
    
    // Create playlist
    document.getElementById('create-playlist-confirm-btn').addEventListener('click', createPlaylist);
    document.getElementById('cancel-playlist-btn').addEventListener('click', closeModal);
    
    // Add to playlist modal
    document.getElementById('confirm-add-playlist-btn').addEventListener('click', confirmAddToPlaylists);
    document.getElementById('cancel-add-playlist-btn').addEventListener('click', closeModal);
    document.getElementById('create-new-playlist-btn').addEventListener('click', createNewPlaylistFromModal);
    
    // Playlist option clicks
    document.addEventListener('click', (e) => {
        if (e.target.closest('.playlist-option')) {
            togglePlaylistOption(e.target.closest('.playlist-option'));
        }
    });
    
    // Audio events
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleSongEnd);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    
    // Equalizer
    document.getElementById('eq-preset').addEventListener('change', applyEQPreset);
    document.querySelectorAll('.eq-slider').forEach(slider => {
        slider.addEventListener('input', updateEqualizer);
    });

    document.getElementById('shuffle-btn').addEventListener('click', toggleShuffle);

    // Prevent context menu
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// Setup Audio Context for Equalizer
function setupAudioContext() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create equalizer bands
        const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
        frequencies.forEach(freq => {
            const filter = audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            equalizer[freq] = filter;
        });
        
        // Create gain node
        gainNode = audioContext.createGain();
        
        // Connect equalizer chain
        audioSource = audioContext.createMediaElementSource(audioPlayer);
        let previousNode = audioSource;
        
        Object.values(equalizer).forEach(filter => {
            previousNode.connect(filter);
            previousNode = filter;
        });
        
        previousNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
    } catch (error) {
        console.warn('Web Audio API not supported:', error);
    }
}

// Load Downloaded Music on Startup
async function loadDownloadedMusic() {
    console.log('Loading downloaded music...');
    
    try {
        // Check each music folder
        const musicFolders = ['neuro', 'evil', 'duet'];
        
        for (const folder of musicFolders) {
            const folderPath = `music/${folder}`;
            console.log(`Scanning ${folderPath}...`);
            
            try {
                const musicFiles = await ipcRenderer.invoke('get-music-files', folderPath);
                console.log(`Found ${musicFiles.length} files in ${folder}`);
                
                musicFiles.forEach(file => {
                    addSongToLibrary(file.path, folder);
                });
            } catch (error) {
                console.warn(`Could not load music from ${folderPath}:`, error);
            }
        }
        
        // Set up initial playlist with holiday filtering
        currentPlaylist = getFilteredLibrary();
        
        console.log(`Loaded ${musicLibrary.length} total songs`);
        console.log(`Current playlist has ${currentPlaylist.length} songs after holiday filtering`);
        
        // Display songs in UI
        displaySongs();
        
        // Update status
        const statusElement = document.getElementById('singer-name');
        if (statusElement) {
            if (musicLibrary.length > 0) {
                statusElement.textContent = `${currentPlaylist.length} songs loaded`;
                document.getElementById('song-date').textContent = 'Ready to play!';
            } else {
                statusElement.textContent = 'No songs found';
                document.getElementById('song-date').textContent = 'Check music folder';
            }
        }
        
    } catch (error) {
        console.error('Error loading downloaded music:', error);
    }
}

// Helper function to apply artist filtering to any song array
function applyArtistFilter(songs) {
    if (selectedArtists.size === 0 || selectedArtists.size === 3) {
        // If no artists selected or all artists selected, return as-is
        return songs;
    }
    
    return songs.filter(song => selectedArtists.has(song.artist));
}

// Helper function to get library filtered by holiday mode AND artist selection
function getFilteredLibrary() {
    let filteredLibrary = [...musicLibrary];
    
    // Apply holiday filtering if enabled
    if (appSettings.holidayMode === true) {
        filteredLibrary = filterSeasonalSongs(filteredLibrary);
    }
    
    // Filter blocked songs
    if (playlists.blocked) {
        filteredLibrary = filteredLibrary.filter(song =>
            !playlists.blocked.includes(song.filename)
        );
    }
    
    // Apply artist filtering LAST
    filteredLibrary = applyArtistFilter(filteredLibrary);
    
    return filteredLibrary;
}

// Function to filter out seasonal songs when not in season
function filterSeasonalSongs(songList) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    console.log(`Filtering seasonal songs for date: ${month}/${day}`);
    
    // Define what seasons are currently active (removed summer, combined christmas with winter)
    const activeSeasons = {
        winter: month === 12 || month === 1 || month === 2,
        halloween: month === 10
    };
    
    console.log('Active seasons:', activeSeasons);
    
    return songList.filter(song => {
        // Check if song is in any seasonal playlist (removed summer and christmas)
        const isWinter = playlists.winter_music && playlists.winter_music.includes(song.filename);
        const isHalloween = playlists.halloween_music && playlists.halloween_music.includes(song.filename);
        const isChristmas = playlists.christmas_music && playlists.christmas_music.includes(song.filename);
        
        // If song is not in any seasonal playlist, it's always allowed
        if (!isWinter && !isHalloween && !isChristmas) {
            return true;
        }
        
        // Christmas songs are now considered part of winter
        const isWinterOrChristmas = isWinter || isChristmas;
        
        // If song is seasonal, only allow it if its season is active
        if (isWinterOrChristmas && !activeSeasons.winter) {
            console.log(`Filtering out winter/christmas song: ${song.title}`);
            return false;
        }
        if (isHalloween && !activeSeasons.halloween) {
            console.log(`Filtering out halloween song: ${song.title}`);
            return false;
        }
        
        return true;
    });
}

// FIXED: Song Management with improved date extraction
function parseSongInfo(filename, artistFolder = null) {
    const nameWithoutExt = path.basename(filename, '.mp3');
    
    // Check for (evil) tag first and remove it temporarily
    let cleanName = nameWithoutExt;
    const isEvil = cleanName.includes('(evil)');
    if (isEvil) {
        cleanName = cleanName.replace(/\s*\(evil\)\s*/g, '');
    }
    
    // FIXED: Extract date (now handles (evil) before dates)
    const dateMatch = cleanName.match(/\((\d{1,2})\s+(\d{1,2})\s+(\d{2})\)$/);
    let songDate = null;
    
    if (dateMatch) {
        const [, day, month, year] = dateMatch;
        songDate = new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day));
        cleanName = cleanName.replace(/\s*\(\d{1,2}\s+\d{1,2}\s+\d{2}\)$/, '');
    }
    
    // Determine artist based on folder or filename
    let artist = 'Unknown';
    if (artistFolder) {
        // Use the folder name to determine artist
        switch (artistFolder.toLowerCase()) {
            case 'neuro':
                artist = 'Neuro';
                break;
            case 'evil':
                artist = 'Evil';
                break;
            case 'duet':
                artist = 'Duet';
                break;
        }
    } else {
        // Fallback to filename analysis
        if (filename.includes('118gr4QuaGQGKfJ0X8VBCytvPjdzPayPY') || (!isEvil && !filename.includes('duet'))) {
            artist = 'Neuro';
        } else if (filename.includes('16WT3-_bOG2I50YS9eBwNK9W99Uh-QhwK') || isEvil) {
            artist = 'Evil';
        } else if (filename.includes('16XWYR_-i0vAvKkmI9a77ZLiZTp20WHjs')) {
            artist = 'Duet';
        }
    }
    
    return {
        title: cleanName,
        artist: artist,
        date: songDate,
        filename: path.basename(filename),
        isEvil: isEvil
    };
}

function addSongToLibrary(filePath, artistFolder = null) {
    const songInfo = parseSongInfo(filePath, artistFolder);
    songInfo.path = filePath;
    
    // Avoid duplicates
    const exists = musicLibrary.some(song => 
        song.path === filePath || song.filename === songInfo.filename
    );
    
    if (!exists) {
        musicLibrary.push(songInfo);
        console.log(`Added: ${songInfo.title} by ${songInfo.artist}`);
    }
}

// FIXED: Display songs with search fix
function displaySongs(songs = currentPlaylist) {
    const songList = document.getElementById('song-list');
    songList.innerHTML = '';
    
    console.log(`Displaying ${songs.length} songs`);
    
    if (songs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.style.cssText = `
            text-align: center; 
            padding: 40px; 
            color: #b3b3b3; 
            font-size: 16px;
            grid-column: 1 / -1;
        `;
        emptyMessage.innerHTML = `
            <i class="fas fa-music" style="font-size: 48px; margin-bottom: 16px; display: block; opacity: 0.5;"></i>
            <div>No songs found</div>
            <div style="font-size: 14px; margin-top: 8px;">
                Make sure your songs are in music/neuro, music/evil, or music/duet folders<br>
                Then click "Refresh Library" in Settings
            </div>
        `;
        songList.appendChild(emptyMessage);
        return;
    }
    
    songs.forEach((song, displayIndex) => {
        try {
            const songItem = document.createElement('div');
            songItem.className = 'song-item';
            if (currentSong && song.path === currentSong.path) {
                songItem.classList.add('playing');
            }
            
            const displayDate = song.date ? song.date.toLocaleDateString() : '—';
            
            songItem.innerHTML = `
                <div class="song-title" title="${song.title}">${song.title}</div>
                <div class="song-artist">${song.artist}</div>
                <div class="song-date">${displayDate}</div>
                <div class="song-actions">
                    <button class="action-btn favorite-toggle" title="Add to Favorites">
                        <i class="far fa-heart"></i>
                    </button>
                    <button class="action-btn block-toggle" title="Block Song">
                        <i class="fas fa-ban"></i>
                    </button>
                    <button class="action-btn playlist-add" title="Add to Playlist">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
            
            // FIXED: Shuffle bug - find song in correct playlist when clicking
            songItem.addEventListener('click', (e) => {
                if (!e.target.closest('.song-actions')) {
                    console.log(`Playing song: ${song.title} by ${song.artist}`);
                    console.log(`File path: ${song.path}`);
                    
                    // Find the correct index in the playlist we're actually using
                    const targetPlaylist = isShuffled ? shuffledPlaylist : currentPlaylist;
                    const actualIndex = targetPlaylist.findIndex(playlistSong => 
                        playlistSong.path === song.path
                    );
                    
                    if (actualIndex !== -1) {
                        playSong(actualIndex);
                    } else {
                        console.warn('Song not found in target playlist');
                    }
                }
            });
            
            // Action buttons
            const favoriteBtn = songItem.querySelector('.favorite-toggle');
            const blockBtn = songItem.querySelector('.block-toggle');
            const playlistBtn = songItem.querySelector('.playlist-add');
            
            favoriteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(song);
                updateFavoriteButton(favoriteBtn, song);
            });
            
            blockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleBlocked(song);
                updateBlockButton(blockBtn, song);
            });
            
            playlistBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showPlaylistSelector(song);
            });
            
            // Update button states
            updateFavoriteButton(favoriteBtn, song);
            updateBlockButton(blockBtn, song);
            
            songList.appendChild(songItem);
        } catch (error) {
            console.error('Error creating song item:', error, song);
        }
    });
    
    console.log(`Successfully displayed ${songs.length} songs in the UI`);
}

// FIXED: Shuffle functionality - affects playback order, not visual list
function playSong(index) {
    const playlist = isShuffled ? shuffledPlaylist : currentPlaylist;
    
    if (index < 0 || index >= playlist.length) return;
    
    currentSongIndex = index;
    currentSong = playlist[index];
    
    audioPlayer.src = currentSong.path;
    audioPlayer.load();
    
    if (isPlaying) {
        audioPlayer.play().catch(console.error);
    }
    
    updatePlayerInfo();
    updateSingerDisplay();
    updatePlayerFavoriteButton(); // Make sure favorite button is updated
    displaySongs(); // Refresh to update playing state
}

function updatePlayerInfo() {
    if (!currentSong) return;
    
    document.getElementById('player-title').textContent = currentSong.title;
    document.getElementById('player-artist').textContent = currentSong.artist;
    
    // Update favorite button state
    updatePlayerFavoriteButton();
    
    // Update cover image based on artist
    const playerCover = document.getElementById('player-cover');
    switch (currentSong.artist) {
        case 'Neuro':
            playerCover.src = 'assets/Neuro_sing.png';
            playerCover.alt = 'Neuro-sama singing';
            break;
        case 'Evil':
            playerCover.src = 'assets/Evil_sing.png';
            playerCover.alt = 'Evil Neuro singing';
            break;
        case 'Duet':
            playerCover.src = 'assets/Duet_sing.png';
            playerCover.alt = 'Neuro & Evil singing together';
            break;
        default:
            playerCover.src = 'assets/default_cover.png';
            playerCover.alt = 'Unknown artist';
    }
    
    // Add error handling for missing images
    playerCover.onerror = function() {
        console.warn(`Image not found: ${this.src}`);
        // Try SVG version first
        if (this.src.includes('.png')) {
            const svgSrc = this.src.replace('.png', '.svg');
            this.src = svgSrc;
            return;
        }
        // Fall back to default SVG placeholder
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIHZpZXdCb3g9IjAgMCA1NiA1NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iOCIgZmlsbD0iIzJhMmEyYSIvPgo8cGF0aCBkPSJNMjggMTRDMzQuNjI3NCAxNCA0MCAyMC4zNzI2IDQwIDI4QzQwIDM1LjYyNzQgMzQuNjI3NCA0MiAyOCA0MkMyMS4zNzI2IDQyIDE2IDM1LjYyNzQgMTYgMjhDMTYgMjAuMzcyNiAyMS4zNzI2IDE0IDI4IDE0WiIgZmlsbD0iIzFkYjk1NCIvPgo8cGF0aCBkPSJNMjQgMjJWMzRMMzQgMjhMMjQgMjJaIiBmaWxsPSIjMDAwMDAwIi8+Cjwvc3ZnPgo=';
        this.alt = 'Music player icon';
    };
}

function updatePlayerFavoriteButton() {
    const favoriteBtn = document.getElementById('favorite-btn');
    if (!favoriteBtn || !currentSong) return;
    
    const isFavorite = playlists.favorites && playlists.favorites.includes(currentSong.filename);
    const icon = favoriteBtn.querySelector('i');
    
    if (isFavorite) {
        icon.className = 'fas fa-heart';
        favoriteBtn.style.color = '#e91e63';
        favoriteBtn.title = 'Remove from Favorites';
    } else {
        icon.className = 'far fa-heart';
        favoriteBtn.style.color = '#b3b3b3';
        favoriteBtn.title = 'Add to Favorites';
    }
}

async function toggleCurrentSongFavorite() {
    if (!currentSong) {
        showNotification('No song is currently playing', 'info');
        return;
    }
    
    await toggleFavorite(currentSong);
    updatePlayerFavoriteButton();
}

function updateSingerDisplay() {
    if (!currentSong) return;
    
    const singerImage = document.getElementById('singer-image');
    const singerName = document.getElementById('singer-name');
    const songDate = document.getElementById('song-date');
    
    switch (currentSong.artist) {
        case 'Neuro':
            singerImage.src = 'assets/Neuro_sing.png';
            singerImage.alt = 'Neuro-sama';
            singerName.textContent = 'Neuro-sama';
            break;
        case 'Evil':
            singerImage.src = 'assets/Evil_sing.png';
            singerImage.alt = 'Evil Neuro';
            singerName.textContent = 'Evil Neuro';
            break;
        case 'Duet':
            singerImage.src = 'assets/Duet_sing.png';
            singerImage.alt = 'Neuro & Evil';
            singerName.textContent = 'Neuro & Evil';
            break;
        default:
            singerImage.src = 'assets/default_cover.png';
            singerImage.alt = 'Unknown Artist';
            singerName.textContent = 'Unknown Artist';
    }
    
    // Add error handling for missing images
    singerImage.onerror = function() {
        console.warn(`Singer image not found: ${this.src}`);
        // Try SVG version first
        if (this.src.includes('.png')) {
            const svgSrc = this.src.replace('.png', '.svg');
            this.src = svgSrc;
            return;
        }
        // Fall back to default SVG placeholder
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiByeD0iMTYiIGZpbGw9IiMyYTJhMmEiLz4KPHA+PHBhdGggZD0iTTYwIDI0QzUwLjA1ODkgMjQgNDIgMzIuMDU4OSA0MiA0MkM0MiA1MS45NDExIDUwLjA1ODkgNjAgNjAgNjBDNjkuOTQxMSA2MCA3OCA1MS45NDExIDc4IDQyQzc4IDMyLjA1ODkgNjkuOTQxMSAyNCA2MCAyNFoiIGZpbGw9IiMxZGI5NTQiLz4KPHA+PHBhdGggZD0iTTQ4IDc4QzQ4IDY5LjE2MzQgNTUuMTYzNCA2MiA2NCA2Mkg1NkM2NC44MzY2IDYyIDcyIDY5LjE2MzQgNzIgNzhWOTZINDhWNzhaIiBmaWxsPSIjMWRiOTU0Ii8+Cjwvc3ZnPgo=';
        this.alt = 'Singer placeholder';
    };
    
    songDate.textContent = currentSong.date ? currentSong.date.toLocaleDateString() : '—';
}

// FIXED: Playback Controls with smart shuffle
function togglePlayPause() {
    if (!currentSong) {
        const playlist = isShuffled ? shuffledPlaylist : currentPlaylist;
        if (playlist.length > 0) {
            playSong(0);
        }
        return;
    }
    
    if (isPlaying) {
        audioPlayer.pause();
        isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
    } else {
        audioPlayer.play().catch(console.error);
        isPlaying = true;
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
}

function previousSong() {
    const playlist = isShuffled ? shuffledPlaylist : currentPlaylist;
    let newIndex = currentSongIndex - 1;
    if (newIndex < 0) {
        newIndex = repeatMode === 1 ? playlist.length - 1 : 0;
    }
    playSong(newIndex);
}

function nextSong() {
    const playlist = isShuffled ? shuffledPlaylist : currentPlaylist;
    let newIndex = currentSongIndex + 1;
    if (newIndex >= playlist.length) {
        newIndex = 0; // Always go back to the start
    }
    playSong(newIndex);
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    updateRepeatButton();
}

// FIXED: Updated repeat button design with proper Spotify-style appearance
function updateRepeatButton() {
    const icon = repeatBtn.querySelector('i');
    
    // Clear any existing indicators
    const existingIndicator = repeatBtn.querySelector('.repeat-indicator, .repeat-number');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    switch (repeatMode) {
        case 0: // Repeat: Off
            icon.className = 'fas fa-repeat';
            repeatBtn.style.color = '#b3b3b3';
            repeatBtn.title = 'Repeat: Off';
            break;
        case 1: // Repeat: All
            icon.className = 'fas fa-repeat';
            repeatBtn.style.color = '#1db954';
            repeatBtn.title = 'Repeat: All';
            // NO DOT INDICATOR - just green color indicates it's active
            break;
        case 2: // Repeat: One
            icon.className = 'fas fa-repeat';
            repeatBtn.style.color = '#1db954';
            repeatBtn.title = 'Repeat: One';
            
            // Add "1" indicator in the middle top part of the icon
            const numberIndicator = document.createElement('span');
            numberIndicator.className = 'repeat-number';
            numberIndicator.textContent = '1';
            numberIndicator.style.cssText = `
                position: absolute;
                top: -2px;
                left: 50%;
                transform: translateX(-50%);
                color: #1db954;
                font-size: 10px;
                font-weight: bold;
                background: #121212;
                border-radius: 50%;
                width: 12px;
                height: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
                border: 1px solid #121212;
            `;
            repeatBtn.style.position = 'relative';
            repeatBtn.appendChild(numberIndicator);
            break;
    }
}

function handleSongEnd() {
    if (repeatMode === 2) {
        // Repeat one
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else {
        // Move to next song
        nextSong();
    }
}

function toggleShuffle() {
    isShuffled = !isShuffled;
    
    if (isShuffled) {
        createSmartShuffledPlaylist();
    }
    
    updateShuffleButton();
    
    // AUTO-SAVE SHUFFLE STATE
    saveAppSettings();
}

function createSmartShuffledPlaylist() {
    shuffledPlaylist = [...currentPlaylist];
    
    // Simple Fisher-Yates shuffle
    for (let i = shuffledPlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlaylist[i], shuffledPlaylist[j]] = [shuffledPlaylist[j], shuffledPlaylist[i]];
    }
    
    // Anti-consecutive logic: prevent similar songs from playing consecutively
    for (let i = 1; i < shuffledPlaylist.length; i++) {
        const current = shuffledPlaylist[i];
        const previous = shuffledPlaylist[i - 1];
        
        // Check if songs are similar (same title base, different artists)
        const currentBase = current.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, '');
        const previousBase = previous.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, '');
        
        if (currentBase === previousBase && current.artist !== previous.artist) {
            // Find a different song to swap with
            for (let j = i + 1; j < shuffledPlaylist.length; j++) {
                const candidate = shuffledPlaylist[j];
                const candidateBase = candidate.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, '');
                
                if (candidateBase !== previousBase) {
                    // Swap songs
                    [shuffledPlaylist[i], shuffledPlaylist[j]] = [shuffledPlaylist[j], shuffledPlaylist[i]];
                    break;
                }
            }
        }
    }
    
    // Find current song in shuffled playlist and set index
    if (currentSong) {
        const shuffledIndex = shuffledPlaylist.findIndex(song => song.path === currentSong.path);
        if (shuffledIndex !== -1) {
            currentSongIndex = shuffledIndex;
        }
    }
}

function updateShuffleButton() {
    const shuffleBtn = document.getElementById('shuffle-btn');
    if (!shuffleBtn) return;
    
    if (isShuffled) {
        shuffleBtn.classList.add('active');
        shuffleBtn.style.color = '#1db954';
        shuffleBtn.title = 'Shuffle: On';
    } else {
        shuffleBtn.classList.remove('active');
        shuffleBtn.style.color = '#b3b3b3';
        shuffleBtn.title = 'Shuffle: Off';
    }
}

// Progress and Volume
function updateProgress() {
    if (audioPlayer.duration) {
        const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progress.style.width = progressPercent + '%';
        progressSlider.value = progressPercent;
        
        currentTimeSpan.textContent = formatTime(audioPlayer.currentTime);
    }
}

function updateDuration() {
    if (audioPlayer.duration) {
        durationSpan.textContent = formatTime(audioPlayer.duration);
    }
}

function seekTo() {
    if (audioPlayer.duration) {
        const seekTime = (progressSlider.value / 100) * audioPlayer.duration;
        audioPlayer.currentTime = seekTime;
    }
}

// FIXED: Volume controls with percentage display and proper mute/unmute
function setVolume() {
    const volume = volumeSlider.value / 100;
    audioPlayer.volume = volume;
    
    // Store current volume when not muted
    if (volume > 0) {
        previousVolume = volumeSlider.value;
    }
    
    // Show volume percentage temporarily
    showVolumePercentage();
    
    const volumeIcon = volumeBtn.querySelector('i');
    if (volume === 0) {
        volumeIcon.className = 'fas fa-volume-mute';
    } else if (volume < 0.5) {
        volumeIcon.className = 'fas fa-volume-down';
    } else {
        volumeIcon.className = 'fas fa-volume-up';
    }
}

function toggleMute() {
    if (audioPlayer.volume > 0) {
        // Mute: store current volume and set to 0
        previousVolume = volumeSlider.value;
        audioPlayer.volume = 0;
        volumeSlider.value = 0;
    } else {
        // Unmute: restore previous volume
        audioPlayer.volume = previousVolume / 100;
        volumeSlider.value = previousVolume;
    }
    setVolume();
}

function showVolumePercentage() {
    // Create or update volume percentage display
    let volumeDisplay = document.getElementById('volume-percentage');
    if (!volumeDisplay) {
        volumeDisplay = document.createElement('div');
        volumeDisplay.id = 'volume-percentage';
        volumeDisplay.style.cssText = `
            position: absolute;
            bottom: 100px;
            right: 24px;
            background: rgba(0, 0, 0, 0.8);
            color: #ffffff;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
            z-index: 1000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        document.body.appendChild(volumeDisplay);
    }
    
    volumeDisplay.textContent = `${volumeSlider.value}%`;
    volumeDisplay.style.opacity = '1';
    
    // Hide after 1 second
    clearTimeout(showVolumePercentage.timeout);
    showVolumePercentage.timeout = setTimeout(() => {
        volumeDisplay.style.opacity = '0';
    }, 1000);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// FIXED: Search function with artist filtering
function searchSongs() {
    const query = document.getElementById('search-input').value.toLowerCase();
    if (!query) {
        // When clearing search, we need to rebuild the current view with filters
        const activeSection = document.querySelector('.nav-item.active')?.dataset.section;
        const activePlaylist = document.querySelector('.seasonal-item.active, .playlist-item.active')?.dataset.playlist;
        
        if (activePlaylist) {
            loadPlaylist(activePlaylist);
        } else if (activeSection === 'library') {
            currentPlaylist = getFilteredLibrary();
            currentPlaylist.sort((a, b) => a.title.localeCompare(b.title));
            displaySongs();
            updateLibraryHeaderInfo();
        } else if (activeSection === 'blocked') {
            loadBlockedSongs();
        }
        return;
    }
    
    // Apply search to current playlist (which already has filters applied)
    const filteredSongs = currentPlaylist.filter(song =>
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query)
    );
    
    displaySongs(filteredSongs);
}

// FIXED: Sorting functionality with date sorting
function sortSongsByName() {
    nameSort = nameSort === 'asc' ? 'desc' : 'asc';
    
    currentPlaylist.sort((a, b) => {
        const comparison = a.title.localeCompare(b.title);
        return nameSort === 'asc' ? comparison : -comparison;
    });
    
    updateSortButtons('name');
    displaySongs();
    
    // Update shuffled playlist if active
    if (isShuffled) {
        createSmartShuffledPlaylist();
    }
}

function sortSongsByDate() {
    dateSort = dateSort === 'asc' ? 'desc' : 'asc';
    
    currentPlaylist.sort((a, b) => {
        // Handle songs without dates
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        
        const comparison = a.date.getTime() - b.date.getTime();
        return dateSort === 'asc' ? comparison : -comparison;
    });
    
    updateSortButtons('date');
    displaySongs();
    
    // Update shuffled playlist if active
    if (isShuffled) {
        createSmartShuffledPlaylist();
    }
}

function updateSortButtons(activeSort) {
    // This function would update sort button states
    // Implementation depends on your UI setup
}

// Playlist Management
async function loadPlaylists() {
    try {
        const playlistFiles = await ipcRenderer.invoke('get-playlist-files');
        playlists = {};
        
        for (const playlistFile of playlistFiles) {
            const songs = await ipcRenderer.invoke('read-playlist-file', playlistFile.path);
            playlists[playlistFile.name] = songs;
        }
        
        updatePlaylistUI();
        updateFavoritesCount(); // Update favorites count on load
    } catch (error) {
        console.error('Error loading playlists:', error);
    }
}

function updatePlaylistUI() {
    const playlistList = document.getElementById('playlist-list');
    playlistList.innerHTML = '';
    
    Object.keys(playlists).forEach(playlistName => {
        // Skip default playlists (removed summer, christmas is now merged with winter)
        if (['favorites', 'blocked', 'winter_music', 'halloween_music', 'christmas_music'].includes(playlistName)) {
            return;
        }
        
        const playlistItem = document.createElement('li');
        playlistItem.className = 'playlist-item';
        const songCount = playlists[playlistName] ? playlists[playlistName].length : 0;
        playlistItem.innerHTML = `
            <i class="fas fa-music"></i> 
            ${playlistName} 
            <span class="playlist-count">${songCount}</span>
            <button class="delete-playlist-btn" title="Delete Playlist">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        // Add click listener for loading playlist
        playlistItem.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-playlist-btn')) {
                loadPlaylist(playlistName);
            }
        });
        
        // FIXED: Add delete functionality for custom playlists
        const deleteBtn = playlistItem.querySelector('.delete-playlist-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCustomPlaylist(playlistName);
        });
        
        playlistList.appendChild(playlistItem);
    });
    
    // Update favorites and blocked counts
    updateFavoritesCount();
}

// FIXED: Add custom playlist deletion functionality
async function deleteCustomPlaylist(playlistName) {
    const confirmDelete = confirm(`Are you sure you want to delete the playlist "${playlistName}"? This action cannot be undone.`);
    
    if (confirmDelete) {
        try {
            // Remove from playlists object
            delete playlists[playlistName];
            
            // Delete playlist file
            await ipcRenderer.invoke('delete-playlist-file', playlistName);
            
            // Update UI
            updatePlaylistUI();
            
            showNotification(`Deleted playlist "${playlistName}"`, 'success');
        } catch (error) {
            console.error('Error deleting playlist:', error);
            showNotification(`Error deleting playlist "${playlistName}"`, 'error');
        }
    }
}

function updateFavoritesCount() {
    const favoritesCount = playlists.favorites ? playlists.favorites.length : 0;
    
    // Update sidebar favorites count
    const favoritesNavItem = document.querySelector('[data-section="favorites"]');
    if (favoritesNavItem) {
        const existingCount = favoritesNavItem.querySelector('.playlist-count');
        
        if (existingCount) {
            existingCount.textContent = favoritesCount;
        } else {
            const countSpan = document.createElement('span');
            countSpan.className = 'playlist-count favorites-count';
            countSpan.textContent = favoritesCount;
            favoritesNavItem.appendChild(countSpan);
        }
        
        // Update the color based on count
        const countElement = favoritesNavItem.querySelector('.playlist-count');
        if (favoritesCount > 0) {
            countElement.style.background = '#e91e63';
            countElement.style.color = '#ffffff';
        } else {
            countElement.style.background = '#535353';
            countElement.style.color = '#b3b3b3';
        }
    }
}

function loadPlaylist(playlistName) {
    console.log(`Loading playlist: ${playlistName}`);
    
    // UPDATE CURRENT VIEW TRACKING
    currentView = {
        section: null, // Clear section when switching to a playlist
        playlist: playlistName
    };
    
    // Handle winter playlist specially - combine winter and christmas
    let songsToLoad = [];
    if (playlistName === 'winter_music') {
        // Combine winter_music and christmas_music
        const winterSongs = playlists.winter_music || [];
        const christmasSongs = playlists.christmas_music || [];
        songsToLoad = [...new Set([...winterSongs, ...christmasSongs])]; // Remove duplicates
        console.log(`Combined winter (${winterSongs.length}) and christmas (${christmasSongs.length}) songs = ${songsToLoad.length} unique songs`);
    } else {
        if (!playlists[playlistName]) {
            console.log(`Creating empty playlist: ${playlistName}`);
            playlists[playlistName] = []; // Create empty playlist if it doesn't exist
        }
        songsToLoad = playlists[playlistName];
    }
    
    console.log(`Playlist ${playlistName} contains:`, songsToLoad);
    
    // Update active playlist in sidebar
    document.querySelectorAll('.seasonal-item, .playlist-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`[data-playlist="${playlistName}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        console.log(`Activated playlist item: ${playlistName}`);
    } else {
        console.warn(`Could not find playlist item for: ${playlistName}`);
    }
    
    // Clear navigation active states
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Get songs from the playlist
    currentPlaylist = musicLibrary.filter(song =>
        songsToLoad.includes(song.filename)
    );
    
    console.log(`Found ${currentPlaylist.length} songs in playlist before filtering`);
    
    // Apply holiday filtering only to favorites and custom playlists, not to seasonal playlists themselves
    const isSeasonalPlaylist = ['winter_music', 'halloween_music'].includes(playlistName);
    
    if (!isSeasonalPlaylist && appSettings.holidayMode === true) {
        const beforeFilter = currentPlaylist.length;
        currentPlaylist = filterSeasonalSongs(currentPlaylist);
        const filteredCount = beforeFilter - currentPlaylist.length;
        if (filteredCount > 0) {
            console.log(`Holiday mode: filtered out ${filteredCount} seasonal songs from ${playlistName}`);
        }
    }
    
    // Filter blocked songs
    if (playlists.blocked) {
        const beforeBlock = currentPlaylist.length;
        currentPlaylist = currentPlaylist.filter(song =>
            !playlists.blocked.includes(song.filename)
        );
        console.log(`After filtering blocked songs: ${currentPlaylist.length} (removed ${beforeBlock - currentPlaylist.length})`);
    }
    
    // Apply artist filtering
    const beforeArtistFilter = currentPlaylist.length;
    currentPlaylist = applyArtistFilter(currentPlaylist);
    const artistFilteredCount = beforeArtistFilter - currentPlaylist.length;
    if (artistFilteredCount > 0) {
        console.log(`Artist filter: filtered out ${artistFilteredCount} songs from ${playlistName}`);
    }
    
    // Reset shuffle if active
    if (isShuffled) {
        createSmartShuffledPlaylist();
    }
    
    // Update header info
    updatePlaylistHeaderInfo(playlistName);
    
    displaySongs();
    
    console.log(`Successfully loaded playlist "${playlistName}" with ${currentPlaylist.length} songs`);
    
    // SAVE SETTINGS WHEN PLAYLIST CHANGES
    saveAppSettings();
}

function updatePlaylistHeaderInfo(playlistName) {
    const singerName = document.getElementById('singer-name');
    const songDate = document.getElementById('song-date');
    
    if (!singerName || !songDate) return;
    
    const playlistDisplayNames = {
        'winter_music': 'Winter & Christmas Music',
        'halloween_music': 'Halloween Music',
        'favorites': 'Favorites',
        'blocked': 'Blocked Songs'
    };
    
    const displayName = playlistDisplayNames[playlistName] || playlistName;
    const selectedCount = selectedArtists.size;
    
    // Update singer name with artist filter info
    if (selectedCount === 3) {
        singerName.textContent = displayName;
    } else if (selectedCount === 1) {
        const artist = Array.from(selectedArtists)[0];
        singerName.textContent = `${displayName} - ${artist} Only`;
    } else if (selectedCount === 2) {
        const artists = Array.from(selectedArtists).join(' & ');
        singerName.textContent = `${displayName} - ${artists}`;
    } else {
        singerName.textContent = `${displayName} - No Artists`;
    }
    
    // Update song count info
    if (currentPlaylist.length === 0) {
        if (selectedCount === 0) {
            songDate.textContent = 'No artists selected';
        } else {
            songDate.textContent = 'No songs available with current filters';
        }
    } else {
        songDate.textContent = `${currentPlaylist.length} songs`;
    }
}

async function createPlaylist() {
    const playlistName = document.getElementById('playlist-name-input').value.trim();
    if (!playlistName) return;
    
    try {
        const filePath = await ipcRenderer.invoke('create-playlist-file', playlistName);
        if (filePath) {
            playlists[playlistName] = [];
            updatePlaylistUI();
            closeModal();
            document.getElementById('playlist-name-input').value = '';
        } else {
            alert('Playlist already exists!');
        }
    } catch (error) {
        console.error('Error creating playlist:', error);
    }
}

// Favorites and Blocking
async function toggleFavorite(song) {
    if (!playlists.favorites) playlists.favorites = [];
    
    const index = playlists.favorites.indexOf(song.filename);
    if (index === -1) {
        playlists.favorites.push(song.filename);
        showNotification(`Added "${song.title}" to favorites!`, 'success');
    } else {
        playlists.favorites.splice(index, 1);
        showNotification(`Removed "${song.title}" from favorites`, 'info');
    }
    
    await savePlaylist('favorites');
    updateFavoritesCount(); // Update the count in sidebar
    
    // If this is the currently playing song, update player favorite button
    if (currentSong && currentSong.filename === song.filename) {
        updatePlayerFavoriteButton();
    }
}

async function toggleBlocked(song) {
    if (!playlists.blocked) playlists.blocked = [];
    
    const index = playlists.blocked.indexOf(song.filename);
    if (index === -1) {
        playlists.blocked.push(song.filename);
        showNotification(`Blocked "${song.title}"`, 'info');
    } else {
        playlists.blocked.splice(index, 1);
        showNotification(`Unblocked "${song.title}"`, 'success');
    }
    
    await savePlaylist('blocked');
    updateBlockedCount(); // Update the blocked count in sidebar
    
    // Remove from current playlist if blocked
    if (index === -1) {
        currentPlaylist = currentPlaylist.filter(s => s.filename !== song.filename);
        displaySongs();
    }
}

function updateBlockedCount() {
    const blockedCount = playlists.blocked ? playlists.blocked.length : 0;
    
    // Update sidebar blocked count
    const blockedNavItem = document.querySelector('[data-section="blocked"]');
    if (blockedNavItem) {
        const existingCount = blockedNavItem.querySelector('.playlist-count');
        
        if (existingCount) {
            existingCount.textContent = blockedCount;
        } else {
            const countSpan = document.createElement('span');
            countSpan.className = 'playlist-count blocked-count';
            countSpan.textContent = blockedCount;
            blockedNavItem.appendChild(countSpan);
        }
        
        // Update the color based on count
        const countElement = blockedNavItem.querySelector('.playlist-count');
        if (blockedCount > 0) {
            countElement.style.background = '#e22134';
            countElement.style.color = '#ffffff';
        } else {
            countElement.style.background = '#535353';
            countElement.style.color = '#b3b3b3';
        }
    }
}

async function savePlaylist(playlistName) {
    try {
        const filePath = `playlists/${playlistName}.txt`;
        await ipcRenderer.invoke('write-playlist-file', filePath, playlists[playlistName]);
    } catch (error) {
        console.error('Error saving playlist:', error);
    }
}

function updateFavoriteButton(button, song) {
    const isFavorite = playlists.favorites && playlists.favorites.includes(song.filename);
    const icon = button.querySelector('i');
    
    if (isFavorite) {
        icon.className = 'fas fa-heart';
        button.style.color = '#1db954';
    } else {
        icon.className = 'far fa-heart';
        button.style.color = '#b3b3b3';
    }
}

function updateBlockButton(button, song) {
    const isBlocked = playlists.blocked && playlists.blocked.includes(song.filename);
    
    if (isBlocked) {
        button.style.color = '#e22134';
    } else {
        button.style.color = '#b3b3b3';
    }
}

function showPlaylistSelector(song) {
    // Store the selected song for later use
    window.selectedSongForPlaylist = song;
    
    // Update the song info display
    document.querySelector('.selected-song-title').textContent = song.title;
    document.querySelector('.selected-song-artist').textContent = song.artist;
    
    // Reset all checkboxes
    document.querySelectorAll('.playlist-option input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Update playlist states based on current membership
    updatePlaylistStates(song);
    
    // Populate custom playlists
    populateCustomPlaylists();
    
    // Show the modal
    document.getElementById('add-to-playlist-modal').classList.add('show');
}

function updatePlaylistStates(song) {
    const playlistOptions = document.querySelectorAll('.playlist-option');
    
    playlistOptions.forEach(option => {
        const playlistName = option.dataset.playlist;
        const checkbox = option.querySelector('input[type="checkbox"]');
        
        if (checkbox && playlists[playlistName]) {
            checkbox.checked = playlists[playlistName].includes(song.filename);
            option.classList.toggle('selected', checkbox.checked);
        }
    });
}

function populateCustomPlaylists() {
    const customGrid = document.getElementById('custom-playlists-grid');
    
    // Clear existing custom playlists
    customGrid.innerHTML = '';
    
    // Get custom playlists (exclude default ones)
    const defaultPlaylists = ['favorites', 'blocked', 'winter_music', 'halloween_music', 'christmas_music', 'summer_music'];
    const customPlaylists = Object.keys(playlists).filter(name => !defaultPlaylists.includes(name));
    
    customPlaylists.forEach(playlistName => {
        const playlistOption = document.createElement('div');
        playlistOption.className = 'playlist-option';
        playlistOption.dataset.playlist = playlistName;
        
        const song = window.selectedSongForPlaylist;
        const isInPlaylist = playlists[playlistName] && playlists[playlistName].includes(song.filename);
        
        playlistOption.innerHTML = `
            <i class="fas fa-music"></i>
            <span>${playlistName}</span>
            <div class="playlist-checkbox">
                <input type="checkbox" id="${playlistName}_check" ${isInPlaylist ? 'checked' : ''}>
                <label for="${playlistName}_check"></label>
            </div>
        `;
        
        if (isInPlaylist) {
            playlistOption.classList.add('selected');
        }
        
        customGrid.appendChild(playlistOption);
    });
}

function togglePlaylistOption(option) {
    const checkbox = option.querySelector('input[type="checkbox"]');
    checkbox.checked = !checkbox.checked;
    option.classList.toggle('selected', checkbox.checked);
}

async function confirmAddToPlaylists() {
    const song = window.selectedSongForPlaylist;
    if (!song) return;
    
    const selectedPlaylists = [];
    const removedPlaylists = [];
    
    // Check all playlist options
    document.querySelectorAll('.playlist-option').forEach(option => {
        const playlistName = option.dataset.playlist;
        const checkbox = option.querySelector('input[type="checkbox"]');
        const wasInPlaylist = playlists[playlistName] && playlists[playlistName].includes(song.filename);
        const isNowSelected = checkbox.checked;
        
        if (isNowSelected && !wasInPlaylist) {
            selectedPlaylists.push(playlistName);
        } else if (!isNowSelected && wasInPlaylist) {
            removedPlaylists.push(playlistName);
        }
    });
    
    let changesMade = 0;
    
    // Add to selected playlists
    for (const playlistName of selectedPlaylists) {
        if (!playlists[playlistName]) {
            playlists[playlistName] = [];
        }
        
        if (!playlists[playlistName].includes(song.filename)) {
            playlists[playlistName].push(song.filename);
            await savePlaylist(playlistName);
            changesMade++;
        }
    }
    
    // Remove from unselected playlists
    for (const playlistName of removedPlaylists) {
        if (playlists[playlistName]) {
            const index = playlists[playlistName].indexOf(song.filename);
            if (index !== -1) {
                playlists[playlistName].splice(index, 1);
                await savePlaylist(playlistName);
                changesMade++;
            }
        }
    }
    
    // Show success message
    if (changesMade > 0) {
        const addedCount = selectedPlaylists.length;
        const removedCount = removedPlaylists.length;
        let message = '';
        
        if (addedCount > 0 && removedCount > 0) {
            message = `Added to ${addedCount} playlist(s) and removed from ${removedCount} playlist(s)`;
        } else if (addedCount > 0) {
            message = `Added to ${addedCount} playlist(s)`;
        } else if (removedCount > 0) {
            message = `Removed from ${removedCount} playlist(s)`;
        }
        
        showNotification(message, 'success');
    } else {
        showNotification('No changes made', 'info');
    }
    
    // Update UI if favorites changed
    if (selectedPlaylists.includes('favorites') || removedPlaylists.includes('favorites')) {
        displaySongs(); // Refresh to update heart icons
        updateFavoritesCount(); // Update favorites count
    }
    
    closeModal();
}

function createNewPlaylistFromModal() {
    const playlistName = prompt('Enter new playlist name:');
    if (playlistName && playlistName.trim()) {
        const trimmedName = playlistName.trim();
        
        // Check if playlist already exists
        if (playlists[trimmedName]) {
            alert('A playlist with that name already exists!');
            return;
        }
        
        // Create the playlist
        playlists[trimmedName] = [];
        savePlaylist(trimmedName);
        
        // Refresh the custom playlists display
        populateCustomPlaylists();
        updatePlaylistUI();
        
        showNotification(`Created playlist "${trimmedName}"`, 'success');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 24px;
        background: ${type === 'success' ? '#1db954' : type === 'error' ? '#e22134' : '#535353'};
        color: ${type === 'success' ? '#000000' : '#ffffff'};
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

async function addToPlaylist(playlistName, songFilename) {
    try {
        if (!playlists[playlistName]) {
            playlists[playlistName] = [];
        }
        
        if (!playlists[playlistName].includes(songFilename)) {
            playlists[playlistName].push(songFilename);
            await savePlaylist(playlistName);
            showNotification(`Added to "${playlistName}" playlist!`, 'success');
            return true;
        } else {
            showNotification(`Song is already in "${playlistName}" playlist.`, 'info');
            return false;
        }
    } catch (error) {
        console.error('Error adding to playlist:', error);
        showNotification('Error adding song to playlist.', 'error');
        return false;
    }
}

// Seasonal Music
function updateSeasonalMusic() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const holidayMode = appSettings.holidayMode === true; // Only disable if explicitly set to true
    
    console.log(`Current date: ${month}/${day}, Holiday mode: ${holidayMode}`);
    
    const seasonalItems = document.querySelectorAll('.seasonal-item');
    seasonalItems.forEach(item => {
        const playlist = item.dataset.playlist;
        let isInSeason = false;
        
        switch (playlist) {
            case 'winter_music':
                isInSeason = month === 12 || month === 1 || month === 2;
                break;
            case 'halloween_music':
                isInSeason = month === 10;
                break;
            case 'christmas_music':
                isInSeason = month === 12 && day >= 15;
                break;
            case 'summer_music':
                isInSeason = month >= 6 && month <= 8;
                break;
        }
        
        console.log(`Playlist ${playlist}: inSeason=${isInSeason}, holidayMode=${holidayMode}`);
        
        if (holidayMode && !isInSeason) {
            // Make them look disabled but still clickable
            item.style.opacity = '0.6';
            item.style.pointerEvents = 'auto'; // Always allow clicking
            item.title = `${playlist.replace('_', ' ')} (Not in season - Holiday Mode enabled)`;
            
            // Add a visual indicator
            if (!item.querySelector('.season-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'season-indicator';
                indicator.innerHTML = '<i class="fas fa-clock"></i>';
                indicator.title = 'Out of season';
                item.appendChild(indicator);
            }
        } else {
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
            item.title = isInSeason ? `${playlist.replace('_', ' ')} (Currently in season!)` : `${playlist.replace('_', ' ')}`;
            
            // Remove season indicator if it exists
            const indicator = item.querySelector('.season-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    });
}

// Equalizer
function openEqualizer() {
    document.getElementById('equalizer-modal').classList.add('show');
}

function applyEQPreset() {
    const preset = document.getElementById('eq-preset').value;
    const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        acoustic: [4, 4, 2, 0, 2, 2, 4, 3, 3, 4],
        'bass-booster': [5, 4, 3, 2, 0, -1, -2, -2, -2, -2],
        'bass-reducer': [-5, -4, -3, -2, 0, 1, 2, 2, 2, 2],
        classical: [4, 3, 2, 2, -2, -2, 0, 2, 3, 4],
        dance: [4, 6, 2, 0, 0, -2, -2, 0, 2, 4],
        deep: [5, 3, 1, 1, 3, 1, -2, -4, -5, -6],
        electronic: [3, 3, 0, -2, -1, 1, 0, 1, 3, 4],
        'hip-hop': [5, 4, 1, 3, -1, -1, 1, -1, 2, 3],
        jazz: [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
        latin: [4, 3, 0, 0, -2, -2, -2, 0, 3, 4],
        loudness: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1],
        lounge: [-3, -1, -1, 1, 4, 2, 0, -2, 1, 1],
        piano: [2, 1, 0, 2, 3, 1, 4, 5, 3, 3],
        pop: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -2],
        rnb: [2, 6, 5, 1, -2, -1, 2, 2, 3, 3],
        rock: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
        'small-speakers': [4, 3, 3, 2, 1, 0, -1, -2, -3, -4],
        'spoken-word': [-3, -1, 0, 1, 4, 5, 4, 3, 2, 0],
        'treble-booster': [-2, -2, -2, -1, 0, 1, 2, 3, 4, 5],
        'treble-reducer': [2, 2, 2, 1, 0, -1, -2, -3, -4, -5],
        'vocal-booster': [-2, -3, -3, 1, 4, 4, 3, 2, 1, -1]
    };
    
    const values = presets[preset] || presets.flat;
    const sliders = document.querySelectorAll('.eq-slider');
    
    sliders.forEach((slider, index) => {
        slider.value = values[index];
        updateEQValue(slider);
        updateEqualizer({ target: slider });
    });
    
    // Save equalizer preset
    saveEqualizerSettings();
}

// FIXED: Equalizer shows "Custom" when manually adjusted
function updateEqualizer(event) {
    const slider = event.target;
    const freq = parseInt(slider.dataset.freq);
    const gain = parseFloat(slider.value);
    
    if (equalizer[freq]) {
        equalizer[freq].gain.value = gain;
    }
    
    updateEQValue(slider);
    
    // Set preset to "Custom" when manually adjusting
    const presetSelect = document.getElementById('eq-preset');
    if (presetSelect.value !== 'custom') {
        presetSelect.value = 'custom';
    }
    
    // Save equalizer settings (debounced)
    clearTimeout(updateEqualizer.timeout);
    updateEqualizer.timeout = setTimeout(saveEqualizerSettings, 1000);
}

function saveEqualizerSettings() {
    const eqSettings = getCurrentEqualizerSettings();
    setSetting('equalizer', eqSettings);
}

function updateEQValue(slider) {
    const valueSpan = slider.parentElement.querySelector('.eq-value');
    valueSpan.textContent = `${slider.value}dB`;
}

// Settings
async function toggleHolidayMode() {
    const holidayMode = document.getElementById('holiday-mode').checked;
    console.log('Holiday mode toggled to:', holidayMode);
    await setSetting('holidayMode', holidayMode);
    appSettings.holidayMode = holidayMode; // Update local copy
    
    // Update visual appearance of seasonal playlists
    updateSeasonalMusic();
    
    // Update holiday status display
    updateHolidayStatus();
    
    // Refresh the current view to apply filtering
    const activeSection = document.querySelector('.nav-item.active')?.dataset.section;
    if (activeSection === 'library') {
        // Refresh library view with new filtering
        switchSection('library');
    } else if (activeSection === 'favorites') {
        // Refresh favorites (they might contain seasonal songs)
        loadPlaylist('favorites');
    }
    
    const status = holidayMode ? 'enabled' : 'disabled';
    const filteredCount = musicLibrary.length - getFilteredLibrary().length;
    
    if (holidayMode && filteredCount > 0) {
        showNotification(`Holiday mode ${status} - ${filteredCount} seasonal songs filtered out`, 'info');
    } else {
        showNotification(`Holiday mode ${status}`, 'info');
    }
}

function loadSettings() {
    // This function is now handled by loadAppSettings and applyLoadedSettings
    // Kept for compatibility
}

async function testSeasonalPlaylists() {
    console.log('=== Testing Seasonal Playlists ===');
    
    // Check if seasonal items exist
    const seasonalItems = document.querySelectorAll('.seasonal-item');
    console.log(`Found ${seasonalItems.length} seasonal items`);
    
    seasonalItems.forEach((item, index) => {
        const playlist = item.dataset.playlist;
        const computedStyle = window.getComputedStyle(item);
        console.log(`Item ${index}: ${playlist}`);
        console.log(`  - Pointer events: ${computedStyle.pointerEvents}`);
        console.log(`  - Opacity: ${computedStyle.opacity}`);
        console.log(`  - Display: ${computedStyle.display}`);
        
        // Check if playlist exists
        if (playlists[playlist]) {
            console.log(`  - Playlist exists with ${playlists[playlist].length} songs`);
        } else {
            console.log(`  - Playlist does not exist, will be created empty`);
        }
    });
    
    // Test loading winter music specifically
    console.log('Testing winter music load...');
    loadPlaylist('winter_music');
    
    showNotification('Seasonal playlist test completed - check console for details', 'info');
}

async function resetAllSettings() {
    const confirmReset = confirm('Reset all settings to default? This will restart the app.');
    if (confirmReset) {
        try {
            await ipcRenderer.invoke('reset-settings');
            alert('Settings reset successfully. The app will restart.');
            location.reload();
        } catch (error) {
            console.error('Error resetting settings:', error);
            alert('Error resetting settings. Please try again.');
        }
    }
}

async function refreshMusicLibrary() {
    console.log('Refreshing music library...');
    
    // Clear current library
    musicLibrary = [];
    
    // Reload from folders
    await loadDownloadedMusic();
    
    // Update UI
    if (document.querySelector('.nav-item[data-section="library"]').classList.contains('active')) {
        switchSection('library');
    }
    
    alert(`Library refreshed! Loaded ${musicLibrary.length} songs.`);
}

async function importMusicFolder() {
    // This will be handled by the main process menu
    console.log('Import music folder clicked');
    alert('Use the File menu to import additional music folders, or place MP3 files in the music/neuro, music/evil, or music/duet folders and click Refresh Library.');
}

async function syncGoogleDrive() {
    try {
        const result = await ipcRenderer.invoke('setup-google-drive');
        if (result.success) {
            alert('Google Drive setup successful! (Note: Actual sync functionality requires additional implementation)');
        } else {
            alert(`Google Drive setup failed: ${result.error}`);
        }
    } catch (error) {
        console.error('Error setting up Google Drive:', error);
        alert('Error setting up Google Drive. Make sure client_secret.json is in the app directory.');
    }
}

// Modal Management
function openCreatePlaylist() {
    document.getElementById('create-playlist-modal').classList.add('show');
    document.getElementById('playlist-name-input').focus();
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
    
    // Clear selected song for playlist
    window.selectedSongForPlaylist = null;
    
    // Clear create playlist input
    const playlistInput = document.getElementById('playlist-name-input');
    if (playlistInput) {
        playlistInput.value = '';
    }
}

// FIXED: Section Switching with proper library sorting and view tracking
function switchSection(section) {
    console.log(`Switching to section: ${section}`);
    
    // UPDATE CURRENT VIEW TRACKING
    currentView = {
        section: section,
        playlist: null // Clear playlist when switching to a section
    };
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[data-section="${section}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
    
    // Clear seasonal/playlist active states
    document.querySelectorAll('.seasonal-item, .playlist-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Handle section logic
    switch (section) {
        case 'library':
            console.log('Switching to library view');
            currentPlaylist = getFilteredLibrary(); // Use filtered library
            
            // FIXED: Default sort by name when switching to library
            currentPlaylist.sort((a, b) => a.title.localeCompare(b.title));
            nameSort = 'asc'; // Reset sort direction
            
            console.log(`Library view: ${currentPlaylist.length} songs available`);
            displaySongs();
            
            // Update header info
            updateLibraryHeaderInfo();
            break;
            
        case 'favorites':
            console.log('Switching to favorites view');
            loadPlaylist('favorites');
            break;
            
        case 'blocked':
            console.log('Switching to blocked songs view');
            loadBlockedSongs();
            break;
            
        case 'playlists':
            // Show playlists overview
            console.log('Switching to playlists view');
            displayPlaylistsOverview();
            break;
            
        case 'settings':
            console.log('Opening settings modal');
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) {
                settingsModal.classList.add('show');
            } else {
                console.error('Settings modal not found');
            }
            break;
            
        default:
            console.warn(`Unknown section: ${section}`);
    }
    
    // SAVE SETTINGS WHEN VIEW CHANGES
    saveAppSettings();
}

// Display playlists overview
function displayPlaylistsOverview() {
    const songList = document.getElementById('song-list');
    songList.innerHTML = '';
    
    // Update header info
    const singerName = document.getElementById('singer-name');
    const songDate = document.getElementById('song-date');
    
    // Count all playlists
    const allPlaylists = Object.keys(playlists);
    const customPlaylists = allPlaylists.filter(name => 
        !['favorites', 'blocked', 'winter_music', 'halloween_music', 'christmas_music'].includes(name)
    );
    
    singerName.textContent = 'Your Playlists';
    songDate.textContent = `${allPlaylists.length} total playlists (${customPlaylists.length} custom)`;
    
    // Create a grid layout for playlists
    const playlistGrid = document.createElement('div');
    playlistGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 16px;
        padding: 16px;
        grid-column: 1 / -1;
    `;
    
    // Add all playlists
    allPlaylists.forEach(playlistName => {
        const playlistCard = createPlaylistCard(playlistName);
        playlistGrid.appendChild(playlistCard);
    });
    
    songList.appendChild(playlistGrid);
}

function createPlaylistCard(playlistName) {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s;
        border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    
    const songCount = playlists[playlistName] ? playlists[playlistName].length : 0;
    
    // Choose icon and color based on playlist type
    let icon = 'fas fa-music';
    let color = '#1db954';
    
    if (playlistName === 'favorites') {
        icon = 'fas fa-heart';
        color = '#e91e63';
    } else if (playlistName === 'blocked') {
        icon = 'fas fa-ban';
        color = '#e22134';
    } else if (playlistName === 'winter_music' || playlistName === 'christmas_music') {
        icon = 'fas fa-snowflake';
        color = '#3498db';
    } else if (playlistName === 'halloween_music') {
        icon = 'fas fa-ghost';
        color = '#e67e22';
    }
    
    const displayName = playlistName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    card.innerHTML = `
        <div style="text-align: center;">
            <i class="${icon}" style="font-size: 48px; color: ${color}; margin-bottom: 16px;"></i>
            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${displayName}</h3>
            <p style="color: #b3b3b3; font-size: 14px;">${songCount} songs</p>
        </div>
    `;
    
    card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(255, 255, 255, 0.08)';
        card.style.transform = 'translateY(-2px)';
        card.style.borderColor = color;
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(255, 255, 255, 0.05)';
        card.style.transform = 'translateY(0)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    card.addEventListener('click', () => {
        loadPlaylist(playlistName);
    });
    
    return card;
}

// Load blocked songs view
function loadBlockedSongs() {
    console.log('Loading blocked songs view');
    
    if (!playlists.blocked || playlists.blocked.length === 0) {
        currentPlaylist = [];
    } else {
        // Show all blocked songs (even if they're not in library anymore)
        currentPlaylist = musicLibrary.filter(song =>
            playlists.blocked.includes(song.filename)
        );
    }
    
    console.log(`Found ${currentPlaylist.length} blocked songs`);
    
    // Update header info
    const singerName = document.getElementById('singer-name');
    const songDate = document.getElementById('song-date');
    
    if (singerName && songDate) {
        singerName.textContent = 'Blocked Songs';
        if (currentPlaylist.length === 0) {
            songDate.textContent = 'No blocked songs - you can block songs using the 🚫 button';
        } else {
            songDate.textContent = `${currentPlaylist.length} blocked songs (click 🚫 to unblock)`;
        }
    }
    
    displayBlockedSongs();
}

// Display blocked songs with unblock functionality
function displayBlockedSongs() {
    const songList = document.getElementById('song-list');
    songList.innerHTML = '';
    
    console.log(`Displaying ${currentPlaylist.length} blocked songs`);
    
    if (currentPlaylist.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.style.cssText = `
            text-align: center; 
            padding: 40px; 
            color: #b3b3b3; 
            font-size: 16px;
            grid-column: 1 / -1;
        `;
        emptyMessage.innerHTML = `
            <i class="fas fa-ban" style="font-size: 48px; margin-bottom: 16px; display: block; opacity: 0.5; color: #e22134;"></i>
            <div>No blocked songs</div>
            <div style="font-size: 14px; margin-top: 8px;">
                Songs you block will appear here.<br>
                You can unblock them by clicking the 🚫 button.
            </div>
        `;
        songList.appendChild(emptyMessage);
        return;
    }
    
    currentPlaylist.forEach((song, index) => {
        try {
            const songItem = document.createElement('div');
            songItem.className = 'song-item blocked-song-item';
            
            const displayDate = song.date ? song.date.toLocaleDateString() : '—';
            
            songItem.innerHTML = `
                <div class="song-title" title="${song.title}">${song.title}</div>
                <div class="song-artist">${song.artist}</div>
                <div class="song-date">${displayDate}</div>
                <div class="song-actions">
                    <button class="action-btn unblock-btn" title="Unblock Song">
                        <i class="fas fa-ban"></i> Unblock
                    </button>
                    <button class="action-btn playlist-add" title="Add to Playlist">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
            
            // Unblock button
            const unblockBtn = songItem.querySelector('.unblock-btn');
            const playlistBtn = songItem.querySelector('.playlist-add');
            
            unblockBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await toggleBlocked(song);
                // Refresh the blocked songs view
                loadBlockedSongs();
                showNotification(`Unblocked "${song.title}"`, 'success');
            });
            
            playlistBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showPlaylistSelector(song);
            });
            
            // Style the unblock button
            unblockBtn.style.background = '#e22134';
            unblockBtn.style.color = '#ffffff';
            unblockBtn.style.border = 'none';
            unblockBtn.style.padding = '6px 12px';
            unblockBtn.style.borderRadius = '4px';
            unblockBtn.style.fontSize = '12px';
            unblockBtn.style.fontWeight = '600';
            
            songList.appendChild(songItem);
        } catch (error) {
            console.error('Error creating blocked song item:', error, song);
        }
    });
    
    console.log(`Successfully displayed ${currentPlaylist.length} blocked songs in the UI`);
}

// IPC Listeners
ipcRenderer.on('folder-selected', async (event, folderPath) => {
    try {
        const musicFiles = await ipcRenderer.invoke('get-music-files', folderPath);
        musicFiles.forEach(file => addSongToLibrary(file.path));
        
        currentPlaylist = [...musicLibrary];
        displaySongs();
    } catch (error) {
        console.error('Error loading music files:', error);
    }
});

ipcRenderer.on('settings-loaded', (event, settings) => {
    appSettings = settings;
    applyLoadedSettings();
});

ipcRenderer.on('open-settings-modal', () => {
    document.getElementById('settings-modal').classList.add('show');
});

// Save settings before page unload
window.addEventListener('beforeunload', () => {
    // Save current state immediately
    saveAppSettings();
});

// Auto-save when window loses focus
window.addEventListener('blur', () => {
    saveAppSettings();
});

// FIXED: Keyboard Shortcuts with shuffle button moved to controls
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            previousSong();
            break;
        case 'ArrowRight':
            e.preventDefault();
            nextSong();
            break;
        case 'KeyR':
            if (e.ctrlKey) {
                e.preventDefault();
                toggleRepeat();
            }
            break;
        case 'KeyS':
            if (e.ctrlKey) {
                e.preventDefault();
                document.getElementById('search-input').focus();
            } else if (!e.ctrlKey && !e.altKey) {
                e.preventDefault();
                toggleShuffle(); // Added shuffle keyboard shortcut
            }
            break;
        case 'Escape':
            closeModal();
            break;
    }
});

