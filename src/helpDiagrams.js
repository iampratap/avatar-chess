/** Paint the mini setup board tiles once. */
export function initHelpDiagrams() {
  const g = document.querySelector('#help-tiles');
  if (!g || g.childElementCount) return;
  const size = 18;
  const origin = 28;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(origin + c * size));
      rect.setAttribute('y', String(origin + r * size));
      rect.setAttribute('width', String(size));
      rect.setAttribute('height', String(size));
      rect.setAttribute('fill', (r + c) % 2 ? '#5c4a38' : '#d9cbb0');
      g.appendChild(rect);
    }
  }
}
