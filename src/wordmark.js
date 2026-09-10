import { readFile } from 'node:fs/promises';
const forms = { '█': [0, 0, 1, 1], '▀': [0, 0, 1, .5], '▄': [0, .5, 1, .5], '▐': [.5, 0, .5, 1], '▌': [0, 0, .5, 1] };
// The supplied FIGlet font has no digits. These are local block constructions,
// not purported original font glyphs. Three-cell stems match the lettering weight.
const digits = {
  '0': [' ####### ', '###   ###', '###   ###', '###   ###', '###   ###', '###   ###', '###   ###', ' ####### '],
  '1': ['   ###   ', ' #####   ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', ' ####### '],
  '2': [' ####### ', '###   ###', '      ###', '    #### ', '  ####   ', ' ###     ', '###      ', '#########'],
  '3': ['######## ', '      ###', '      ###', '  ###### ', '      ###', '      ###', '###   ###', ' ####### '],
  '4': ['###   ###', '###   ###', '###   ###', '#########', '      ###', '      ###', '      ###', '      ###'],
  '5': ['#########', '###      ', '###      ', '######## ', '      ###', '      ###', '###   ###', ' ####### '],
  '6': [' ####### ', '###      ', '###      ', '######## ', '###   ###', '###   ###', '###   ###', ' ####### '],
  '7': ['#########', '      ###', '     ### ', '    ###  ', '   ###   ', '  ###    ', ' ###     ', '###      '],
  '8': [' ####### ', '###   ###', '###   ###', ' ####### ', '###   ###', '###   ###', '###   ###', ' ####### '],
  '9': [' ####### ', '###   ###', '###   ###', ' ########', '      ###', '      ###', '      ###', ' ####### '],
};

function fontRows(font, char) {
  const lines = font.split(/\r?\n/), header = lines[0].split(/\s+/);
  if (header[0] !== 'flf2a$' || Number(header[1]) !== 9) throw Error('Unsupported suffix font format.');
  if (!/^[A-Z0-9-]$/.test(char)) throw Error('Suffix font glyph must be a letter, digit or hyphen.');
  const start = 1 + Number(header[5]), height = Number(header[1]), end = lines[start].at(-1);
  return lines.slice(start + (char.charCodeAt(0) - 32) * height, start + (char.charCodeAt(0) - 31) * height)
    .map(line => { while (line.endsWith(end)) line = line.slice(0, -1); return line.replaceAll('$', ' '); });
}
export function fontGlyph(font, char) {
  if (digits[char]) return [...digits[char], '         '].map(row => row.replaceAll('#', '█'));
  let rows = fontRows(font, char);
  // The historical D removes one interior column, keeping stems and terminals.
  if (char === 'D') rows = rows.map(row => row.slice(0, 5) + row.slice(6));
  const occupied = rows.flatMap(row => [...row].flatMap((c, i) => c === ' ' ? [] : [i]));
  if (!occupied.length) throw Error(`Empty suffix glyph: ${char}`);
  const left = Math.min(...occupied), right = Math.max(...occupied);
  return rows.map(row => row.padEnd(right + 1).slice(left, right + 1));
}

function glyphRectangles(rows, char, x0) {
  const rectangles = [];
  for (const [y, row] of rows.entries()) for (const [x, c] of [...row].entries()) {
    if (c === ' ') continue;
    if (!forms[c]) throw Error(`Unsupported block ${JSON.stringify(c)} in suffix glyph ${char}.`);
    const [dx, dy, w, h] = forms[c];
    rectangles.push({ x: x0 + (x + dx) * 5.1, y: 5 + (y + dy) * 10, width: w * 5.1, height: h * 10 });
  }
  return rectangles;
}
function suffixGlyph(font, char, x) {
  if (char === '.' || char === '-') {
    const width = char === '.' ? 15.3 : 20.4;
    return { rectangles: [{ x, y: char === '.' ? 70 : 40, width, height: char === '.' ? 15 : 10 }], glyph: { char, x, width } };
  }
  const rows = fontGlyph(font, char);
  return { rectangles: glyphRectangles(rows, char, x), glyph: { char, rows, x, width: rows[0].length * 5.1 } };
}
export async function buildWordmark(tld) {
  if (!/^\.[A-Z0-9-]+(?:\.[A-Z0-9-]+)*$/.test(tld)) throw Error('Invalid normalized suffix.');
  const [svg, font] = await Promise.all([
    readFile(new URL('../assets/official-wordmark.svg', import.meta.url), 'utf8'),
    readFile(new URL('../assets/Delta-Corps-Priest-1.flf', import.meta.url), 'utf8'),
  ]);
  const base = [...svg.matchAll(/<rect\s+([^>]+)\/>/g)].map(([, attributes]) => {
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(k => {
      const value = Number(attributes.match(new RegExp(`${k}="([\\d.]+)"`))?.[1]) / 10;
      if (!Number.isFinite(value)) throw Error('Unsupported official wordmark geometry.');
      return [k, value];
    }));
  });
  if (base.length !== 211) throw Error('Official wordmark must contain 211 rectangles.');
  const suffix = [{ x: 423.3, y: 70, width: 15.3, height: 15 }], glyphs = [];
  let x0 = 448.8;
  for (const char of tld.slice(1)) {
    const { rectangles, glyph } = suffixGlyph(font, char, x0);
    suffix.push(...rectangles); glyphs.push(glyph);
    x0 += glyph.width + 10.2;
  }
  return { base, suffix, glyphs, baseWidth: 413.1, fullWidth: Math.max(...suffix.map(r => r.x + r.width)), height: 95 };
}
