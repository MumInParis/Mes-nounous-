/* Mini générateur PDF (A4, polices Helvetica standard, encodage WinAnsi).
   Suffisant pour un relevé : texte, rectangles, traits, plusieurs pages. Aucune dépendance. */
(function () {
  const W_R = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  const W_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,556,278,556,500,1000,556,556,333,1000,667,333,1000,556,611,556,556,278,278,500,500,350,556,1000,333,1000,556,333,944,556,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
  const SPECIAL = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
    0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E,
    0x0178: 0x9F, 0x202F: 0x20, 0x00A0: 0x20, 0x2009: 0x20, 0x2212: 0x2D };

  function codes(str) {
    const out = [];
    for (const ch of String(str)) {
      const u = ch.codePointAt(0);
      if (u >= 32 && u < 127) out.push(u);
      else if (SPECIAL[u] !== undefined) out.push(SPECIAL[u]);
      else if (u >= 0xA1 && u <= 0xFF) out.push(u);
      else out.push(63); // « ? » pour les caractères non pris en charge
    }
    return out;
  }
  function width(str, bold, size) {
    const t = bold ? W_B : W_R;
    return codes(str).reduce((s, c) => s + (t[c - 32] || 556), 0) / 1000 * size;
  }
  function fit(str, bold, size, max) {
    str = String(str);
    if (width(str, bold, size) <= max) return str;
    while (str.length && width(str + '…', bold, size) > max) str = str.slice(0, -1);
    return str.trimEnd() + '…';
  }
  const num = n => (Math.round(n * 100) / 100).toString();
  const rgb = c => c.map(v => num(v / 255)).join(' ');

  class MiniPDF {
    constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.addPage(); }
    addPage() { this.ops = []; this.pages.push(this.ops); return this; }
    text(x, y, str, o = {}) {
      const size = o.size || 10, bold = !!o.bold, w = width(str, bold, size);
      if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
      const bytes = codes(str).map(c => (c === 40 || c === 41 || c === 92) ? '\\' + String.fromCharCode(c) : String.fromCharCode(c)).join('');
      this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(o.color || [0, 0, 0])} rg ${num(x)} ${num(this.H - y)} Td (${bytes}) Tj ET`);
      return w;
    }
    rect(x, y, w, h, color) { this.ops.push(`${rgb(color)} rg ${num(x)} ${num(this.H - y - h)} ${num(w)} ${num(h)} re f`); }
    line(x1, y1, x2, y2, color = [200, 200, 200], lw = 0.6) {
      this.ops.push(`${rgb(color)} RG ${num(lw)} w ${num(x1)} ${num(this.H - y1)} m ${num(x2)} ${num(this.H - y2)} l S`);
    }
    output() {
      const objs = [];
      const n = this.pages.length;
      objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      const kids = this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
      objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
      objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
      objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
      this.pages.forEach((ops, i) => {
        const content = ops.join('\n');
        objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
        objs[6 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      });
      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offs = [];
      for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
      const xref = out.length;
      out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
      for (let i = 1; i < objs.length; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
      out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    }
  }
  MiniPDF.width = width;
  MiniPDF.fit = fit;
  window.MiniPDF = MiniPDF;
})();
