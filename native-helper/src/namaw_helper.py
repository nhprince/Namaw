#!/usr/bin/env python3
"""
Namaw! Native Companion Host
Communicates with the Namaw! browser extension via stdio Native Messaging.
Embeds yt-dlp as a library (in frozen builds) so no child processes are needed.
"""

import sys
import os
import json
import struct
import shutil
import threading

VERSION = "1.3.0"

try:
    import yt_dlp
    HAVE_YTDLP = True
except ImportError:
    yt_dlp = None
    HAVE_YTDLP = False

DEBUG_LOG = os.environ.get("NAMAW_DEBUG_LOG") or os.path.join(
    os.environ.get("TEMP", os.path.expanduser("~")), "namaw-helper-debug.log"
)

def debug(*parts):
    if not DEBUG_LOG:
        return
    try:
        import time
        with open(DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.time():.2f}] " + " ".join(str(p) for p in parts) + "\n")
    except Exception:
        pass

def send_message(message_dict):
    encoded_json = json.dumps(message_dict).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded_json)))
    sys.stdout.buffer.write(encoded_json)
    sys.stdout.buffer.flush()

def clean_error_text(text):
    """Strip ANSI color codes and yt-dlp prefixes for UI presentation."""
    import re
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    text = re.sub(r"^ERROR:\s*", "", text.strip())
    return text or "Download failed"

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    if length > 64 * 1024 * 1024:
        return None
    payload = sys.stdin.buffer.read(length).decode("utf-8")
    return json.loads(payload)

def get_ffmpeg_location():
    """Return an absolute path to ffmpeg for yt-dlp's --ffmpeg-location.
    A bare 'ffmpeg' command name is NOT a valid location and makes yt-dlp
    report 'ffmpeg is not installed'."""
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    base = os.path.dirname(sys.executable)
    sibling = os.path.join(base, "ffmpeg.exe")
    if os.path.isfile(sibling):
        return sibling
    alt = os.path.join(os.path.dirname(base), "bin", "ffmpeg.exe")
    if os.path.isfile(alt):
        return alt
    return None

def get_ytdlp_version():
    if HAVE_YTDLP:
        try:
            return yt_dlp.version.__version__
        except Exception:
            pass
    return None

class DownloadCancelled(Exception):
    pass

class CancelledSentinel:
    def __init__(self):
        self.jobs = set()
        self.lock = threading.Lock()

    def cancel(self, job_id):
        with self.lock:
            self.jobs.add(job_id)

    def is_cancelled(self, job_id):
        with self.lock:
            return job_id in self.jobs

    def clear(self, job_id):
        with self.lock:
            self.jobs.discard(job_id)

cancel_state = CancelledSentinel()

def format_selector(format_id, has_ffmpeg):
    if not has_ffmpeg:
        return "best[ext=mp4][vcodec!=none]/best"
    if format_id == "audio_only":
        return "bestaudio/best"
    if format_id == "1080p":
        return "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
    if format_id == "720p":
        return "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
    if format_id == "480p":
        return "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
    return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

def handle_download(url, options, job_id):
    if not HAVE_YTDLP:
        send_message({"event": "error", "job_id": job_id,
                      "error": "yt-dlp is not available in this companion build."})
        return

    try:
        output_dir = options.get("output_dir") or os.path.join(os.path.expanduser("~"), "Downloads", "Namaw")
        os.makedirs(output_dir, exist_ok=True)

        ffmpeg_loc = get_ffmpeg_location()
        format_id = options.get("format_id")

        ydl_opts = {
            "outtmpl": os.path.join(output_dir, "%(title)s [%(resolution)s].%(ext)s"),
            "noplaylist": True,
            "restrictfilenames": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "format": format_selector(format_id, bool(ffmpeg_loc)),
        }

        if ffmpeg_loc:
            ydl_opts["ffmpeg_location"] = ffmpeg_loc
            if format_id and format_id != "audio_only":
                ydl_opts["merge_output_format"] = "mp4"
            elif format_id == "audio_only":
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                }]

        def progress_hook(d):
            status = d.get("status")
            if status == "downloading":
                if cancel_state.is_cancelled(job_id):
                    raise DownloadCancelled()
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                downloaded = d.get("downloaded_bytes", 0)
                percent = round((downloaded / total) * 100, 1) if total else None
                send_message({
                    "event": "progress",
                    "job_id": job_id,
                    "percent": percent,
                    "speed": d.get("speed"),
                    "eta": d.get("eta"),
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                })
            elif status == "finished":
                send_message({"event": "progress", "job_id": job_id, "percent": 100, "phase": "processing"})

        ydl_opts["progress_hooks"] = [progress_hook]

        debug("download start", job_id, "url:", url, "format:", ydl_opts["format"])
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        cancel_state.clear(job_id)
        debug("download done", job_id)
        send_message({"event": "completed", "job_id": job_id, "output_dir": output_dir})

    except DownloadCancelled:
        debug("download cancelled", job_id)
        send_message({"event": "cancelled", "job_id": job_id})
    except Exception as e:
        cancel_state.clear(job_id)
        err = clean_error_text(str(e))
        debug("download error", job_id, err)
        if "Unsupported URL" in err or "No video formats" in err:
            hint = "yt-dlp could not extract this site. It may require login or is DRM-protected."
        elif "Incomplete read" in err or "Connection" in err:
            hint = "Network error while downloading. Check your connection and retry."
        else:
            hint = err
        send_message({"event": "error", "job_id": job_id, "error": hint})

def handle_extract(url):
    if not HAVE_YTDLP:
        send_message({"status": "error", "error": "yt-dlp unavailable"})
        return
    try:
        ydl_opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        send_message({
            "status": "ok",
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
        })
    except Exception as e:
        send_message({"status": "error", "error": str(e)})

def main():
    debug("host booted, frozen =", getattr(sys, "frozen", False), "argv =", sys.argv[1:])
    while True:
        try:
            msg = read_message()
            if msg is None:
                debug("stdin closed, exiting")
                break
            debug("recv:", msg)

            action = msg.get("action")

            if action == "ping":
                send_message({
                    "status": "ok",
                    "version": VERSION,
                    "ytdlp_version": get_ytdlp_version(),
                    "ffmpeg_available": get_ffmpeg_location() is not None,
                })

            elif action == "extract":
                url = msg.get("url")
                if url:
                    threading.Thread(target=handle_extract, args=(url,), daemon=True).start()

            elif action == "download":
                url = msg.get("url")
                job_id = msg.get("job_id") or ""
                if not url:
                    send_message({"event": "error", "job_id": job_id, "error": "Missing URL"})
                    continue
                options = msg.get("options", {}) or {}
                if msg.get("format_id"):
                    options["format_id"] = msg.get("format_id")
                threading.Thread(target=handle_download, args=(url, options, job_id), daemon=True).start()

            elif action == "cancel":
                cancel_state.cancel(msg.get("job_id") or "")

            else:
                send_message({"status": "unknown_action", "action": action})

        except Exception as e:
            debug("main loop exception:", e)
            try:
                send_message({"event": "error", "error": str(e)})
            except Exception:
                break

if __name__ == "__main__":
    main()
