#!/usr/bin/env python3
"""
Optimized Google Drive Music Sync for Neuro Music Player
High-performance parallel downloading with resume capability
"""

import os
import json
import sys
import time
import threading
from pathlib import Path
import requests
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from datetime import datetime
import hashlib

# Google Drive API scopes
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

# Folder IDs from the URLs provided
DRIVE_FOLDERS = {
    'neuro': '118gr4QuaGQGKfJ0X8VBCytvPjdzPayPY',  # Neuro music
    'evil': '16WT3-_bOG2I50YS9eBwNK9W99Uh-QhwK',   # Evil music
    'duet': '16XWYR_-i0vAvKkmI9a77ZLiZTp20WHjs'    # Duet music
}

class OptimizedGoogleDriveSync:
    def __init__(self, credentials_file='client_secret.json', max_workers=5):
        """Initialize the optimized Google Drive sync client."""
        self.credentials_file = credentials_file
        self.service = None
        self.music_dir = Path('music')
        self.music_dir.mkdir(exist_ok=True)
        self.max_workers = min(max_workers, 25)  # Limit to 25 threads max for safety
        
        # Statistics tracking
        self.stats = {
            'total_files': 0,
            'downloaded': 0,
            'skipped': 0,
            'failed': 0,
            'total_size': 0,
            'start_time': None,
            'lock': threading.Lock()
        }
        
        # Progress tracking
        self.progress_file = Path('sync_progress.json')
        self.completed_files = self.load_progress()
        
        # Create subdirectories for each artist
        for artist in DRIVE_FOLDERS.keys():
            (self.music_dir / artist).mkdir(exist_ok=True)
    
    def load_progress(self):
        """Load previously completed downloads to enable resume."""
        if self.progress_file.exists():
            try:
                with open(self.progress_file, 'r') as f:
                    return set(json.load(f))
            except:
                return set()
        return set()
    
    def save_progress(self, file_id):
        """Save progress to enable resume on interruption."""
        self.completed_files.add(file_id)
        try:
            with open(self.progress_file, 'w') as f:
                json.dump(list(self.completed_files), f)
        except:
            pass  # Don't fail download if we can't save progress
    
    def authenticate(self):
        """Authenticate with Google Drive API."""
        creds = None
        token_file = 'token.json'
        
        # Load existing credentials
        if os.path.exists(token_file):
            creds = Credentials.from_authorized_user_file(token_file, SCOPES)
        
        # If no valid credentials, authenticate
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.credentials_file):
                    print(f"Error: {self.credentials_file} not found!")
                    print("Please download your Google Drive API credentials and save as 'client_secret.json'")
                    sys.exit(1)
                
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, SCOPES)
                creds = flow.run_local_server(port=0)
            
            # Save credentials for next run
            with open(token_file, 'w') as token:
                token.write(creds.to_json())
        
        self.service = build('drive', 'v3', credentials=creds)
        print("✓ Google Drive authentication successful")
    
    def get_folder_files(self, folder_id, mime_type='audio/mpeg'):
        """Get all files of specified type from a Google Drive folder."""
        try:
            query = f"'{folder_id}' in parents and mimeType='{mime_type}' and trashed=false"
            files = []
            page_token = None
            
            while True:
                results = self.service.files().list(
                    q=query,
                    pageSize=1000,
                    pageToken=page_token,
                    fields="nextPageToken, files(id, name, size, modifiedTime)"
                ).execute()
                
                files.extend(results.get('files', []))
                page_token = results.get('nextPageToken')
                
                if not page_token:
                    break
            
            return files
        except Exception as e:
            print(f"Error accessing folder {folder_id}: {e}")
            return []
    
    def create_service_for_thread(self):
        """Create a new service instance for thread-safe operations."""
        token_file = 'token.json'
        if os.path.exists(token_file):
            creds = Credentials.from_authorized_user_file(token_file, SCOPES)
            return build('drive', 'v3', credentials=creds)
        return None
    
    def download_file_optimized(self, file_info, destination_path):
        """Optimized file download with progress tracking."""
        file_id, filename, file_size = file_info['id'], file_info['name'], file_info.get('size', 0)
        
        # Skip if already completed
        if file_id in self.completed_files:
            with self.stats['lock']:
                self.stats['skipped'] += 1
            return True, f"⏭️  Skipped {filename} (already downloaded)"
        
        file_path = destination_path / filename
        
        # Skip if file exists with correct size
        if file_path.exists() and file_size:
            if file_path.stat().st_size == int(file_size):
                self.save_progress(file_id)
                with self.stats['lock']:
                    self.stats['skipped'] += 1
                return True, f"⏭️  Skipped {filename} (already exists)"
        
        try:
            # Create thread-safe service
            service = self.create_service_for_thread()
            if not service:
                return False, f"❌ Failed to create service for {filename}"
            
            request = service.files().get_media(fileId=file_id)
            
            # Download with chunked reading for better memory management
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request, chunksize=64*1024*1024)  # 64MB chunks
            done = False
            
            while done is False:
                status, done = downloader.next_chunk()
            
            # Atomic write to prevent corruption
            temp_path = file_path.with_suffix('.tmp')
            with open(temp_path, 'wb') as f:
                f.write(fh.getvalue())
            
            # Move to final location
            temp_path.rename(file_path)
            
            # Update progress
            self.save_progress(file_id)
            
            with self.stats['lock']:
                self.stats['downloaded'] += 1
                if file_size:
                    self.stats['total_size'] += int(file_size)
            
            return True, f"✓ Downloaded {filename}"
            
        except Exception as e:
            with self.stats['lock']:
                self.stats['failed'] += 1
            return False, f"❌ Error downloading {filename}: {str(e)[:100]}"
    
    def print_progress(self):
        """Print current download progress."""
        while True:
            time.sleep(2)  # Update every 2 seconds
            
            with self.stats['lock']:
                if self.stats['start_time']:
                    elapsed = time.time() - self.stats['start_time']
                    completed = self.stats['downloaded'] + self.stats['skipped'] + self.stats['failed']
                    
                    if completed > 0:
                        rate = completed / elapsed if elapsed > 0 else 0
                        eta = (self.stats['total_files'] - completed) / rate if rate > 0 else 0
                        
                        size_mb = self.stats['total_size'] / (1024 * 1024)
                        
                        print(f"\r📊 Progress: {completed}/{self.stats['total_files']} files "
                              f"({completed/self.stats['total_files']*100:.1f}%) | "
                              f"✓ {self.stats['downloaded']} ⏭️ {self.stats['skipped']} "
                              f"❌ {self.stats['failed']} | "
                              f"{size_mb:.1f}MB | "
                              f"{rate:.1f} files/sec | "
                              f"ETA: {eta/60:.1f}m", end='', flush=True)
                
                if completed >= self.stats['total_files']:
                    break
    
    def sync_folder_optimized(self, artist_name, folder_id):
        """Sync all MP3 files from a specific folder with parallel downloads."""
        print(f"\n🎵 Syncing {artist_name.title()} music...")
        
        files = self.get_folder_files(folder_id)
        if not files:
            print(f"No MP3 files found in {artist_name} folder")
            return
        
        # Filter MP3 files
        mp3_files = [f for f in files if f['name'].lower().endswith('.mp3')]
        
        print(f"Found {len(mp3_files)} MP3 files")
        
        if not mp3_files:
            return
        
        destination = self.music_dir / artist_name
        
        # Update total file count
        with self.stats['lock']:
            self.stats['total_files'] += len(mp3_files)
        
        # Start progress display thread
        if not hasattr(self, 'progress_thread_started'):
            progress_thread = threading.Thread(target=self.print_progress, daemon=True)
            progress_thread.start()
            self.progress_thread_started = True
        
        # Download files in parallel
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_file = {
                executor.submit(self.download_file_optimized, file_info, destination): file_info 
                for file_info in mp3_files
            }
            
            success_count = 0
            for future in as_completed(future_to_file):
                success, message = future.result()
                if success:
                    success_count += 1
        
        print(f"\n✓ {artist_name.title()}: {success_count}/{len(mp3_files)} files completed")
    
    def sync_all_optimized(self):
        """Sync all music folders with optimizations."""
        print("🚀 Starting Optimized Google Drive music sync...")
        print(f"⚡ Using {self.max_workers} parallel download threads")
        
        if not self.service:
            print("Error: Not authenticated with Google Drive")
            return
        
        # Initialize stats
        with self.stats['lock']:
            self.stats['start_time'] = time.time()
            self.stats['total_files'] = 0
        
        # Get total file count first
        print("📊 Scanning folders...")
        total_files = 0
        for artist, folder_id in DRIVE_FOLDERS.items():
            try:
                files = self.get_folder_files(folder_id)
                mp3_count = len([f for f in files if f['name'].lower().endswith('.mp3')])
                total_files += mp3_count
                print(f"  {artist.title()}: {mp3_count} MP3 files")
            except Exception as e:
                print(f"❌ Error scanning {artist}: {e}")
        
        print(f"\n📁 Total: {total_files} MP3 files to sync")
        
        if total_files == 0:
            print("No files to download.")
            return
        
        # Start downloading
        for artist, folder_id in DRIVE_FOLDERS.items():
            try:
                self.sync_folder_optimized(artist, folder_id)
            except Exception as e:
                print(f"❌ Error syncing {artist}: {e}")
        
        # Final statistics
        with self.stats['lock']:
            total_time = time.time() - self.stats['start_time']
            size_mb = self.stats['total_size'] / (1024 * 1024)
            avg_speed = self.stats['total_size'] / total_time / (1024 * 1024) if total_time > 0 else 0
        
        print(f"\n\n🎉 Sync Complete!")
        print(f"📊 Final Statistics:")
        print(f"  ✓ Downloaded: {self.stats['downloaded']} files")
        print(f"  ⏭️  Skipped: {self.stats['skipped']} files")
        print(f"  ❌ Failed: {self.stats['failed']} files")
        print(f"  📁 Total Size: {size_mb:.1f} MB")
        print(f"  ⏱️  Total Time: {total_time/60:.1f} minutes")
        print(f"  🚀 Average Speed: {avg_speed:.1f} MB/sec")
        print(f"  📂 Music saved to: {self.music_dir.absolute()}")
        
        # Clean up progress file
        if self.progress_file.exists():
            self.progress_file.unlink()
    
    def quick_sync(self, max_files_per_artist=50):
        """Quick sync mode - download only a subset of files for testing."""
        print(f"⚡ Quick Sync Mode - downloading up to {max_files_per_artist} files per artist")
        
        for artist, folder_id in DRIVE_FOLDERS.items():
            try:
                files = self.get_folder_files(folder_id)
                mp3_files = [f for f in files if f['name'].lower().endswith('.mp3')][:max_files_per_artist]
                
                if mp3_files:
                    print(f"\n🎵 Quick syncing {len(mp3_files)} {artist} songs...")
                    destination = self.music_dir / artist
                    
                    with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                        futures = [executor.submit(self.download_file_optimized, file_info, destination) 
                                 for file_info in mp3_files]
                        
                        for future in as_completed(futures):
                            success, message = future.result()
                            print(message)
                            
            except Exception as e:
                print(f"❌ Error in quick sync for {artist}: {e}")

def main():
    """Main function with performance options."""
    print("🎵 Neuro Music Player - Optimized Google Drive Sync")
    print("=" * 60)
    
    # Performance recommendations
    print("⚡ Performance Tips:")
    print("  • Use 'quick' mode to test with fewer files first")
    print("  • Increase threads (--threads) if you have good internet")
    print("  • Resume interrupted downloads by running again")
    print("  • Close other bandwidth-heavy applications")
    print("")
    
    # Parse command line arguments
    mode = 'full'
    max_workers = 15  # Default higher for better performance
    
    if len(sys.argv) > 1:
        if 'quick' in sys.argv:
            mode = 'quick'
        if '--threads' in sys.argv:
            try:
                idx = sys.argv.index('--threads')
                max_workers = int(sys.argv[idx + 1])
                max_workers = max(1, min(25, max_workers))  # Limit 1-25 threads
            except (IndexError, ValueError):
                print("Invalid --threads value, using default (15)")
    
    # Performance recommendations based on thread count
    if max_workers >= 15:
        print("🚀 High-performance mode detected!")
        print(f"  Using {max_workers} threads - great for gigabit internet")
    elif max_workers >= 8:
        print(f"⚡ Fast mode with {max_workers} threads - good for fast internet")
    else:
        print(f"🐌 Standard mode with {max_workers} threads - for slower connections")
    
    # Check for credentials file
    if not os.path.exists('client_secret.json'):
        print("❌ client_secret.json not found!")
        print("\nTo set up Google Drive sync:")
        print("1. Go to Google Cloud Console")
        print("2. Create a new project or select existing")
        print("3. Enable Google Drive API")
        print("4. Create credentials (OAuth 2.0 Client ID)")
        print("5. Download the JSON file and rename to 'client_secret.json'")
        sys.exit(1)
    
    # Initialize optimized sync client
    sync_client = OptimizedGoogleDriveSync(max_workers=max_workers)
    
    try:
        # Authenticate
        sync_client.authenticate()
        
        if mode == 'quick':
            print(f"🚀 Starting Quick Sync (max 50 files per artist, {max_workers} threads)")
            sync_client.quick_sync()
        else:
            print(f"🚀 Starting Full Sync ({max_workers} threads)")
            print("💡 Tip: Press Ctrl+C to pause, then run again to resume")
            sync_client.sync_all_optimized()
    
    except KeyboardInterrupt:
        print("\n⏸️  Sync paused. Run the script again to resume from where you left off.")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        print("Usage Examples:")
        print("  python google_drive_sync_optimized.py                     # Full sync (15 threads)")
        print("  python google_drive_sync_optimized.py quick              # Quick test (50 files per artist)")
        print("  python google_drive_sync_optimized.py --threads 20       # Ultra-fast (20 threads)")
        print("  python google_drive_sync_optimized.py quick --threads 10 # Quick test (10 threads)")
        print("")
        print("Thread Recommendations:")
        print("  1-5 threads   : Slow internet (10 Mbps or less)")
        print("  8-10 threads  : Fast internet (50-100 Mbps)")
        print("  15-20 threads : Gigabit internet (500+ Mbps)")
        print("  20+ threads   : Ultra-fast internet (1Gb/s+)")
        print("")
        
        response = input("Continue with full sync (15 threads)? (y/n): ").lower().strip()
        if response not in ['y', 'yes']:
            sys.exit(0)
    
    main()