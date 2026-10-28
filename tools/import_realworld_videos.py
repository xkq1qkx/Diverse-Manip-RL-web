#!/usr/bin/env python3
"""Prepare silent MP4s and exact final-frame covers for the real-world gallery."""
import argparse
import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image

GROUPS = [("cup", "cup", "Cup"), ("camera", "camera", "Camera"),
          ("duck", "duck", "Duck"), ("shovel", "shovel", "Shovel"),
          ("UMI-grip", "umi-grip", "UMI grip")]
SUFFIXES = {".mov", ".qt", ".mp4", ".m4v"}

def command(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(" ".join(args[:3]) + "\n" + result.stderr[-3000:])
    return result

def probe(path, count=False):
    args = ["ffprobe", "-v", "error", "-threads", "2"]
    if count:
        args += ["-count_frames"]
    args += ["-show_streams", "-show_format", "-of", "json", str(path)]
    return json.loads(command(args).stdout)

def rotation(stream):
    return next((float(d.get("rotation", 0)) for d in stream.get("side_data_list", [])
                 if d.get("side_data_type") == "Display Matrix"), 0.0)

def prepare(task):
    source, slug, label, number, root = task
    info = probe(source, count=True)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    if video["codec_name"] != "h264" or video["pix_fmt"] != "yuv420p":
        raise ValueError(f"Requires an explicit encoding decision: {source.name}")
    count = int(video["nb_read_frames"])
    if count < 1:
        raise ValueError(f"No decoded frames: {source}")
    folder = root / "media" / "realworld" / slug / f"{number:02d}"
    folder.mkdir(parents=True, exist_ok=True)
    temporary = folder / ".video.tmp.mp4"
    # Copy the H.264 bitstream losslessly; omit every audio stream.
    command(["ffmpeg", "-v", "error", "-y", "-i", str(source),
             "-map", "0:v:0", "-an", "-c:v", "copy", "-map_metadata", "-1",
             "-movflags", "+faststart", str(temporary)])
    output = probe(temporary)
    out_video = next(s for s in output["streams"] if s["codec_type"] == "video")
    assert len(output["streams"]) == 1 and out_video["codec_type"] == "video"
    assert int(out_video["nb_frames"]) == count
    assert abs(float(out_video["duration"]) - float(video["duration"])) < .001
    assert abs(rotation(video) - rotation(out_video)) < .01
    temporary.replace(folder / "video.mp4")
    # Decode the whole video and select the exact last decoded frame (zero based).
    # ffmpeg autorotation matches the display matrix retained by the browser MP4.
    cover = folder / "last-frame.jpg"
    command(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-i", str(source),
             "-map", "0:v:0", "-an", "-vf", f"select=eq(n\\,{count - 1})",
             "-frames:v", "1", "-fps_mode", "passthrough", "-q:v", "2",
             "-threads", "1", str(cover)])
    with Image.open(cover) as image:
        width, height = image.size
        image.thumbnail((360, 640))
        image.convert("RGB").save(folder / "thumb.jpg", quality=90, optimize=True)
    rel = folder.relative_to(root).as_posix() + "/"
    print(f"{label} {number:02d}: {count} frames, last frame {count - 1}, {width}x{height}, audio removed", flush=True)
    return {
        "id": f"{slug}-{number:02d}", "group": slug, "groupName": label, "number": number,
        "video": rel + "video.mp4", "poster": rel + "last-frame.jpg", "thumbnail": rel + "thumb.jpg",
        "width": width, "height": height, "duration": float(out_video["duration"]),
        "frameCount": count, "posterFrameIndex": count - 1, "posterMethod": "last_decoded_frame",
        "hasAudio": False, "sourceFile": source.relative_to(root).as_posix(),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "processing": "H.264 stream copy; audio removed; original rotation and video timing preserved",
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path)
    parser.add_argument("--jobs", type=int, default=3)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source_root = args.source_root or root / "media" / "Realworld_Demo"
    tasks, groups = [], []
    for source_group, slug, label in GROUPS:
        files = sorted(p for p in (source_root / source_group).iterdir() if p.suffix.lower() in SUFFIXES)
        groups.append({"id": slug, "name": label, "count": len(files)})
        tasks.extend((p, slug, label, i + 1, root) for i, p in enumerate(files))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        clips = list(pool.map(prepare, tasks))
    if not clips:
        raise ValueError("No real-world videos found")
    catalog = {"version": 1, "clipCount": len(clips), "groups": groups, "clips": clips,
               "audio": "removed", "cover": "exact_last_decoded_frame"}
    temporary = root / "media" / "realworld" / ".catalog.tmp.json"
    temporary.write_text(json.dumps(catalog, indent=2) + "\n")
    temporary.replace(root / "media" / "realworld" / "catalog.json")
    print(f"Prepared {len(clips)} silent videos with exact final-frame covers.", flush=True)

if __name__ == "__main__":
    main()
