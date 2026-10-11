// Gallery thumbnails for the stub LLMs (stub-llm.mjs, e2e-security.mjs): what a good model answers to the FOLDO_PREVIEW
// prompt (app/lib/.server/previews.ts), picked by keywords in the app name, plus a hostile answer for sanitizer tests.
// A prompt containing EVILPREVIEW (or STUB_PREVIEW=evil) gets the hostile one.

const R = 'width:100%;height:100%;box-sizing:border-box;';
const bar = (w, c, h = 7) => `<i style="display:block;width:${w};height:${h}px;border-radius:4px;background:${c}"></i>`;
const head = (c) => `<div style="display:flex;gap:6px;align-items:center"><span style="width:12px;height:12px;border-radius:4px;background:${c}"></span>${bar('32%', '#CFC6B4')}</div>`;

const DESIGNS = {
  // a message bubble, a red verdict pill and a risk meter
  scam: `<div style="${R}background:#FFFFFF;padding:9% 9%;display:flex;flex-direction:column;gap:9%">${head('#B42318')}<div style="flex:1;border-radius:10px 10px 10px 3px;background:#F4F0E6;padding:5% 6%;display:flex;flex-direction:column;justify-content:center;gap:9px">${bar('88%', '#DCD3C2')}${bar('60%', '#DCD3C2')}</div><div style="display:flex;gap:8px;align-items:center"><span style="width:26%;height:14px;border-radius:999px;background:#FBEFED;border:1px solid #F0C9C4"></span><span style="flex:1;height:6px;border-radius:3px;background:#EFEAE0;overflow:hidden"><span style="display:block;width:78%;height:100%;background:#B42318"></span></span></div></div>`,
  // a donut and a three-row legend
  budget: `<div style="${R}background:#FFFFFF;padding:9% 9%;display:flex;gap:9%;align-items:center"><svg viewBox="0 0 36 36" style="height:78%;aspect-ratio:1"><circle cx="18" cy="18" r="13" fill="none" stroke="#EFEAE0" stroke-width="7"/><circle cx="18" cy="18" r="13" fill="none" stroke="#16140F" stroke-width="7" stroke-dasharray="40 82" transform="rotate(-90 18 18)"/><circle cx="18" cy="18" r="13" fill="none" stroke="#2B5C9E" stroke-width="7" stroke-dasharray="22 82" stroke-dashoffset="-40" transform="rotate(-90 18 18)"/></svg><div style="flex:1;display:flex;flex-direction:column;gap:12px">${bar('46%', '#16140F', 8)}<div style="display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:#16140F"></span>${bar('70%', '#EFEAE0')}</div><div style="display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:#2B5C9E"></span>${bar('56%', '#EFEAE0')}</div><div style="display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:#2F6F5E"></span>${bar('64%', '#EFEAE0')}</div></div></div>`,
  // two amount fields, a fee bar and a blue link-bar
  transfer: `<div style="${R}background:#EEF3FA;padding:8% 9%;display:flex;flex-direction:column;gap:8%">${[0, 1].map(() => `<div style="flex:1;max-height:26px;border:1px solid #CFD9E8;border-radius:6px;background:#FFFFFF;display:flex;align-items:center;justify-content:space-between;padding:0 5%">${bar('22%', '#DDE3EC', 6)}${bar('30%', '#16140F', 7)}</div>`).join('')}<span style="height:5px;border-radius:3px;background:#DDE3EC;overflow:hidden"><span style="display:block;width:24%;height:100%;background:#2B5C9E"></span></span><span style="width:36%;height:12px;border-radius:999px;background:#2B5C9E"></span></div>`,
  // a dark ops table with risk scores
  console: `<div style="${R}background:#16140F;padding:7% 7%;display:flex;flex-direction:column;gap:7%"><div style="display:flex;justify-content:space-between">${bar('24%', '#4A453B', 5)}<span style="width:16%;height:9px;border-radius:999px;background:#FFC21A"></span></div>${['#E5484D', '#E5484D', '#3DA56B', '#3DA56B'].map((c, i) => `<div style="display:flex;gap:8%;align-items:center;border-top:1px solid #2C2820;padding-top:4%">${bar(`${44 - i * 5}%`, '#8A8273', 5)}<span style="flex:1"></span>${bar('16%', '#D9D2C3', 5)}${bar('8%', c, 5)}</div>`).join('')}</div>`,
  // a 12-month grid of paid rent
  credit: `<div style="${R}background:#FFFFFF;padding:9% 9%;display:flex;flex-direction:column;gap:9%"><div style="display:flex;justify-content:space-between">${bar('38%', '#16140F', 7)}${bar('14%', '#1F7A4D', 7)}</div><div style="flex:1;display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${Array.from({ length: 12 }, (_, i) => `<span style="border-radius:3px;${i < 9 ? 'background:#1F7A4D' : 'border:1px dashed #CFC6B4'}"></span>`).join('')}</div>${bar('58%', '#EFEAE0', 6)}</div>`,
  // generic: header, a stat row, a list
  list: `<div style="${R}background:#FBF8F1;padding:9% 9%;display:flex;flex-direction:column;gap:8%">${head('#C2410C')}<div style="display:flex;gap:6%">${[0, 1].map(() => `<div style="flex:1;border:1px solid #E4DDCF;border-radius:6px;background:#FFFFFF;padding:5%;display:flex;flex-direction:column;gap:6px">${bar('50%', '#EFEAE0', 5)}${bar('70%', '#16140F', 8)}</div>`).join('')}</div>${[80, 64].map((w) => `<div style="display:flex;justify-content:space-between">${bar(`${w / 1.6}%`, '#E4DDCF', 6)}${bar('14%', '#C2410C', 6)}</div>`).join('')}</div>`,
};

const PICK = [
  [/scam|phish|fraud check|red flag/i, 'scam'],
  [/console|monitor|ops|night shift/i, 'console'],
  [/budget|saving|coach|spend/i, 'budget'],
  [/transfer|remit|send money|cross-border|checkout|pay/i, 'transfer'],
  [/credit|rent|score|loan/i, 'credit'],
];

// a script, a handler, a fetch in CSS, external links and a phishing line: all of it must be gone after sanitizing
export const EVIL_PREVIEW = `<script>alert(document.cookie)</script><style>@import url(https://evil.example/x.css);.r{background:url(https://evil.example/t.png);width:100%;height:100%}</style><div class="r" onclick="alert(1)"><img src="https://evil.example/p.png" onerror="alert(2)"><a href="javascript:alert(3)">Your account is locked, sign in at evil.example</a><iframe src="https://evil.example"></iframe><svg onload="alert(4)"><rect width="10" height="10" fill="#2B5C9E"/></svg></div>`;

export function stubPreview(prompt) {
  if (prompt.includes('EVILPREVIEW') || process.env.STUB_PREVIEW === 'evil') {
    return EVIL_PREVIEW;
  }

  const name = /App name: (.*)/.exec(prompt)?.[1] ?? '';

  return DESIGNS[PICK.find(([re]) => re.test(name))?.[1] ?? 'list'];
}
