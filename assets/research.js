/* Resource destinations intentionally stay empty until they are ready to publish. */
(() => {
  const resources = document.querySelectorAll('[data-resource]');
  for (const link of resources) {
    link.addEventListener('click', event => {
      if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
    });
    link.addEventListener('keydown', event => {
      if (link.getAttribute('aria-disabled') === 'true' && ['Enter', ' '].includes(event.key)) event.preventDefault();
    });
  }
  fetch('assets/resources.json?v=20261119').then(response => {
    if (!response.ok) throw new Error('Resources unavailable');
    return response.json();
  }).then(urls => {
    for (const link of resources) {
      const value = urls[link.dataset.resource];
      if (typeof value !== 'string' || !value.trim()) continue;
      let url;
      try { url = new URL(value, window.location.href); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.removeAttribute('aria-disabled');
      link.removeAttribute('aria-label');
      link.querySelector('small').textContent = 'Open resource';
    }
  }).catch(() => { /* Unpublished resources remain visibly unavailable. */ });

  const film = document.getElementById('overview-video');
  const grasp = document.getElementById('grasp-video');
  const critic = document.getElementById('critic-video');
  const realworld = document.getElementById('realworld-video');
  film.addEventListener('play', () => {
    window.dispatchEvent(new Event('overview-play'));
    if (realworld) realworld.pause();
  });
  window.addEventListener('realworld-open', () => film.pause());
  for (const video of [grasp, critic, realworld]) {
    if (video) video.addEventListener('play', () => film.pause());
  }
})();
