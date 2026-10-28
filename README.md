# Diverse-Manip-RL project website

English project homepage with 24 silent real-world recordings across five object
groups, plus 75 paired simulation-rollout and teacher-critic videos: 48 in 11 unseen-test
categories and 27 in nine training-set categories.

**Website:** https://xkq1qkx.github.io/Diverse-Manip-RL-web/

**Local preview:** http://127.0.0.1:8091/

This public repository hosts the project website through GitHub Pages.

## Preview locally

From this repository:

~~~bash
python3 tools/serve.py --port 8091
~~~

Open http://127.0.0.1:8091. No build step or package manager is required.

## Edit the site

- index.html: project text, sections and attribution.
- assets/site.css: responsive layout and styling.
- assets/site.js: test / training selection, category / take selection and synchronized playback.
- media/catalog.json: unseen-test episode metadata and media paths.
- media/train/catalog.json: training-object episode metadata and media paths.
- media/<category>/<take>/ and media/train/<category>/<take>/: silent English 1080p MP4s and final-frame covers.

Only the selected pair of videos loads into the player. Play, pause, scrubbing and
playback speed are shared. Buffering pauses both, and drift is corrected against
the student video. Clip links preserve the dataset, category and unique clip ID in the URL, including
categories containing multiple meshes with the same pose number.

The simulation and real-world sections are labeled separately. These examples are
not an aggregate success-rate evaluation. The teacher critic estimates discounted return
under the teacher policy, evaluated on the student's current state.

## Re-import local renders

Requires Python, Pillow, ffmpeg and ffprobe:

~~~bash
python3 tools/import_videos.py --split test --source-root /path/to/artifacts/videos
python3 tools/import_videos.py --split train --source-root /path/to/artifacts/videos_train
~~~

The importer discovers completed exports recursively, preserving exactly one display
category per source directory. Different meshes in Shoes, Jar, Pistol, or Watch stay
in the same category. It validates each dataset's export kind and paired video metadata,
removes audio if present, extracts the actual final frame of both videos, and emits
a sanitized catalog. Category names and grouping remain independent of mesh identity. It does not publish logs, absolute local paths, model files,
training data or meshes.

## Deploy

GitHub Pages serves the root of the main branch. Push website changes to main,
then wait for the Pages build to finish. The .nojekyll file keeps this a static site.
Review changes with the local preview server before publishing.

## Attribution

Design inspired by **Mateo Guaman Castro's SGS website** (https://sgs-rl.github.io/),
whose original design and code are © 2026 Mateo Guaman Castro and licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
This adaptation changes the layout, typography, palette, content and video
interactions. See [ATTRIBUTION.md](ATTRIBUTION.md) and the visible page footer for
full credit, changes, and the Swiss design / neoneo.ch acknowledgment.

## Real-world recordings

- Local camera originals: media/Realworld_Demo/ (ignored by Git).
- Browser media: media/realworld/<group>/<take>/video.mp4.
- Covers: last-frame.jpg and thumb.jpg, extracted from the exact final decoded frame.
- Display metadata: media/realworld/catalog.json.
- Gallery behavior: assets/realworld.js.

Prepare the gallery with Python, Pillow, ffmpeg and ffprobe:

~~~bash
python3 tools/import_realworld_videos.py --jobs 3
~~~

The importer supports the supplied MOV, mov and qt files. It counts decoded video
frames, then selects frame N−1 to produce each cover. The web videos copy the
original H.264 stream without re-encoding, retain rotation and video timing, and
remove every audio stream. The original camera files remain unchanged.

The gallery loads thumbnail images first. Selecting a recording opens a portrait
player with native playback, seeking and fullscreen controls, previous/next
navigation, an MP4 download, and a shareable clip link. Real-world playback defaults
to 2×; the visible Playback speed selector switches to 1× (original speed). The choice
persists when navigating between recordings within the page. Opening a real-world
recording pauses the synchronized simulation player.

## Training and test objects

The project owner confirms that every object instance in the simulation source
collection (artifacts/videos) is a test object never seen during training. The site
labels this explicitly, and the catalog records split=test and unseenDuringTraining.
This statement concerns object instances, and does not claim unseen categories.

The test collection contains 48 paired rollouts in 11 source-folder categories.
Shoes combines all six recordings across its three meshes. Failure and timeout
recordings are retained. The training collection contains 27 paired rollouts in
nine categories: Bottle, Box, Cellphone, Earphone, Jar, Mug, Piano model, Pistol,
and Watch. These are examples from the 418-object training set.

Keep training-object recordings under artifacts/videos_train and test recordings
under artifacts/videos. The split-specific importer rejects the other kind to
prevent mixing the collections. The simulator player switches between Test set
and Training set; the collection overview displays both with explicit labels.

Thumbnail cards, collection cards, and both waiting player panes use final-frame
covers. A cover overlay stays visible while the video's first frame preloads;
Play starts from time zero, while scrubbing shows the requested video frame.
The new thumb-last.jpg filenames avoid cached first-frame covers from older builds.

Preview the training collection directly at http://127.0.0.1:8091/?split=train#explore.

To visualize the 418 training objects and render student recordings, run from the
training project root:

~~~bash
python3 scripts/run.py diverse_rl.play_position \
  --checkpoint artifacts/student_dagger_latest.pt \
  --group 3B --object-index 127 --pose-index 0 --port 8088 \
  --video-output artifacts/videos_train --run
~~~

Open http://127.0.0.1:8088. Select an object from the 418-object dropdown and a pose
from 0 through 199. Use Video export to render the student and teacher-critic videos.
Object indices are the original training-catalog IDs, not a new sequence from 0 to 417.
