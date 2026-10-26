#!/usr/bin/env python3
"""Import selected local exports; publish only video, posters and display metadata."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path
from PIL import Image

OBJECTS = [
    ("cup1", "cup", "Cup"), ("camera", "camera", "Camera"),
    ("clock", "clock", "Clock"), ("bnana", "banana", "Banana"),
    ("luosidao", "screwdriver", "Screwdriver"),
    ("pineapple", "pineapple", "Pineapple"), ("pot", "pot", "Pot"),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    catalog = {"version": 1, "objects": []}
    total = 0
    for source, slug, label in OBJECTS:
        obj = {"id": slug, "name": label, "clips": []}
        for index, request_path in enumerate(sorted((args.source_root / source).rglob("request.json"))):
            folder = request_path.parent
            if not (folder / "result.json").exists():
                continue
            request = json.loads(request_path.read_text())
            result = json.loads((folder / "result.json").read_text())
            dest = root / "media" / slug / f"{index + 1:02d}"
            dest.mkdir(parents=True, exist_ok=True)
            streams = []
            for filename in ["student_grasp.mp4", "teacher_critic.mp4"]:
                origin = folder / filename
                info = json.loads(subprocess.check_output([
                    "ffprobe", "-v", "error", "-select_streams", "v:0",
                    "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration",
                    "-of", "json", str(origin)]))["streams"][0]
                if info["codec_name"] != "h264":
                    raise ValueError(f"Expected H.264: {origin}")
                streams.append(info)
                shutil.copy2(origin, dest / filename)
                total += origin.stat().st_size
            if streams[0] != streams[1]:
                raise ValueError(f"Unsynchronized video pair: {folder}")
            for filename, output in [("grasp_start.png", "poster.jpg"), ("critic_start.png", "critic.jpg")]:
                with Image.open(folder / filename) as image:
                    image = image.convert("RGB")
                    image.thumbnail((960, 540))
                    image.save(dest / output, quality=88, optimize=True)
            with Image.open(folder / "grasp_start.png") as image:
                w, h = image.size
                image = image.convert("RGB").crop((0, int(h*.14), w, int(h*.94)))
                image.thumbnail((480, 270))
                image.save(dest / "thumb.jpg", quality=86, optimize=True)
            rel = dest.relative_to(root).as_posix() + "/"
            obj["clips"].append({
                "id": f"{slug}-{index+1:02d}", "number": index + 1,
                "pose": request["pose_index"], "objectIndex": request["object_index"],
                "xCm": round(request["x_cm"], 2), "yCm": round(request["y_cm"], 2),
                "yawDeg": round(request["yaw_deg"], 2), "massKg": request["mass_kg"],
                "simulationSeconds": result["simulation_seconds"],
                "duration": result["video_seconds"], "outcome": result["outcome"],
                "fps": result["fps"], "width": streams[0]["width"], "height": streams[0]["height"],
                "frames": int(streams[0]["nb_frames"]), "studentIteration": result["student_iteration"],
                "teacherIteration": result["teacher_iteration"], "grasp": rel + "student_grasp.mp4",
                "critic": rel + "teacher_critic.mp4", "poster": rel + "poster.jpg",
                "criticPoster": rel + "critic.jpg", "thumbnail": rel + "thumb.jpg",
            })
        if not obj["clips"]:
            raise ValueError(f"No complete video pairs for {source}")
        catalog["objects"].append(obj)
    catalog["clipCount"] = sum(len(o["clips"]) for o in catalog["objects"])
    (root / "media/catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"Imported {catalog['clipCount']} paired rollouts from {len(catalog['objects'])} objects; {total/1e6:.2f} MB of original MP4s.")

if __name__ == "__main__":
    main()
