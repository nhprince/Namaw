#!/usr/bin/env python3
"""
Installer script for Namaw! Native Companion
Registers com.namaw.helper for Chrome and Brave.
"""

import os
import sys
import json
import platform

HOST_NAME = "com.namaw.helper"

def install_windows():
    import winreg
    script_dir = os.path.dirname(os.path.abspath(__file__))
    bat_path = os.path.join(script_dir, "src", "namaw_helper.bat")
    manifest_path = os.path.join(script_dir, "manifest", f"{HOST_NAME}.json")

    manifest = {
        "name": HOST_NAME,
        "description": "Namaw! Native Companion Host",
        "path": bat_path,
        "type": "stdio",
        "allowed_origins": ["chrome-extension://*/"]
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # Windows Registry Targets: Chrome and Brave
    registry_targets = [
        rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}",
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}",
    ]

    for key_path in registry_targets:
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, manifest_path)
            winreg.CloseKey(key)
            print(f"[OK] Registered: HKCU\\{key_path}")
        except Exception as e:
            print(f"[ERROR] Failed to write registry key HKCU\\{key_path}: {e}")

def main():
    print("Installing Namaw! Native Companion Host...")
    os_name = platform.system()

    if os_name == "Windows":
        install_windows()
        print("\nInstallation successful! Restart your browser or reload Namaw! extension.")
    else:
        print(f"Platform {os_name} registration: Place manifest in ~/.config/google-chrome/NativeMessagingHosts/")

if __name__ == "__main__":
    main()
