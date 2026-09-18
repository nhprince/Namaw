#!/usr/bin/env python3
"""
Installer for the Namaw! Native Companion (repo / developer flow).

Registers com.namaw.helper for Chrome, Brave and Edge with EXACT extension IDs
(Chrome rejects wildcards in allowed_origins). Modern Chrome assigns unpacked
extensions profile-random IDs, so discovery works by scanning browser profile
"Secure Preferences" for an extension installed from this repo's build output.
"""

import os
import sys
import json
import platform
import argparse

HOST_NAME = "com.namaw.helper"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE_PATH = os.path.join(ROOT, "native-helper", "bin", "namaw_helper.exe")
BAT_PATH = os.path.join(ROOT, "native-helper", "src", "namaw_helper.bat")
BUILD_DIR = os.path.join(ROOT, "extension", ".output", "chrome-mv3")

def check_dependencies():
    print("[1/3] Checking companion binary...")
    if os.path.isfile(EXE_PATH):
        print(f"  * Frozen host: {EXE_PATH} (OK)")
        return EXE_PATH
    if os.path.isfile(BAT_PATH):
        print("  * FALLING BACK to .bat launcher (requires system Python; less robust).")
        print("    Run scripts/build-helper.ps1 to produce the self-contained exe.")
        return BAT_PATH
    print("  [ERROR] No companion binary found. Run scripts/build-helper.ps1 first.")
    return None

def norm(path: str) -> str:
    return os.path.normcase(os.path.normpath(path))

def discover_extension_ids(build_dir: str) -> list[str]:
    """Find IDs of unpacked extensions whose install path matches build_dir."""
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        return []
    browser_roots = [
        os.path.join(local, "Google", "Chrome", "User Data"),
        os.path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
        os.path.join(local, "Microsoft", "Edge", "User Data"),
    ]

    ids = []
    for root in browser_roots:
        if not os.path.isdir(root):
            continue
        profiles = {"Default"}
        profiles.update(
            entry for entry in os.listdir(root)
            if entry.startswith("Profile ") or entry.lower().endswith("profile")
        )
        for prof in set(profiles):
            prefs = os.path.join(root, prof, "Secure Preferences")
            if not os.path.isfile(prefs):
                continue
            try:
                with open(prefs, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            settings = data.get("extensions", {}).get("settings", {})
            for ext_id, meta in settings.items():
                path = meta.get("path")
                if path and norm(path) == norm(build_dir):
                    name = (meta.get("manifest") or {}).get("name", "")
                    print(f"  * Found '{name}' (id: {ext_id}) in {prof}")
                    ids.append(ext_id)
    return list(dict.fromkeys(ids))

def write_manifest(origins: list[str], binary_path: str) -> str:
    manifest_dir = os.path.join(ROOT, "native-helper", "manifest")
    os.makedirs(manifest_dir, exist_ok=True)
    manifest_path = os.path.join(manifest_dir, f"{HOST_NAME}.json")
    manifest = {
        "name": HOST_NAME,
        "description": "Namaw! Native Companion Host (yt-dlp + FFmpeg)",
        "path": binary_path,
        "type": "stdio",
        "allowed_origins": origins,
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return manifest_path

def install_windows(manifest_path: str) -> bool:
    import winreg
    print("\n[3/3] Registering in Windows Registry...")
    ok = True
    for browser in ("Google\\Chrome", "BraveSoftware\\Brave-Browser", "Microsoft\\Edge"):
        key_path = rf"Software\{browser}\NativeMessagingHosts\{HOST_NAME}"
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, manifest_path)
            winreg.CloseKey(key)
            print(f"  [OK] HKCU\\{key_path}")
        except Exception as e:
            ok = False
            print(f"  [ERROR] HKCU\\{key_path}: {e}")
    return ok

def main():
    parser = argparse.ArgumentParser(description="Namaw! Companion installer")
    parser.add_argument("--extension-id", action="append", default=[],
                        help="Exact extension ID to allow (repeatable).")
    parser.add_argument("--build-dir", default=BUILD_DIR,
                        help="Unpacked extension build directory used for ID discovery.")
    args = parser.parse_args()

    print("=" * 60)
    print("  Namaw! Native Companion - Setup & Registration")
    print("=" * 60)

    binary = check_dependencies()
    if not binary:
        sys.exit(1)

    print("\n[2/3] Resolving extension IDs (wildcards are not allowed)...")
    ids = list(dict.fromkeys(args.extension_id + discover_extension_ids(args.build_dir)))
    if not ids:
        print("\n[ERROR] Could not find the Namaw! extension in any Chrome/Brave/Edge profile.")
        print("Open the extension popup first, then either reload it and re-run this installer,")
        print("or pass: python native-helper/install.py --extension-id <ID-from-popup>")
        print("Tip: the popup's Settings tab always shows the exact ID, and offers a")
        print("'Install Companion (1-click)' button that does this automatically.")
        sys.exit(1)

    origins = [f"chrome-extension://{i}/" for i in ids]
    manifest_path = write_manifest(origins, binary)
    print(f"  * Manifest: {manifest_path}")
    for origin in origins:
        print(f"  * Allowed origin: {origin}")

    if platform.system() == "Windows":
        ok = install_windows(manifest_path)
        print("\n" + "=" * 60)
        print(" SUCCESS: Companion registered. Reload Namaw! then click Re-check." if ok
              else " Registration finished with errors - see above.")
        print("=" * 60)
    else:
        print(f"Copy {manifest_path} into the browser's NativeMessagingHosts directory.")

if __name__ == "__main__":
    main()
