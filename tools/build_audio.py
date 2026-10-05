#!/usr/bin/env python
"""Build the game's sounds from the CC0 sources in art/audio/src (see art/audio/LICENSES.md).

Every source becomes two files in public/audio/, Ogg Vorbis and AAC (.m4a), because no single
format decodes everywhere (Safari before 18.4 has no Vorbis; Firefox on Linux may lack AAC). The
game picks one with canPlayType. File names carry a content hash, so the service worker can cache
them forever, and src/data/audio.json maps each sound's name to its hashed base name.

- Sound effects (everything not named music-*): mono, peak-normalized to -3 dBFS, so the game sets
  their relative levels in code.
- Music: stereo, two-pass loudness-normalized to -20 LUFS (true peak -2 dB), so areas don't jump
  in volume when the theme changes. The manifest records each loop's exact length, so the game
  can trim the AAC encoder delay if a browser's decoder leaves it in (a gap at every loop).

Needs ffmpeg with libvorbis: the system one, or imageio-ffmpeg's static build:
    PYTHONPATH=~/.cache/jimothy-sdxl-pylibs ~/venv/bin/python tools/build_audio.py
"""
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/audio/src"
OUT = ROOT / "public/audio"
MANIFEST = ROOT / "src/data/audio.json"


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return shutil.which("ffmpeg") or "ffmpeg"


FF = ffmpeg_exe()


def run(*args):
    return subprocess.run([FF, "-hide_banner", "-nostdin", *args], check=True, capture_output=True, text=True).stderr


def music_filter(src):
    """Two-pass loudnorm: measure, then apply the measured values as a linear gain."""
    target = "I=-20:TP=-2:LRA=11"
    log = run("-i", str(src), "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-")
    m = json.loads(log[log.rindex("{"):log.rindex("}") + 1])
    return (f"loudnorm={target}:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
            f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")


def sfx_filter(src):
    log = run("-i", str(src), "-ac", "1", "-af", "volumedetect", "-f", "null", "-")
    peak = float(re.search(r"max_volume: (-?[\d.]+) dB", log).group(1))
    return f"volume={-3 - peak:.2f}dB"


def ogg_seconds(path):
    """Exact length of an Ogg Vorbis file: the last page's granule position is its sample count."""
    data = path.read_bytes()
    i = data.rindex(b"OggS")
    return int.from_bytes(data[i + 6:i + 14], "little") / 44100


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():
        old.unlink()
    manifest = {"sfx": {}, "music": {}}
    for src in sorted(SRC.glob("*.ogg")):
        name = src.stem
        music = name.startswith("music-")
        af = music_filter(src) if music else sfx_filter(src)
        with tempfile.TemporaryDirectory() as tmp:
            # resample after loudnorm, which upsamples to 192 kHz internally
            ogg, m4a = Path(tmp) / "a.ogg", Path(tmp) / "a.m4a"
            # bitexact: no random Ogg serial numbers or encoder tags, so rebuilds keep their hashes
            common = ["-y", "-i", str(src), "-af", f"{af},aresample=44100", "-ac", "2" if music else "1",
                      "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"]
            run(*common, "-c:a", "libvorbis", "-q:a", "3" if music else "4", str(ogg))
            run(*common, "-c:a", "aac", "-b:a", "80k" if music else "64k", "-movflags", "+faststart", str(m4a))
            digest = hashlib.sha1(ogg.read_bytes() + m4a.read_bytes()).hexdigest()[:8]
            base = f"{name}.{digest}"
            shutil.copy(ogg, OUT / f"{base}.ogg")
            shutil.copy(m4a, OUT / f"{base}.m4a")
        if music:
            manifest["music"][name.removeprefix("music-")] = {"file": f"audio/{base}", "seconds": ogg_seconds(OUT / f"{base}.ogg")}
        else:
            manifest["sfx"][name] = f"audio/{base}"
        sizes = [(OUT / f"{base}.{x}").stat().st_size // 1024 for x in ("ogg", "m4a")]
        print(f"{name:28} ogg {sizes[0]:4} KB  m4a {sizes[1]:4} KB  {af[:40]}")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
