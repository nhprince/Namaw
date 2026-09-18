/**
 * 1-click Native Companion installer for Windows.
 *
 * The companion ships INSIDE the extension package as a self-contained
 * namaw_helper.exe (Python runtime + yt-dlp embedded) because Chrome native
 * messaging on Windows requires the host path to be a real executable.
 *
 * Flow:
 *  1. Save namaw_helper.exe from the extension package to the Downloads folder.
 *  2. Generate a small .bat embedding the exact absolute path + this
 *     extension's runtime ID (wildcards are not allowed in allowed_origins).
 *  3. User double-clicks the .bat: it writes the native-messaging manifest
 *     and registry entries for Chrome, Brave and Edge, then offers FFmpeg.
 */

/** Downloads the bundled companion exe and returns its absolute path on disk. */
export async function stageCompanionExe(): Promise<{ downloadId: number; absolutePath: string }> {
  const url = chrome.runtime.getURL('companion/namaw_helper.exe');

  // Check the asset exists before starting a doomed download
  const probe = await fetch(url);
  if (!probe.ok) {
    throw new Error('The bundled companion executable is missing from this build.');
  }

  const downloadId = await chrome.downloads.download({
    url,
    filename: 'NamawCompanion/namaw_helper.exe',
    conflictAction: 'overwrite',
    saveAs: false,
  });

  // Wait for the download to finish so its absolute path is available
  const item = await waitForDownload(downloadId);
  if (!item?.filename) {
    throw new Error('Could not determine where the companion executable was saved.');
  }
  return { downloadId, absolutePath: item.filename };
}

function waitForDownload(downloadId: number): Promise<chrome.downloads.DownloadItem | null> {
  return new Promise((resolve, reject) => {
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(listener);
        chrome.downloads.search({ id: downloadId }, (items) => resolve(items[0] || null));
      } else if (delta.state?.current === 'interrupted') {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error('Companion download was interrupted.'));
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      reject(new Error('Timed out waiting for the companion download to finish.'));
    }, 120_000);
  });
}

/** Builds the small registration .bat referencing the already-saved exe. */
export function buildRegistrationBat(extensionId: string, exePath: string): Blob {
  const ps = `powershell -NoProfile -Command "$m = @{ name = 'com.namaw.helper'; description = 'Namaw! Native Companion Host'; path = '${exePath.replace(/'/g, "''")}'; type = 'stdio'; allowed_origins = @('chrome-extension://${extensionId}/') }; [System.IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'NamawCompanion\\com.namaw.helper.json'), ($m | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))"`;

  const lines = [
    '@echo off',
    'title Namaw! Companion Installer',
    'echo ============================================================',
    'echo   Namaw! Companion - Finalize Install',
    'echo ============================================================',
    'echo.',
    `set "EXE=${exePath}"`,
    'if not exist "%EXE%" (',
    '  echo ERROR: companion executable not found at "%EXE%".',
    '  echo Please keep both downloaded files together, then re-run.',
    '  pause',
    '  exit /b 1',
    ')',
    'mkdir "%LOCALAPPDATA%\\NamawCompanion" 2>nul',
    ps,
    'reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.namaw.helper" /ve /t REG_SZ /d "%LOCALAPPDATA%\\NamawCompanion\\com.namaw.helper.json" /f >nul',
    'reg add "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.namaw.helper" /ve /t REG_SZ /d "%LOCALAPPDATA%\\NamawCompanion\\com.namaw.helper.json" /f >nul',
    'reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.namaw.helper" /ve /t REG_SZ /d "%LOCALAPPDATA%\\NamawCompanion\\com.namaw.helper.json" /f >nul',
    'where ffmpeg >nul 2>nul',
    'if errorlevel 1 (',
    '  echo Installing FFmpeg via winget ^(needed for best quality merges^)...',
    '  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements >nul 2>nul',
    ')',
    'echo ============================================================',
    'echo  DONE! Return to Namaw! and click Re-check Companion.',
    'echo ============================================================',
    'pause',
  ];

  return new Blob([lines.join('\r\n')], { type: 'application/x-bat' });
}
