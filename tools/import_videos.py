#!/usr/bin/env python3
"""Import simulation videos by the source folder categories, for test or training."""
import argparse
import collections
import concurrent.futures
import json
import re
import shutil
import subprocess
from pathlib import Path
from PIL import Image

ALIASES = {
    "cup1": ("cup", "Cup"), "camera": ("camera", "Camera"),
    "clock": ("clock", "Clock"), "bnana": ("banana", "Banana"),
    "luosidao": ("screwdriver", "Screwdriver"),
    "pineapple": ("pineapple", "Pineapple"), "pot": ("pot", "Pot"),
    "UMI-grip": ("umi-grip", "UMI grip"), "mouse": ("mouse", "Mouse"),
    "shoes": ("shoes", "Shoes"), "water_tap": ("water-tap", "Water tap"),
}
TRAIN_NAMES = {
    "bottle": "Bottle", "box": "Box", "cellphone": "Cellphone",
    "earphone": "Earphone", "jar": "Jar", "mug": "Mug",
    "piano_model": "Piano model", "pistol": "Pistol", "watch": "Watch",
}
SPLIT_NOTES = {
    "test": "All object instances in this source collection were never seen during training, as confirmed by the project owner.",
    "train": "These examples use objects from the 418-object training set, grouped by the source folder categories.",
}

def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result.stdout

def discover(source_root, split):
    # One directory is one display category, even when it contains several meshes.
    directories = [source_root / name for name in ALIASES if (source_root / name).is_dir()] if split == "test" else []
    directories += sorted(p for p in source_root.iterdir() if p.is_dir() and p not in directories and not p.name.startswith("."))
    groups = []
    expected_kind = "lab" if split == "test" else "position"
    for directory in directories:
        paths, indices = [], set()
        for path in sorted(directory.rglob("request.json")):
            if not (path.parent / "result.json").is_file():
                print(f"Skipping unfinished export: {path.parent.name}", flush=True)
                continue
            request = json.loads(path.read_text())
            if request.get("kind") != expected_kind:
                raise ValueError(f"Expected {expected_kind} exports for split={split}: {path}")
            paths.append(path)
            indices.add(int(request["object_index"]))
        if not paths:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", directory.name.lower()).strip("-")
        name = TRAIN_NAMES.get(directory.name, directory.name.replace("_", " ").replace("-", " ").capitalize())
        if split == "test":
            slug, name = ALIASES.get(directory.name, (slug, name))
        if not slug:
            raise ValueError(f"Category needs a usable slug: {directory.name}")
        groups.append({"id": slug, "name": name, "sourceCategory": directory.name,
                       "objectIndices": sorted(indices), "split": split,
                       "unseenDuringTraining": split == "test", "requests": paths})
    if not groups:
        raise ValueError("No complete exports found")
    if len({g["id"] for g in groups}) != len(groups):
        raise ValueError("Category slug collision")
    return groups

def prepare(task):
    root, group, number, path = task
    folder = path.parent
    request = json.loads(path.read_text())
    result = json.loads((folder / "result.json").read_text())
    media_root = root / "media" if group["split"] == "test" else root / "media/train"
    dest = media_root / group["id"] / f"{number:02d}"
    dest.mkdir(parents=True, exist_ok=True)
    streams = []
    for filename in ["student_grasp.mp4", "teacher_critic.mp4"]:
        origin = folder / filename
        probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(origin)]))
        video = next(s for s in probe["streams"] if s["codec_type"] == "video")
        fields = ["codec_name", "width", "height", "avg_frame_rate", "nb_frames", "duration"]
        info = {k: video[k] for k in fields}
        if info["codec_name"] != "h264":
            raise ValueError(f"Expected H.264: {origin}")
        streams.append(info)
        if any(s["codec_type"] == "audio" for s in probe["streams"]):
            temporary = dest / (filename + ".tmp.mp4")
            run(["ffmpeg", "-v", "error", "-y", "-i", str(origin), "-map", "0:v:0", "-c:v", "copy", "-an",
                 "-movflags", "+faststart", str(temporary)])
            temporary.replace(dest / filename)
        else:
            shutil.copy2(origin, dest / filename)
    if streams[0] != streams[1]:
        raise ValueError(f"Unsynchronized video pair: {folder}")
    # Read the true final frame from each video, rather than trusting start PNGs.
    # Reversing only the last half-second bounds decoder memory use.
    for filename, output in [("student_grasp.mp4", "last-frame.jpg"),
                             ("teacher_critic.mp4", "critic-last-frame.jpg")]:
        run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.5", "-threads", "2",
             "-i", str(dest / filename), "-vf", "reverse", "-frames:v", "1",
             "-q:v", "2", "-threads", "1", str(dest / output)])
    with Image.open(dest / "last-frame.jpg") as image:
        image = image.convert("RGB")
        image.thumbnail((480, 270))
        # A new filename also invalidates cached first-frame thumbnails.
        image.save(dest / "thumb-last.jpg", quality=90, optimize=True)
    rel = dest.relative_to(root).as_posix() + "/"
    return {
        "id": f"{group['id']}-{number:02d}", "number": number,
        "pose": request["pose_index"], "objectIndex": request["object_index"],
        "split": group["split"], "unseenDuringTraining": group["split"] == "test", "hasAudio": False,
        "xCm": round(request["x_cm"], 2), "yCm": round(request["y_cm"], 2),
        "yawDeg": round(request.get("yaw_deg", 0), 2), "massKg": request.get("mass_kg"),
        "simulationSeconds": result["simulation_seconds"], "duration": result["video_seconds"],
        "outcome": result["outcome"], "fps": result["fps"],
        "width": streams[0]["width"], "height": streams[0]["height"], "frames": int(streams[0]["nb_frames"]),
        "studentIteration": result["student_iteration"], "teacherIteration": result["teacher_iteration"],
        "grasp": rel + "student_grasp.mp4", "critic": rel + "teacher_critic.mp4",
        "poster": rel + "last-frame.jpg", "criticPoster": rel + "critic-last-frame.jpg", "thumbnail": rel + "thumb-last.jpg",
        "lastFrame": rel + "last-frame.jpg", "criticLastFrame": rel + "critic-last-frame.jpg",
        "thumbnailFrame": "last", "posterFrame": "last",
        "sourceExport": folder.name,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--split", choices=["test", "train"], default="test")
    parser.add_argument("--jobs", type=int, default=3)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    groups = discover(args.source_root, args.split)
    tasks = [(root, group, i + 1, path) for group in groups for i, path in enumerate(group["requests"])]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        clips = list(pool.map(prepare, tasks))
    objects = []
    offset = 0
    for group in groups:
        count = len(group["requests"])
        obj = {k: v for k, v in group.items() if k != "requests"}
        obj["clips"] = clips[offset:offset + count]
        objects.append(obj)
        offset += count
    catalog = {"version": 3, "split": args.split, "unseenDuringTraining": args.split == "test",
               "splitNote": SPLIT_NOTES[args.split], "grouping": "source_directory",
               "categoryCount": len(objects),
               "objectCount": len({index for obj in objects for index in obj["objectIndices"]}),
               "clipCount": len(clips), "objects": objects}
    media_root = root / "media" if args.split == "test" else root / "media/train"
    temporary = media_root / ".catalog.tmp.json"
    temporary.write_text(json.dumps(catalog, indent=2) + "\n")
    temporary.replace(media_root / "catalog.json")
    print(f"Imported {len(clips)} paired rollouts in {len(objects)} {args.split} categories.", flush=True)
    print("Outcomes:", dict(collections.Counter(c["outcome"] for c in clips)), flush=True)

if __name__ == "__main__":
    main()
