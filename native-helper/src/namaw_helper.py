#!/usr/bin/env python3
"""
Namaw! Native Companion Host
Communicates with the Namaw! browser extension via standard I/O Native Messaging.
Provides access to yt-dlp and native FFmpeg for difficult platforms and large files.
"""

import sys
import os
import json
import struct
import subprocess
import shutil
import re
import threading

VERSION = "1.1.0"

def get_ytdlp_cmd():
    """Returns the reliable command array to invoke yt-dlp."""
    return [sys.executable, "-m", "yt_dlp"]

def get_ytdlp_version():
    try:
        cmd = get_ytdlp_cmd() + ["--version"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None

def is_ffmpeg_available():
    return shutil.which("ffmpeg") is not None

def send_message(message_dict):
    """Encodes and sends a message to standard output using the 4-byte length prefix protocol."""
    encoded_json = json.dumps(message_dict).encode("utf-8")
    length = len(encoded_json)
    sys.stdout.buffer.write(struct.pack("@I", length))
    sys.stdout.buffer.write(encoded_json)
    sys.stdout.buffer.flush()

def read_message():
    """Reads a 4-byte length-prefixed message from standard input."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("@I", raw_length)[0]
    payload = sys.stdin.buffer.read(length).decode("utf-8")
    return json.loads(payload)

current_process = None
process_lock = threading.Lock()

def handle_download(url, options):
    global current_process
    output_dir = options.get("output_dir") or os.path.expanduser("~/Downloads/Namaw")
    os.makedirs(output_dir, exist_ok=True)
    output_template = os.path.join(output_dir, "%(title)s [%(resolution)s].%(ext)s")

    cmd = get_ytdlp_cmd() + [
        "--newline",
        "--no-playlist",
        "-o", output_template,
    ]

    format_id = options.get("format_id")
    if format_id == "audio_only":
        cmd.extend(["-x", "--audio-format", "mp3"])
    elif format_id == "1080p":
        cmd.extend(["-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best", "--merge-output-format", "mp4"])
    elif format_id == "720p":
        cmd.extend(["-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best", "--merge-output-format", "mp4"])
    elif format_id == "480p":
        cmd.extend(["-f", "bestvideo[height<=480]+bestaudio/best[height<=480]/best", "--merge-output-format", "mp4"])
    else:
        cmd.extend(["-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", "--merge-output-format", "mp4"])

    cmd.append(url)

    try:
        with process_lock:
            current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

        progress_regex = re.compile(
            r"\[download\]\s+([\d\.]+)%\s+of\s+~?([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)"
        )

        for line in current_process.stdout:
            line = line.strip()
            match = progress_regex.search(line)
            if match:
                percent = float(match.group(1))
                total_size = match.group(2)
                speed = match.group(3)
                eta = match.group(4)
                send_message({
                    "event": "progress",
                    "percent": percent,
                    "total_size": total_size,
                    "speed": speed,
                    "eta": eta
                })

        current_process.wait()
        returncode = current_process.returncode

        with process_lock:
            current_process = None

        if returncode == 0:
            send_message({"event": "completed", "output_dir": output_dir})
        else:
            send_message({"event": "error", "error": f"yt-dlp download failed with exit code {returncode}"})

    except Exception as e:
        send_message({"event": "error", "error": str(e)})

def handle_extract(url):
    cmd = get_ytdlp_cmd() + ["-J", "--flat-playlist", "--no-warnings", url]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        if res.returncode == 0:
            info = json.loads(res.stdout)
            send_message({
                "status": "ok",
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
            })
        else:
            send_message({"status": "error", "error": res.stderr.strip()})
    except Exception as e:
        send_message({"status": "error", "error": str(e)})

def main():
    while True:
        try:
            msg = read_message()
            if msg is None:
                break

            action = msg.get("action")

            if action == "ping":
                send_message({
                    "status": "ok",
                    "version": VERSION,
                    "ytdlp_version": get_ytdlp_version(),
                    "ffmpeg_available": is_ffmpeg_available()
                })

            elif action == "extract":
                url = msg.get("url")
                if url:
                    threading.Thread(target=handle_extract, args=(url,), daemon=True).start()

            elif action == "download":
                url = msg.get("url")
                if not url:
                    send_message({"event": "error", "error": "Missing URL"})
                    continue
                threading.Thread(target=handle_download, args=(url, msg.get("options", {})), daemon=True).start()

            elif action == "cancel":
                with process_lock:
                    if current_process:
                        current_process.terminate()
                send_message({"status": "cancelled"})

            else:
                send_message({"status": "unknown_action", "action": action})

        except Exception as e:
            send_message({"event": "error", "error": str(e)})

if __name__ == "__main__":
    main()
