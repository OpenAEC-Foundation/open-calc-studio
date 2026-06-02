import { readFileSync } from 'fs';
import { createServer } from 'http';

// 50 euro logo variants
const variants = [];

// Base variants with different backgrounds
const backgrounds = [
  { id: 'bg-blue', grad: 'linear-gradient(135deg,#3b82f6,#1e40af)', name: 'Blue' },
  { id: 'bg-green', grad: 'linear-gradient(135deg,#2d8a4e,#1a6b38)', name: 'Green' },
  { id: 'bg-dark', grad: 'linear-gradient(135deg,#1e293b,#0f172a)', name: 'Dark Navy' },
  { id: 'bg-amber', grad: 'linear-gradient(135deg,#f59e0b,#d97706)', name: 'Amber' },
  { id: 'bg-purple', grad: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', name: 'Purple' },
];

// ── 50 variants: different € symbol styles ──

// 1-5: Font-based, different weights/fonts
variants.push({ title: '1. Arial Black text',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="380" font-family="Arial Black" font-weight="900">€</text>`,
  bg: 0 });
variants.push({ title: '2. Segoe UI Bold',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="360" font-family="Segoe UI" font-weight="900">€</text>`,
  bg: 0 });
variants.push({ title: '3. Helvetica italic',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="380" font-family="Helvetica" font-style="italic" font-weight="900">€</text>`,
  bg: 0 });
variants.push({ title: '4. Serif bold',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="380" font-family="Times,serif" font-weight="900">€</text>`,
  bg: 0 });
variants.push({ title: '5. Condensed bold',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="420" font-family="Arial Narrow" font-weight="900">€</text>`,
  bg: 0 });

// 6-15: C-arc + bars — different thicknesses
for (let i = 0; i < 10; i++) {
  const arcW = 35 + i * 4;
  const barW = 35 + i * 4;
  variants.push({
    title: `${6+i}. Matched strokes ${arcW}px`,
    svg: `<g fill="none" stroke="white" stroke-linecap="round">
      <path d="M 340 135 A 130 145 0 1 0 340 377" stroke-width="${arcW}"/>
      <line x1="110" y1="218" x2="270" y2="218" stroke-width="${barW}" stroke-linecap="butt"/>
      <line x1="110" y1="302" x2="260" y2="302" stroke-width="${barW}" stroke-linecap="butt"/>
    </g>`,
    bg: 0 });
}

// 16-20: Different arc vs bar ratios
const ratios = [[40,60],[50,40],[48,48],[55,35],[30,55]];
ratios.forEach(([a,b], i) => {
  variants.push({
    title: `${16+i}. Arc ${a} / Bars ${b}`,
    svg: `<g fill="none" stroke="white" stroke-linecap="round">
      <path d="M 340 135 A 130 145 0 1 0 340 377" stroke-width="${a}"/>
      <line x1="110" y1="218" x2="270" y2="218" stroke-width="${b}" stroke-linecap="butt"/>
      <line x1="110" y1="302" x2="260" y2="302" stroke-width="${b}" stroke-linecap="butt"/>
    </g>`,
    bg: 0 });
});

// 21-25: Filled shape (like real font glyph)
variants.push({ title: '21. Filled glyph thick',
  svg: `<path fill="white" d="M 300 120 Q 180 120 150 200 L 110 200 L 110 238 L 145 238 Q 143 250 143 256 Q 143 262 145 274 L 110 274 L 110 312 L 150 312 Q 180 392 300 392 Q 330 392 360 380 L 340 340 Q 320 354 300 354 Q 230 354 205 312 L 280 312 L 280 274 L 195 274 Q 193 262 193 256 Q 193 250 195 238 L 280 238 L 280 200 L 205 200 Q 230 158 300 158 Q 320 158 340 172 L 360 132 Q 330 120 300 120 Z"/>`,
  bg: 0 });
variants.push({ title: '22. Filled — rounded', svg: variants[20].svg.replace('stroke-linejoin','stroke-linejoin="round"'), bg: 0 });
variants.push({ title: '23. Outlined glyph',
  svg: `<path fill="none" stroke="white" stroke-width="14" stroke-linejoin="round" d="M 300 120 Q 180 120 150 200 L 110 200 L 110 238 L 145 238 Q 143 250 143 256 Q 143 262 145 274 L 110 274 L 110 312 L 150 312 Q 180 392 300 392 Q 330 392 360 380 L 340 340 Q 320 354 300 354 Q 230 354 205 312 L 280 312 L 280 274 L 195 274 Q 193 262 193 256 Q 193 250 195 238 L 280 238 L 280 200 L 205 200 Q 230 158 300 158 Q 320 158 340 172 L 360 132 Q 330 120 300 120 Z"/>`,
  bg: 0 });
variants.push({ title: '24. Double-outlined',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" stroke="white" stroke-width="8" fill="none" font-size="380" font-family="Arial Black" font-weight="900">€</text>`,
  bg: 0 });
variants.push({ title: '25. With shadow',
  svg: `<text x="260" y="260" text-anchor="middle" dominant-baseline="central" fill="rgba(0,0,0,0.3)" font-size="380" font-family="Arial Black">€</text>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="380" font-family="Arial Black">€</text>`,
  bg: 0 });

// 26-35: Different bar lengths / positions
const barVariants = [
  { a: 38, bt: 42, bb: 42, x1: 110, x2t: 260, x2b: 250, y1: 215, y2: 305 },
  { a: 38, bt: 38, bb: 38, x1: 130, x2t: 290, x2b: 280, y1: 215, y2: 305 },
  { a: 38, bt: 48, bb: 48, x1: 100, x2t: 270, x2b: 260, y1: 215, y2: 305 },
  { a: 42, bt: 38, bb: 38, x1: 140, x2t: 290, x2b: 280, y1: 215, y2: 305 },
  { a: 45, bt: 35, bb: 35, x1: 130, x2t: 280, x2b: 270, y1: 210, y2: 300 },
  { a: 40, bt: 40, bb: 40, x1: 120, x2t: 280, x2b: 270, y1: 220, y2: 300 },
  { a: 48, bt: 34, bb: 34, x1: 140, x2t: 280, x2b: 270, y1: 215, y2: 305 },
  { a: 42, bt: 42, bb: 42, x1: 140, x2t: 300, x2b: 290, y1: 215, y2: 305 },
  { a: 40, bt: 44, bb: 40, x1: 130, x2t: 270, x2b: 260, y1: 215, y2: 305 },
  { a: 44, bt: 44, bb: 44, x1: 125, x2t: 285, x2b: 275, y1: 215, y2: 305 },
];
barVariants.forEach((v, i) => {
  variants.push({ title: `${26+i}. Tuned bars v${i+1}`,
    svg: `<g fill="none" stroke="white" stroke-linecap="round">
      <path d="M 340 135 A 130 145 0 1 0 340 377" stroke-width="${v.a}"/>
      <line x1="${v.x1}" y1="${v.y1}" x2="${v.x2t}" y2="${v.y1}" stroke-width="${v.bt}" stroke-linecap="butt"/>
      <line x1="${v.x1}" y1="${v.y2}" x2="${v.x2b}" y2="${v.y2}" stroke-width="${v.bb}" stroke-linecap="butt"/>
    </g>`,
    bg: 0 });
});

// 36-40: Solid style, classic Euro
variants.push({ title: '36. Classic filled',
  svg: `<path fill="white" d="M 280 120 C 180 120 130 180 120 230 L 80 230 L 80 260 L 116 260 C 115 270 115 280 116 290 L 80 290 L 80 320 L 125 320 C 140 380 200 400 280 400 C 320 400 350 390 380 370 L 360 330 C 340 345 315 355 280 355 C 235 355 200 340 185 320 L 240 320 L 240 290 L 175 290 C 173 280 173 270 175 260 L 240 260 L 240 230 L 188 230 C 205 200 235 165 280 165 C 315 165 340 175 360 190 L 380 150 C 350 130 320 120 280 120 Z"/>`,
  bg: 0 });
variants.push({ title: '37. Classic filled — smaller',
  svg: variants[35].svg.replace(/M 280 120/,'M 280 140').replace(/C 180 120/,'C 180 140'),
  bg: 0 });
variants.push({ title: '38. Heavy slab',
  svg: `<rect x="110" y="195" width="170" height="46" fill="white"/>
  <rect x="110" y="285" width="160" height="46" fill="white"/>
  <path d="M 340 140 A 125 140 0 1 0 340 372" fill="none" stroke="white" stroke-width="52" stroke-linecap="round"/>`,
  bg: 0 });
variants.push({ title: '39. Slab + thin arc',
  svg: `<rect x="110" y="200" width="170" height="38" fill="white"/>
  <rect x="110" y="288" width="160" height="38" fill="white"/>
  <path d="M 340 140 A 125 140 0 1 0 340 372" fill="none" stroke="white" stroke-width="38" stroke-linecap="round"/>`,
  bg: 0 });
variants.push({ title: '40. Compact',
  svg: `<rect x="130" y="205" width="150" height="40" fill="white"/>
  <rect x="130" y="275" width="140" height="40" fill="white"/>
  <path d="M 325 150 A 110 120 0 1 0 325 360" fill="none" stroke="white" stroke-width="42" stroke-linecap="round"/>`,
  bg: 0 });

// 41-45: different backgrounds with same base design
const baseDesign = `<g fill="none" stroke="white" stroke-linecap="round">
  <path d="M 340 135 A 125 140 0 1 0 340 372" stroke-width="46"/>
  <line x1="120" y1="215" x2="270" y2="215" stroke-width="42" stroke-linecap="butt"/>
  <line x1="120" y1="298" x2="260" y2="298" stroke-width="42" stroke-linecap="butt"/>
</g>`;
variants.push({ title: '41. Blue bg', svg: baseDesign, bg: 0 });
variants.push({ title: '42. Green bg', svg: baseDesign, bg: 1 });
variants.push({ title: '43. Dark bg', svg: baseDesign, bg: 2 });
variants.push({ title: '44. Amber bg', svg: baseDesign, bg: 3 });
variants.push({ title: '45. Purple bg', svg: baseDesign, bg: 4 });

// 46-50: Special styles
variants.push({ title: '46. 3D / bevel',
  svg: `<g>
    <text x="260" y="260" text-anchor="middle" dominant-baseline="central" fill="rgba(0,0,0,0.4)" font-size="380" font-family="Arial Black">€</text>
    <text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" font-size="380" font-family="Arial Black">€</text>
    <text x="252" y="252" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.4)" font-size="380" font-family="Arial Black">€</text>
  </g>`,
  bg: 0 });
variants.push({ title: '47. Metallic gradient',
  svg: `<defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#d1d5db"/><stop offset="100%" stop-color="#9ca3af"/></linearGradient></defs>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="url(#mg)" font-size="380" font-family="Arial Black">€</text>`,
  bg: 2 });
variants.push({ title: '48. Outline + fill',
  svg: `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" fill="white" stroke="rgba(0,0,0,0.3)" stroke-width="4" font-size="380" font-family="Arial Black">€</text>`,
  bg: 0 });
variants.push({ title: '49. Minimalist thin',
  svg: `<g fill="none" stroke="white" stroke-width="22">
    <path d="M 340 135 A 125 140 0 1 0 340 372" stroke-linecap="round"/>
    <line x1="120" y1="215" x2="270" y2="215" stroke-linecap="butt"/>
    <line x1="120" y1="298" x2="260" y2="298" stroke-linecap="butt"/>
  </g>`,
  bg: 0 });
variants.push({ title: '50. Ultra bold',
  svg: `<g fill="none" stroke="white" stroke-linecap="round">
    <path d="M 340 135 A 125 140 0 1 0 340 372" stroke-width="64"/>
    <line x1="110" y1="215" x2="280" y2="215" stroke-width="60" stroke-linecap="butt"/>
    <line x1="110" y1="298" x2="270" y2="298" stroke-width="60" stroke-linecap="butt"/>
  </g>`,
  bg: 0 });

const makeSvg = (v) => {
  const bg = backgrounds[v.bg];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="180" height="180">
    <defs>
      <linearGradient id="grad-${v.title.replace(/[^a-z0-9]/gi,'')}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg.grad.match(/#[a-f0-9]+/gi)[0]}"/>
        <stop offset="100%" stop-color="${bg.grad.match(/#[a-f0-9]+/gi)[1]}"/>
      </linearGradient>
    </defs>
    <rect x="16" y="16" width="480" height="480" rx="96" fill="url(#grad-${v.title.replace(/[^a-z0-9]/gi,'')})"/>
    ${v.svg}
  </svg>`;
};

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Euro Logo Varianten — 50</title>
<style>
  body{font-family:system-ui;background:#111;color:#eee;padding:20px;margin:0}
  h1{margin:0 0 20px 0}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
  .item{background:#1e1e2e;padding:10px;border-radius:8px;text-align:center;cursor:pointer;transition:transform 0.15s;position:relative}
  .item:hover{transform:scale(1.05);outline:2px solid #3b82f6}
  .item svg{display:block;margin:0 auto;border-radius:8px}
  .label{font-size:11px;color:#aaa;margin-top:6px}
  .num{position:absolute;top:4px;left:6px;background:#3b82f6;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,0.4)}
  .selected{outline:3px solid #22c55e}
  #info{padding:12px;background:#1e1e2e;border-radius:8px;margin-bottom:16px;font-size:13px}
</style></head><body>
<h1>🎨 50 Euro Logo Varianten</h1>
<div id="info">Klik op een variant om die te kiezen. Het gekozen nummer wordt groen gemarkeerd. Geef daarna aan Claude welk nummer je wilt.</div>
<div class="grid">
${variants.map((v, i) => `<div class="item" onclick="select(${i})" id="item-${i}"><div class="num">${i+1}</div>${makeSvg(v)}<div class="label">${v.title}</div></div>`).join('')}
</div>
<script>
  function select(i) {
    document.querySelectorAll('.item').forEach(el => el.classList.remove('selected'));
    document.getElementById('item-'+i).classList.add('selected');
    navigator.clipboard?.writeText(String(i+1));
    document.getElementById('info').innerHTML = '✅ Gekozen: <b>Variant ' + (i+1) + '</b> — zeg tegen Claude: "gebruik variant ' + (i+1) + '"';
  }
</script></body></html>`;

createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
  res.end(html);
}).listen(3500, () => console.log('Euro variants on http://localhost:3500'));
