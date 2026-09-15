#!/usr/bin/env python3
"""
Installer script for Namaw! Native Companion
Registers com.namaw.helper for Google Chrome and Brave Browser.
Checks for yt-dlp and FFmpeg dependencies.
"""

import os
import sys
import json
import shutil
import subprocess
import platform

HOST_NAME = "com.namaw.helper"

def check_dependencies():
    print("[1/3] Checking dependencies...")

    # Check Python version
    print(f"  • Python: {sys.version.split()[0]} (OK)")

    # Check yt-dlp
    has_ytdlp = False
    try:
        ver = subprocess.check_output([sys.executable, "-m", "yt_dlp", "--version"], text=True).strip()
        print(f"  • yt-dlp: {ver} (OK)")
        has_ytdlp = True
    except Exception:
        pass

    if not has_ytdlp and shutil.which("yt-dlp"):
        try:
            ver = subprocess.check_output(["yt-dlp", "--version"], text=True).strip()
            print(f"  • yt-dlp: {ver} (OK)")
            has_ytdlp = True
        except Exception:
            pass

    if not has_ytdlp:
        print("  • yt-dlp: NOT FOUND! Attempting to install via pip...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"])
            print("  • yt-dlp: Successfully installed via pip! (OK)")
        except Exception as e:
            print(f"  • [WARNING] Could not auto-install yt-dlp: {e}")
            print("    Please run: pip install yt-dlp")

    # Check FFmpeg
    if shutil.which("ffmpeg"):
        print("  • FFmpeg: Available on PATH (OK)")
    else:
        print("  • FFmpeg: NOT FOUND on PATH.")
        print("    Recommendation on Windows: run 'winget install Gyan.FFmpeg' to install FFmpeg.")

def install_windows():
    import winreg
    print("\n[2/3] Configuring Native Messaging Host...")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    bat_path = os.path.join(script_dir, "src", "namaw_helper.bat")
    manifest_dir = os.path.join(script_dir, "manifest")
    manifest_path = os.path.join(manifest_dir, f"{HOST_NAME}.json")

    os.makedirs(manifest_dir, exist_ok=True)

    manifest = {
        "name": HOST_NAME,
        "description": "Namaw! Native Companion Host for yt-dlp and FFmpeg",
        "path": bat_path,
        "type": "stdio",
        "allowed_origins": [
            "chrome-extension://*/"
        ]
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"  • Generated manifest at: {manifest_path}")

    print("\n[3/3] Registering in Windows Registry...")
    registry_targets = [
        rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}",
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}",
    ]

    for key_path in registry_targets:
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, manifest_path)
            winreg.CloseKey(key)
            print(f"  [OK] Registered HKCU\\{key_path}")
        except Exception as e:
            print(f"  [ERROR] Failed to write HKCU\\{key_path}: {e}")

def main():
    print("=" * 60)
    print("   Namaw! Native Companion Setup & Registration")
    print("=" * 60)

    check_dependencies()

    os_name = platform.system()
    if os_name == "Windows":
        install_windows()
        print("\n" + "=" * 60)
        print(" SUCCESS: Namaw! Companion is registered for Chrome and Brave!")
        print(" In Brave/Chrome, reload the extension or reopen the popup.")
        print("=" * 60)
    else:
        print(f"Platform {os_name} registration:")
        print(f"Copy {HOST_NAME}.json into ~/.config/google-chrome/NativeMessagingHosts/")

if __name__ == "__main__":
    main()
