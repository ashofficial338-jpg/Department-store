// Turns a rendered recharts chart into a PNG data URL (white background, title on top) so the
// Excel export can embed exactly the chart the user is looking at.
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-size', 'font-family', 'font-weight'];

function inlineStyles(source, target) {
  const s = getComputedStyle(source);
  STYLE_PROPS.forEach((p) => {
    const v = s.getPropertyValue(p);
    if (v) target.style.setProperty(p, v);
  });
  // Axis labels use theme colours; keep them readable on the white PNG background.
  if (source.tagName === 'text' || source.tagName === 'tspan') target.style.setProperty('fill', '#5B5F6B');
  const sc = source.children; const tc = target.children;
  for (let i = 0; i < sc.length; i++) if (tc[i]) inlineStyles(sc[i], tc[i]);
}

export async function captureChart(container, title, legend = []) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) return null;
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return null;
  const clone = svg.cloneNode(true);
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = 2; const head = 40; const foot = legend.length ? 28 : 8;
    const canvas = document.createElement('canvas');
    canvas.width = (width + 32) * scale; canvas.height = (height + head + foot) * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width + 32, height + head + foot);
    ctx.fillStyle = '#1E2029'; ctx.font = '600 15px system-ui, sans-serif'; ctx.fillText(title, 16, 26);
    ctx.drawImage(img, 16, head, width, height);
    let x = 16;
    legend.forEach((l) => {
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(x + 5, height + head + 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1E2029'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText(l.label, x + 14, height + head + 18);
      x += ctx.measureText(l.label).width + 34;
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
