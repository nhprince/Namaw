#!/usr/bin/env python3
"""
Uninstaller script for Namaw! Native Companion
Removes com.namaw.helper registry keys.
"""

import platform

HOST_NAME = "com.namaw.helper"

def uninstall_windows():
    import winreg

    registry_targets = [
        rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}",
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}",
    ]

    for key_path in registry_targets:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
            print(f"[OK] Removed: HKCU\\{key_path}")
        except FileNotFoundError:
            print(f"[INFO] Not present: HKCU\\{key_path}")
        except Exception as e:
            print(f"[ERROR] Failed to delete HKCU\\{key_path}: {e}")

def main():
    print("Uninstalling Namaw! Native Companion...")
    if platform.system() == "Windows":
        uninstall_windows()
        print("Uninstallation complete.")

if __name__ == "__main__":
    main()
