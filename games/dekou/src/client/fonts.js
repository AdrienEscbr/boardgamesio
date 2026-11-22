// The staff-table faces (stencil for orders, typewriter for figures), loaded once on demand.
const HREF = 'https://fonts.googleapis.com/css2?family=Black+Ops+One&family=IBM+Plex+Mono:wght@500;600&display=swap';
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${HREF}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HREF;
  document.head.appendChild(link);
}
