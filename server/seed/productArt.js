// Generates a clean studio "packshot" illustration (SVG) for a product: the right package shape for the
// product type, in the brand's colour, with brand name, product name and pack size on the label.
// Returned as a data: URI so the image works locally and on Vercel without any file storage.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Splits text into at most `maxLines` lines of about `width` characters.
function wrap(text, width, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) { lines.push(line); line = w; } else { line = (line + ' ' + w).trim(); }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

// Each shape returns { body, label: {x, y, w, h} } on a 400x400 canvas; the body uses url(#b) (brand gradient).
const SHAPES = {
  bag: () => ({ body: '<path d="M110 92 L290 92 L304 330 Q304 344 290 344 L110 344 Q96 344 96 330 Z" fill="url(#b)"/><path d="M110 92 L290 92 L286 112 L114 112 Z" fill="#000" opacity=".12"/><rect x="170" y="70" width="60" height="26" rx="6" fill="url(#b)"/>', label: { x: 118, y: 150, w: 164, h: 150 } }),
  pouch: () => ({ body: '<path d="M120 84 L280 84 L276 120 Q300 220 292 330 Q292 344 278 344 L122 344 Q108 344 108 330 Q100 220 124 120 Z" fill="url(#b)"/><path d="M120 84 L280 84 L279 96 L121 96 Z" fill="#fff" opacity=".25"/>', label: { x: 124, y: 150, w: 152, h: 150 } }),
  packet: () => ({ body: '<path d="M96 120 L304 120 L304 300 L96 300 Z" fill="url(#b)"/><path d="M96 120 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 Z M96 300 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10 Z" fill="url(#b)"/>', label: { x: 116, y: 146, w: 168, h: 128 } }),
  box: () => ({ body: '<path d="M112 96 L276 96 L300 80 L300 324 L276 344 L112 344 Z" fill="url(#b)"/><path d="M276 96 L300 80 L300 324 L276 344 Z" fill="#000" opacity=".22"/><path d="M112 96 L136 80 L300 80 L276 96 Z" fill="#fff" opacity=".22"/>', label: { x: 124, y: 140, w: 140, h: 170 } }),
  carton: () => ({ body: '<path d="M126 110 L200 70 L274 110 L274 344 L126 344 Z" fill="url(#b)"/><path d="M126 110 L200 70 L274 110 Z" fill="#fff" opacity=".2"/><rect x="190" y="58" width="20" height="16" rx="3" fill="#fff" opacity=".85"/>', label: { x: 136, y: 150, w: 128, h: 164 } }),
  bottle: () => ({ body: '<rect x="176" y="54" width="48" height="34" rx="8" fill="#2b2b2b" opacity=".85"/><path d="M180 88 L220 88 L222 112 Q270 132 270 178 L270 330 Q270 346 254 346 L146 346 Q130 346 130 330 L130 178 Q130 132 178 112 Z" fill="url(#b)"/>', label: { x: 140, y: 190, w: 120, h: 130 } }),
  spray: () => ({ body: '<rect x="176" y="58" width="48" height="22" rx="6" fill="#fff" opacity=".9"/><rect x="216" y="64" width="22" height="8" rx="3" fill="#fff" opacity=".9"/><path d="M168 80 L232 80 L240 100 L160 100 Z" fill="#cfd8dc"/><rect x="146" y="100" width="108" height="246" rx="22" fill="url(#b)"/>', label: { x: 154, y: 150, w: 92, h: 170 } }),
  jar: () => ({ body: '<rect x="128" y="96" width="144" height="36" rx="10" fill="#2b2b2b" opacity=".85"/><rect x="116" y="128" width="168" height="216" rx="26" fill="url(#b)"/>', label: { x: 128, y: 168, w: 144, h: 140 } }),
  tin: () => ({ body: '<ellipse cx="200" cy="112" rx="88" ry="20" fill="#cfd8dc"/><path d="M112 112 L288 112 L288 326 Q288 346 200 346 Q112 346 112 326 Z" fill="url(#b)"/><ellipse cx="200" cy="112" rx="88" ry="20" fill="#fff" opacity=".35"/>', label: { x: 124, y: 160, w: 152, h: 150 } }),
  tube: () => ({ body: '<path d="M112 120 L288 120 L268 300 L132 300 Z" fill="url(#b)"/><rect x="104" y="108" width="192" height="16" rx="4" fill="url(#b)"/><rect x="176" y="300" width="48" height="40" rx="8" fill="#fff" opacity=".9"/>', label: { x: 128, y: 150, w: 144, h: 120 } }),
  bar: () => ({ body: '<rect x="80" y="140" width="240" height="140" rx="18" fill="url(#b)"/><rect x="80" y="140" width="240" height="22" rx="18" fill="#fff" opacity=".18"/>', label: { x: 98, y: 168, w: 204, h: 96 } }),
  can: () => ({ body: '<rect x="140" y="80" width="120" height="266" rx="18" fill="url(#b)"/><rect x="140" y="80" width="120" height="16" rx="8" fill="#cfd8dc"/>', label: { x: 148, y: 140, w: 104, h: 180 } }),
  container: () => ({ body: '<rect x="98" y="138" width="204" height="30" rx="10" fill="#fff" opacity=".9"/><rect x="104" y="164" width="192" height="180" rx="22" fill="url(#b)" opacity=".92"/><rect x="104" y="164" width="192" height="180" rx="22" fill="#fff" opacity=".18"/>', label: { x: 120, y: 196, w: 160, h: 120 } }),
  cooker: () => ({ body: '<rect x="96" y="170" width="208" height="160" rx="26" fill="#cfd8dc"/><rect x="96" y="170" width="208" height="160" rx="26" fill="url(#b)" opacity=".25"/><rect x="108" y="150" width="184" height="26" rx="10" fill="#90a4ae"/><rect x="186" y="122" width="28" height="30" rx="6" fill="#263238"/><rect x="292" y="152" width="80" height="18" rx="9" fill="#212121"/>', label: { x: 118, y: 200, w: 164, h: 110 } }),
  pan: () => ({ body: '<ellipse cx="180" cy="230" rx="118" ry="96" fill="#263238"/><ellipse cx="180" cy="224" rx="100" ry="80" fill="#37474f"/><rect x="286" y="214" width="96" height="20" rx="10" fill="url(#b)"/>', label: { x: 104, y: 186, w: 152, h: 76 } }),
  book: () => ({ body: '<rect x="112" y="72" width="184" height="272" rx="10" fill="url(#b)"/><rect x="112" y="72" width="20" height="272" rx="6" fill="#000" opacity=".2"/>', label: { x: 142, y: 120, w: 140, h: 190 } }),
  pen: () => ({ body: '<rect x="120" y="96" width="160" height="240" rx="18" fill="url(#b)"/><g opacity=".95"><rect x="150" y="66" width="12" height="70" rx="5" fill="#1565C0"/><rect x="172" y="60" width="12" height="76" rx="5" fill="#C62828"/><rect x="194" y="64" width="12" height="72" rx="5" fill="#2E7D32"/><rect x="216" y="58" width="12" height="78" rx="5" fill="#212121"/><rect x="238" y="66" width="12" height="70" rx="5" fill="#6A1B9A"/></g>', label: { x: 134, y: 160, w: 132, h: 150 } }),
  roll: () => ({ body: '<rect x="80" y="160" width="240" height="120" rx="14" fill="url(#b)"/><ellipse cx="80" cy="220" rx="20" ry="60" fill="#fff" opacity=".7"/><ellipse cx="80" cy="220" rx="8" ry="22" fill="#9e9e9e"/>', label: { x: 116, y: 176, w: 188, h: 88 } }),
  bulb: () => ({ body: '<circle cx="200" cy="170" r="84" fill="#fffde7"/><circle cx="200" cy="170" r="84" fill="url(#b)" opacity=".18"/><rect x="164" y="240" width="72" height="56" rx="10" fill="#cfd8dc"/><rect x="176" y="296" width="48" height="28" rx="8" fill="#90a4ae"/>', label: { x: 140, y: 136, w: 120, h: 70 } }),
  battery: () => ({ body: '<rect x="106" y="110" width="80" height="220" rx="16" fill="url(#b)"/><rect x="214" y="110" width="80" height="220" rx="16" fill="url(#b)"/><rect x="132" y="96" width="28" height="16" rx="4" fill="#bdbdbd"/><rect x="240" y="96" width="28" height="16" rx="4" fill="#bdbdbd"/>', label: { x: 112, y: 170, w: 176, h: 100 } }),
};

const CATEGORY_TINT = {
  'Groceries & Staples': '#F6EEDC', 'Food & Beverages': '#FBEFE6', 'Snacks & Confectionery': '#FCEFE3',
  'Kitchen Essentials': '#ECEFF1', 'Cleaning Supplies': '#E6F2F8', 'Personal Care': '#F3ECF6', 'Home Care': '#EAF4EE',
  Stationery: '#EAF0FA', 'Baby Care': '#FCEEF3', 'Health & Daily Needs': '#EAF4F2',
};

export function productArt({ brand, name, size, pack, color, category }) {
  const shape = (SHAPES[pack] || SHAPES.box)();
  const { x, y, w, h } = shape.label;
  const bg = CATEGORY_TINT[category] || '#F4F1EA';
  const nameLines = wrap(name, Math.max(10, Math.floor(w / 9)), 3);
  // Georgia bold averages ~0.62em per character; keep the brand inside the label with a little padding.
  const brandSize = Math.min(19, Math.floor((w - 12) / (brand.length * 0.62)));
  const cx = x + w / 2;
  const text = [
    `<text x="${cx}" y="${y + 28}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${brandSize}" fill="${shade(color, -0.25)}">${esc(brand)}</text>`,
    `<line x1="${cx - 22}" y1="${y + 38}" x2="${cx + 22}" y2="${y + 38}" stroke="${color}" stroke-width="2" opacity=".6"/>`,
    ...nameLines.map((l, i) => `<text x="${cx}" y="${y + 58 + i * 15}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="12" fill="#2b2b2b">${esc(l)}</text>`),
    `<rect x="${cx - 34}" y="${y + h - 30}" width="68" height="20" rx="10" fill="${color}"/>`,
    `<text x="${cx}" y="${y + h - 16}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="10.5" fill="#fff">${esc(size.length > 12 ? size.slice(0, 12) : size)}</text>`,
  ].join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">`
    + `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(color, 0.12)}"/><stop offset="1" stop-color="${shade(color, -0.14)}"/></linearGradient>`
    + `<radialGradient id="bg" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${bg}"/></radialGradient>`
    + `<linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
    + `<rect width="400" height="400" fill="url(#bg)"/>`
    + `<ellipse cx="200" cy="356" rx="120" ry="14" fill="#000" opacity=".10"/>`
    + shape.body
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#fff" opacity=".94"/>`
    + text
    + `<rect x="70" y="40" width="40" height="320" fill="url(#gl)" transform="rotate(12 200 200)" opacity=".7"/>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default productArt;
