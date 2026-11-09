#!/usr/bin/env python3
"""Update existing website clips with verified rerecordings and combined V/V0 curves."""
import argparse
import concurrent.futures
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(root, source, entry, clip):
    folder = source / entry["job"]
    request = json.loads((folder / "request.json").read_text())
    result = json.loads((folder / "result.json").read_text())
    if (request["website_clip_id"] != clip["id"] or request["website_split"] != clip["split"]
            or request["original_source_export"] != clip["sourceExport"]
            or request["object_index"] != clip["objectIndex"] or request["pose_index"] != clip["pose"]):
        raise ValueError("Rerecording identity mismatch: " + entry["job"])
    if not result["source_matches"] or not result["critic_observations_saved"]:
        raise ValueError("Missing verified critic inputs: " + entry["job"])
    dest = (root / clip["grasp"].split("?", 1)[0]).parent
    if not dest.resolve().is_relative_to((root / "media").resolve()):
        raise ValueError("Destination is outside website media")
    streams = []
    for origin_name, name in (("student_grasp.mp4", "student_grasp.mp4"),
                              ("teacher_critic_combined.mp4", "teacher_critic.mp4")):
        origin = folder / origin_name
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(origin)], text=True))
        if len(probe["streams"]) != 1 or probe["streams"][0]["codec_type"] != "video":
            raise ValueError("Expected a silent video: " + str(origin))
        video = probe["streams"][0]
        if video["codec_name"] != "h264" or int(video["nb_frames"]) != result["frame_count"]:
            raise ValueError("Unexpected video encoding/timeline: " + str(origin))
        streams.append({k:video[k] for k in ("width", "height", "nb_frames", "avg_frame_rate", "duration")})
        tmp = dest / (name + ".tmp")
        shutil.copyfile(origin, tmp)
        tmp.replace(dest / name)
        if sha(origin) != sha(dest / name):
            raise ValueError("Media copy checksum mismatch")
    if streams[0] != streams[1]:
        raise ValueError("Unsynchronized video pair: " + entry["job"])
    for video, cover in (("student_grasp.mp4", "last-frame.jpg"),
                         ("teacher_critic.mp4", "critic-last-frame.jpg")):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.5", "-threads", "2",
                        "-i", str(dest/video), "-vf", "reverse", "-frames:v", "1", "-q:v", "2",
                        "-threads", "1", str(dest/cover)], check=True)
    with Image.open(dest / "last-frame.jpg") as original:
        thumbnail = original.convert("RGB")
        thumbnail.thumbnail((480, 270))
        thumbnail.save(dest / "thumb-last.jpg", quality=90, optimize=True)
    prefix = dest.relative_to(root).as_posix() + "/"
    def url(name):
        return prefix + name + "?v=" + sha(dest / name)[:12]
    clip.update(grasp=url("student_grasp.mp4"), critic=url("teacher_critic.mp4"),
                poster=url("last-frame.jpg"), criticPoster=url("critic-last-frame.jpg"),
                thumbnail=url("thumb-last.jpg"), lastFrame=url("last-frame.jpg"),
                criticLastFrame=url("critic-last-frame.jpg"), thumbnailFrame="last", posterFrame="last",
                simulationSeconds=result["simulation_seconds"], duration=result["video_seconds"],
                frames=result["frame_count"], fps=result["fps"], width=streams[0]["width"], height=streams[0]["height"],
                outcome=result["outcome"], hasAudio=False,
                studentIteration=result["student_iteration"], teacherIteration=result["teacher_iteration"],
                rerecordedExport=entry["job"], criticVariant="V_and_V0", criticInputTimeZeroIndex=result["time_zero_state_index"],
                criticSampleRateHz=10, videoTextLanguage="en", videoFont="Times New Roman")
    return clip


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--jobs", type=int, default=3)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = args.source_root.resolve()
    manifest = json.loads((source / "manifest.json").read_text())
    verification = json.loads((source / "verification.json").read_text())
    if not verification["complete"] or verification["checked"] != manifest["count"] or verification["errors"]:
        raise ValueError("Rerecording verification is incomplete")
    entries = {(x["split"], x["clip_id"]):x for x in manifest["entries"]}
    paths = [root / "media/catalog.json", root / "media/train/catalog.json"]
    catalogs = [copy.deepcopy(json.loads(path.read_text())) for path in paths]
    tasks = [(entry, clip) for catalog in catalogs for group in catalog["objects"] for clip in group["clips"]
             for entry in [entries[(catalog["split"], clip["id"])]]]
    if len(tasks) != manifest["count"] or len(entries) != len(tasks):
        raise ValueError("Website and recording inventories differ")
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,args.jobs)) as pool:
        futures = [pool.submit(prepare, root, source, entry, clip) for entry,clip in tasks]
        for i, future in enumerate(futures,1):
            future.result()
            if i % 15 == 0:
                print(f"Imported {i}/{len(tasks)} synchronized pairs", flush=True)
    for path,catalog in zip(paths,catalogs):
        catalog.update(version=4, recordingVersion=source.name, criticVariant="V_and_V0",
                       criticCurves=[dict(name="V", color="#2166AC", episodeTime="observed"),
                                     dict(name="V0", color="#238B45", episodeTime="zero")],
                       criticNote="V0 sets only the episode-time input to zero; all other inputs are unchanged. Both curves use actual simulation time on the horizontal axis.")
        tmp = path.with_suffix(".tmp.json")
        tmp.write_text(json.dumps(catalog,indent=2) + "\n")
        tmp.replace(path)
    print(f"Updated {len(tasks)} paired rollouts; categories and clip IDs preserved.")


if __name__ == "__main__":
    main()
