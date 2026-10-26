# Diverse-Manip-RL project website

English project homepage with 31 paired student-rollout and teacher-critic videos
across seven lab-object meshes.

**Website:** https://xkq1qkx.github.io/Diverse-Manip-RL-web/

## Preview locally

From this repository:

~~~bash
python3 tools/serve.py --port 8091
~~~

Open http://127.0.0.1:8091. No build step or package manager is required.

## Edit the site

- index.html: project text, sections and attribution.
- assets/site.css: responsive layout and styling.
- assets/site.js: object / pose selection and synchronized playback.
- media/catalog.json: public episode metadata and media paths.
- media/<object>/<take>/: original English 1080p MP4s and compact JPEG posters.

Only the selected pair of videos loads into the player. Play, pause, scrubbing and
playback speed are shared. Buffering pauses both, and drift is corrected against
the student video. Clip links preserve the object and pose in the URL.

All displayed rollouts are simulations. These curated examples are not an
aggregate success-rate evaluation. The teacher critic estimates discounted return
under the teacher policy, evaluated on the student's current state.

## Re-import local renders

Requires Python, Pillow, and ffprobe:

~~~bash
python3 tools/import_videos.py --source-root /path/to/artifacts/videos
~~~

The importer reads the seven named directories, checks that each pair has matching
video metadata, copies the original MP4s unchanged, creates JPEG posters, and emits
a sanitized catalog. It does not publish logs, absolute local paths, model files,
training data or meshes.

## Deploy

GitHub Pages serves the root of the main branch. Commit and push changes to
update the site; there is no custom build pipeline or external service.

## Attribution

Design inspired by **Mateo Guaman Castro's SGS website** (https://sgs-rl.github.io/),
whose original design and code are © 2026 Mateo Guaman Castro and licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
This adaptation changes the layout, typography, palette, content and video
interactions. See [ATTRIBUTION.md](ATTRIBUTION.md) and the visible page footer for
full credit, changes, and the Swiss design / neoneo.ch acknowledgment.
