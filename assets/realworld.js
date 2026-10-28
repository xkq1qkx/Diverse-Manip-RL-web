/* Real-world gallery. Original visual inspiration: Mateo Guaman Castro / SGS,
   https://sgs-rl.github.io/ (CC BY 4.0). See ../ATTRIBUTION.md. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const dialog = $("realworld-dialog"), player = $("realworld-video");
  if (!dialog || !player) return;
  const speedControl = $("realworld-speed");
  let playbackSpeed = 2;
  let catalog, activeGroup = "all", selected, previousFocus, generation = 0;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (seconds) => Math.floor(seconds / 60) + ":" + pad(Math.floor(seconds) % 60);
  const pool = () => catalog.clips.filter((clip) => activeGroup === "all" || clip.group === activeGroup);
  const status = (message) => { $("realworld-video-status").textContent = message; };

  function card(clip) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "realworld-card"; button.dataset.clip = clip.id;
    button.setAttribute("aria-label", "Play " + clip.groupName + ", take " + clip.number + ", " + clock(clip.duration));
    const cover = document.createElement("span"); cover.className = "rw-cover";
    const image = document.createElement("img");
    image.src = clip.thumbnail; image.alt = "Final frame of " + clip.groupName + ", take " + clip.number;
    image.width = clip.width; image.height = clip.height; image.loading = "lazy"; image.decoding = "async";
    const play = document.createElement("span"); play.className = "rw-card-play"; play.textContent = "▶"; play.setAttribute("aria-hidden", "true");
    const time = document.createElement("span"); time.className = "rw-card-time"; time.textContent = clock(clip.duration);
    cover.append(image, play, time);
    const label = document.createElement("span"); label.className = "rw-card-caption";
    const title = document.createElement("strong"); title.textContent = clip.groupName;
    const number = document.createElement("small"); number.textContent = "TAKE " + pad(clip.number) + " ↗";
    label.append(title, number); button.append(cover, label);
    button.addEventListener("click", () => open(clip.id, true, button));
    return button;
  }
  function filter(group) {
    activeGroup = group;
    const clips = pool();
    $("realworld-grid").replaceChildren(...clips.map(card));
    $("realworld-filters").querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.group === group));
    });
    const name = catalog.groups.find((item) => item.id === group)?.name || "All objects";
    $("realworld-group-label").textContent = name.toUpperCase();
    $("realworld-count").textContent = clips.length + " RECORDINGS";
    $("realworld-status").textContent = "Default playback is 2×. Select 1× in the player for original speed. All videos are silent.";
  }
  function open(id, autoplay = false, trigger = null) {
    selected = catalog.clips.find((clip) => clip.id === id);
    if (!selected) return;
    if (!dialog.open) previousFocus = trigger || document.activeElement;
    generation += 1;
    const token = generation, clips = pool(), index = clips.findIndex((clip) => clip.id === id);
    window.dispatchEvent(new CustomEvent("realworld-open"));
    player.pause(); player.poster = selected.poster; player.src = selected.video;
    player.muted = true; player.defaultPlaybackRate = playbackSpeed; player.preload = "metadata";
    player.load(); player.playbackRate = playbackSpeed; speedControl.value = String(playbackSpeed);
    $("realworld-dialog-index").textContent = pad(index + 1) + " / " + pad(clips.length);
    $("realworld-dialog-title").textContent = selected.groupName;
    $("realworld-dialog-meta").textContent = "TAKE " + pad(selected.number) + " · " + clock(selected.duration) + " · SILENT";
    $("realworld-previous").disabled = index <= 0;
    $("realworld-next").disabled = index < 0 || index >= clips.length - 1;
    $("realworld-download").href = selected.video;
    $("realworld-download").download = selected.id + "-realworld.mp4";
    $("realworld-share").textContent = "Copy clip link ↗";
    status("Loading recording…");
    if (!dialog.open) dialog.showModal();
    if (autoplay) {
      player.play().catch((error) => {
        if (token === generation && error.name !== "AbortError") status("Ready · Press Play to watch the recording.");
      });
    }
  }
  speedControl.addEventListener("change", () => {
    playbackSpeed = Number(speedControl.value);
    player.defaultPlaybackRate = playbackSpeed;
    player.playbackRate = playbackSpeed;
  });
  player.addEventListener("ratechange", () => {
    if (!dialog.open || !player.hasAttribute("src")) return;
    if ([1, 2].includes(player.playbackRate)) {
      playbackSpeed = player.playbackRate;
      speedControl.value = String(playbackSpeed);
    }
    if (!player.ended) status((player.paused ? "Paused" : "Playing") + " · " + player.playbackRate + "× · Silent recording");
  });
  function adjacent(offset) {
    const clips = pool(), index = clips.findIndex((clip) => clip.id === selected?.id);
    if (clips[index + offset]) open(clips[index + offset].id, true);
  }
  function close() { player.pause(); dialog.close(); }
  $("realworld-close").addEventListener("click", close);
  dialog.addEventListener("cancel", () => player.pause());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }
  });
  dialog.addEventListener("close", () => {
    // A queued close event may arrive after another recording has already opened.
    if (dialog.open) return;
    generation += 1; player.pause(); player.removeAttribute("src"); player.load();
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    const url = new URL(location.href);
    if (url.searchParams.has("realworld")) {
      url.searchParams.delete("realworld");
      history.replaceState(null, "", url);
    }
  });
  $("realworld-previous").addEventListener("click", () => adjacent(-1));
  $("realworld-next").addEventListener("click", () => adjacent(1));
  $("realworld-share").addEventListener("click", async () => {
    if (!selected) return;
    const url = new URL(location.href);
    url.searchParams.delete("object"); url.searchParams.delete("pose");
    url.searchParams.set("realworld", selected.id); url.hash = "realworld";
    try {
      await navigator.clipboard.writeText(url.href);
      $("realworld-share").textContent = "Link copied ✓";
    } catch (_) { window.prompt("Copy this recording link:", url.href); }
  });
  player.addEventListener("loadedmetadata", () => {
    if (player.paused) status("Ready · Press Play to watch the recording.");
  });
  player.addEventListener("playing", () => status("Playing · " + player.playbackRate + "× · Silent recording"));
  player.addEventListener("pause", () => {
    if (dialog.open && player.paused && !player.ended && player.hasAttribute("src")) status("Paused · " + player.playbackRate + "× · Silent recording");
  });
  player.addEventListener("waiting", () => { if (dialog.open) status("Buffering recording…"); });
  player.addEventListener("ended", () => status("Recording complete"));
  player.addEventListener("error", () => {
    if (dialog.open && player.hasAttribute("src")) status("The recording could not load. Try the MP4 download link.");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) player.pause(); });

  async function initialize() {
    try {
      const response = await fetch("media/realworld/catalog.json");
      if (!response.ok) throw new Error("Real-world catalog unavailable");
      catalog = await response.json();
      document.querySelectorAll("[data-realworld-count]").forEach((element) => { element.textContent = catalog.clipCount; });
      const groups = [{id: "all", name: "All", count: catalog.clipCount}, ...catalog.groups];
      for (const group of groups) {
        const button = document.createElement("button"); button.type = "button"; button.dataset.group = group.id;
        const name = document.createElement("span"); name.textContent = group.name;
        const count = document.createElement("small"); count.textContent = pad(group.count);
        button.append(name, count); button.addEventListener("click", () => filter(group.id));
        $("realworld-filters").append(button);
      }
      filter("all");
      const requested = new URLSearchParams(location.search).get("realworld");
      const clip = catalog.clips.find((item) => item.id === requested);
      if (clip) { filter(clip.group); open(clip.id); }
    } catch (error) {
      $("realworld-status").textContent = "The real-world video catalog could not load. Please refresh the page.";
      console.error(error);
    }
  }
  initialize();
})();
