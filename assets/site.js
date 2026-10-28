/* Design inspiration: SGS by Mateo Guaman Castro, https://sgs-rl.github.io/
   CC BY 4.0. New implementation and interactions; see ../ATTRIBUTION.md. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const grasp = $("grasp-video"), critic = $("critic-video"), videos = [grasp, critic];
  const playButton = $("play-pause"), timeline = $("timeline"), status = $("player-status");
  let catalogs, catalog, split = "test", object, clip, generation = 0, wanted = false, starting = false, buffering = false;
  let scrubWasPlaying = false;
  const covers = [$("grasp-cover"), $("critic-cover")];
  const splitName = () => split === "test" ? "Unseen test object" : "Training-set object";
  function showCovers(show) { covers.forEach((cover) => { cover.hidden = !show; }); }
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (t) => Math.floor(Math.max(0, t) / 60) + ":" + pad(Math.floor(Math.max(0, t)) % 60);
  const signed = (n) => (n >= 0 ? "+" : "") + n.toFixed(1);
  function setStatus(text) { status.textContent = text; }
  function ready() { return videos.every((video) => video.readyState >= 2); }
  function duration() { return Number.isFinite(grasp.duration) ? grasp.duration : (clip?.duration || 0); }
  function paintControls() {
    playButton.innerHTML = wanted ? "Ⅱ <span>Pause</span>" : "▶ <span>Play</span>";
    playButton.setAttribute("aria-label", wanted ? "Pause both videos" : "Play both videos");
  }
  function paintTime() {
    const t = grasp.currentTime || 0, d = duration();
    if (document.activeElement !== timeline) timeline.value = String(t);
    $("time-display").textContent = clock(t) + " / " + clock(d);
    timeline.setAttribute("aria-valuetext", t.toFixed(1) + " of " + d.toFixed(1) + " seconds");
  }
  function pause(message) {
    wanted = false; buffering = false;
    videos.forEach((v) => v.pause());
    paintControls();
    if (message) setStatus(message);
  }
  async function start() {
    if (starting || !wanted) return;
    if (!ready()) {
      setStatus("Buffering paired videos…");
      videos.forEach((v) => { if (v.preload !== "auto") { v.preload = "auto"; v.load(); } });
      return;
    }
    const token = generation;
    starting = true; buffering = false;
    if (Math.abs(critic.currentTime - grasp.currentTime) > 0.04) critic.currentTime = grasp.currentTime;
    try {
      await Promise.all(videos.map((v) => v.play()));
      if (token !== generation) return;
      if (!wanted) videos.forEach((v) => v.pause());
      else { showCovers(false); setStatus("Playing in sync · Student rollout + teacher critic"); }
    } catch (error) {
      if (token === generation && error.name !== "AbortError") {
        pause("Playback could not start. Press Play to try again, or open the MP4 links below.");
      }
    } finally {
      if (token === generation) { starting = false; paintControls(); }
    }
  }
  function toggle() {
    if (wanted) { pause("Paused · Both videos share the same timeline"); return; }
    if (grasp.ended || grasp.currentTime >= duration() - 0.025) videos.forEach((v) => { v.currentTime = 0; });
    wanted = true; paintControls(); start();
  }
  playButton.addEventListener("click", toggle);
  $("restart").addEventListener("click", () => {
    if (!clip) return;
    pause();
    videos.forEach((v) => { v.currentTime = 0; });
    timeline.value = "0"; paintTime();
    wanted = true; paintControls(); start();
  });
  $("playback-speed").addEventListener("change", (event) => {
    videos.forEach((v) => { v.playbackRate = Number(event.target.value); });
  });
  timeline.addEventListener("pointerdown", () => { scrubWasPlaying = wanted; pause(); });
  timeline.addEventListener("keydown", () => { if (wanted) scrubWasPlaying = true; pause(); });
  timeline.addEventListener("input", () => {
    if (wanted) { scrubWasPlaying = true; pause(); }
    showCovers(false);
    const t = Number(timeline.value);
    videos.forEach((v) => { if (Number.isFinite(v.duration)) v.currentTime = Math.min(t, v.duration); });
    paintTime(); setStatus("Scrubbing both videos · " + t.toFixed(1) + " s");
  });
  timeline.addEventListener("change", () => {
    if (scrubWasPlaying) { scrubWasPlaying = false; wanted = true; paintControls(); start(); }
    else setStatus("Paused · Both videos share the same timeline");
  });
  $("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("paired-player").requestFullscreen) await $("paired-player").requestFullscreen();
      else setStatus("Fullscreen is unavailable in this browser. Open either MP4 below for a larger view.");
    } catch (_) { setStatus("Fullscreen is unavailable. Open either MP4 below for a larger view."); }
  });
  $("share-clip").addEventListener("click", async () => {
    const url = new URL(location.href); url.hash = "explore";
    try {
      await navigator.clipboard.writeText(url.href);
      $("share-clip").textContent = "Link copied ✓";
      setTimeout(() => { $("share-clip").textContent = "Copy clip link ↗"; }, 2200);
    } catch (_) { window.prompt("Copy this clip link:", url.href); }
  });
  videos.forEach((video) => {
    video.addEventListener("loadedmetadata", () => {
      if (videos.every((v) => v.readyState >= 1)) {
        playButton.disabled = false; timeline.disabled = false;
        timeline.max = String(duration()); paintTime();
      }
    });
    video.addEventListener("loadeddata", () => {
      if (ready() && !wanted) setStatus("Ready · Press Play to watch both videos");
      if (wanted) start();
    });
    video.addEventListener("canplay", () => {
      if (wanted && ready()) { buffering = false; start(); }
    });
    video.addEventListener("waiting", () => {
      if (!wanted || video.seeking) return;
      buffering = true;
      videos.forEach((v) => v.pause());
      starting = false;
      setStatus("Buffering · Keeping both videos synchronized");
    });
    video.addEventListener("seeked", () => {
      if (wanted && !videos.some((v) => v.seeking)) start();
    });
    video.addEventListener("error", () => {
      if (video.error && video.currentSrc) pause("This video could not load. Retry Play or use the MP4 links below.");
    });
  });
  grasp.addEventListener("timeupdate", paintTime);
  grasp.addEventListener("ended", () => {
    pause("Rollout complete · Recorded outcome: " + (clip?.outcome || "Unknown"));
    critic.currentTime = Math.min(grasp.currentTime, critic.duration || grasp.currentTime);
    timeline.value = String(duration()); paintTime();
  });
  function synchronize() {
    if (wanted && !buffering && !starting && videos.every((v) => !v.paused && !v.seeking && v.readyState >= 2)) {
      if (Math.abs(critic.currentTime - grasp.currentTime) > 0.09) critic.currentTime = grasp.currentTime;
      paintTime();
    }
    requestAnimationFrame(synchronize);
  }
  requestAnimationFrame(synchronize);
  window.addEventListener("realworld-open", () => pause("Paused while a real-world recording is open"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && wanted) pause("Paused while the page is in the background");
  });
  function renderClips() {
    $("clip-strip").replaceChildren(...object.clips.map((item) => {
      const button = document.createElement("button");
      button.className = "clip-button"; button.type = "button";
      button.setAttribute("aria-pressed", String(item.id === clip.id));
      button.setAttribute("aria-label", object.name + " rollout " + item.number + ", pose " + item.pose + ", " + item.outcome);
      button.title = item.outcome + " · " + splitName();
      const image = document.createElement("img");
      image.src = item.thumbnail; image.alt = ""; image.loading = "lazy"; image.width = 480; image.height = 270;
      const label = document.createElement("span");
      const name = document.createElement("span"); name.textContent = "Take " + pad(item.number);
      const pose = document.createElement("span"); pose.className = "clip-pose"; pose.textContent = "POSE " + pad(item.pose);
      label.append(name, pose); button.append(image, label);
      button.addEventListener("click", () => select(object.id, item.id));
      return button;
    }));
    $("clip-count-label").textContent = object.clips.length + " ROLLOUTS";
  }
  function select(objectId, clipId, updateUrl = true) {
    pause(); generation += 1; starting = false; scrubWasPlaying = false;
    object = catalog.objects.find((o) => o.id === objectId) || catalog.objects[0];
    clip = object.clips.find((c) => c.id === clipId) || object.clips[0];
    $("episode-title").textContent = object.name;
    $("episode-index").textContent = pad(clip.number) + " / " + pad(object.clips.length);
    $("episode-meta").textContent = "POSE " + pad(clip.pose) + "  /  X " + signed(clip.xCm) + " cm  /  Y " + signed(clip.yCm) + " cm  /  " + clip.simulationSeconds.toFixed(1) + " s  /  " + clip.outcome.toUpperCase();
    $("download-grasp").href = clip.grasp; $("download-critic").href = clip.critic;
    $("download-grasp").download = object.id + "-pose-" + clip.pose + "-grasp.mp4";
    $("download-critic").download = object.id + "-pose-" + clip.pose + "-critic.mp4";
    playButton.disabled = true; timeline.disabled = true; timeline.value = "0";
    setStatus("Loading paired videos…");
    showCovers(true);
    for (const [i, video] of videos.entries()) {
      const poster = i === 0 ? clip.poster : clip.criticPoster;
      covers[i].src = poster;
      video.poster = poster;
      video.src = i === 0 ? clip.grasp : clip.critic;
      video.preload = "auto";
      video.playbackRate = Number($("playback-speed").value);
      video.load();
    }
    $("object-tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.object === object.id)));
    renderClips(); paintTime();
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("split", split);
      url.searchParams.set("object", object.id); url.searchParams.set("pose", String(clip.pose));
      url.searchParams.set("clip", clip.id);
      history.replaceState(null, "", url);
    }
  }
  function setSplit(nextSplit, objectId, clipId, updateUrl = true) {
    split = nextSplit === "train" ? "train" : "test";
    catalog = catalogs[split];
    $("split-tabs").querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.split === split));
    });
    $("explore-title").textContent = split === "test" ? "Grasping unseen objects." : "Grasping training objects.";
    $("split-label").textContent = split === "test" ? "UNSEEN TEST OBJECTS" : "SEEN TRAINING OBJECTS";
    $("split-description").innerHTML = split === "test"
      ? "These test objects were <strong>never seen during training</strong>. Browse <strong>" + catalog.categoryCount + " categories</strong> and " + catalog.clipCount + " rollouts."
      : "Examples from the <strong>418-object training set</strong>, organized into <strong>" + catalog.categoryCount + " categories</strong> with " + catalog.clipCount + " rollouts.";
    $("object-tabs").replaceChildren(...catalog.objects.map((obj) => {
      const tab = document.createElement("button"); tab.type = "button"; tab.dataset.object = obj.id;
      const title = document.createElement("span"); title.textContent = obj.name;
      const count = document.createElement("small"); count.textContent = pad(obj.clips.length);
      tab.append(title, count); tab.addEventListener("click", () => select(obj.id));
      return tab;
    }));
    select(objectId, clipId, updateUrl);
  }
  function renderCollection(key) {
    const data = catalogs[key], grid = $(key === "test" ? "object-grid" : "train-object-grid");
    const label = key === "test" ? "Unseen test objects" : "Training-set objects";
    for (const [index, obj] of data.objects.entries()) {
      const card = document.createElement("button"); card.className = "object-card"; card.type = "button";
      card.dataset.split = key; card.dataset.category = obj.id;
      card.setAttribute("aria-label", "Watch " + obj.name + ": " + obj.clips.length + " rollouts · " + label);
      const imageBox = document.createElement("div");
      const image = document.createElement("img"); image.src = obj.clips[0].thumbnail; image.loading = "lazy";
      image.alt = obj.name + " · " + label + " · Final frame in simulation"; image.width = 480; image.height = 270;
      imageBox.append(image);
      const meta = document.createElement("span"), name = document.createElement("strong"), note = document.createElement("small");
      name.textContent = obj.name; note.className = "mono"; note.textContent = pad(index+1) + " / " + obj.clips.length + " TAKES ↗";
      meta.append(name, note); card.append(imageBox, meta);
      card.addEventListener("click", () => {
        setSplit(key, obj.id);
        $("explore").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
      });
      grid.append(card);
    }
    const total = document.createElement("div"); total.className = "collection-total";
    total.innerHTML = "<span class='mono'>" + (key === "test" ? "TEST SET" : "TRAINING SET") + "</span><strong>" + data.clipCount + "</strong><p>Starting states.<br>Paired perspectives.</p>";
    grid.append(total);
  }
  async function initialize() {
    try {
      const data = await Promise.all(["media/catalog.json", "media/train/catalog.json"].map(async (path) => {
        const response = await fetch(path, {cache: "no-cache"});
        if (!response.ok) throw new Error("Catalog unavailable: " + path);
        return response.json();
      }));
      catalogs = {test: data[0], train: data[1]};
      document.querySelectorAll("[data-clip-count]").forEach((el) => { el.textContent = data[0].clipCount + data[1].clipCount; });
      for (const key of ["test", "train"]) {
        for (const [suffix, value] of [["clip-count", catalogs[key].clipCount], ["category-count", catalogs[key].categoryCount]]) {
          document.querySelectorAll("[data-" + key + "-" + suffix + "]").forEach((el) => { el.textContent = value; });
        }
        renderCollection(key);
      }
      $("split-tabs").querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => setSplit(button.dataset.split));
      });
      const params = new URLSearchParams(location.search);
      const key = params.get("split") === "train" ? "train" : "test";
      // Preserve older shared links to shoe examples, now in a single category.
      const legacyShoe = key === "test" && /^shoe-(16|17|45)$/.test(params.get("object") || "");
      const initial = catalogs[key].objects.find((o) => o.id === (legacyShoe ? "shoes" : params.get("object"))) || catalogs[key].objects[0];
      const initialClip = initial.clips.find((c) => c.id === params.get("clip"))
        || initial.clips.find((c) => String(c.pose) === params.get("pose") && (!legacyShoe || c.objectIndex === Number(params.get("object").slice(5))))
        || initial.clips[0];
      setSplit(key, initial.id, initialClip.id, false);
    } catch (error) {
      setStatus("The video catalog could not load. Please refresh the page.");
      console.error(error);
    }
  }
  initialize();
})();
