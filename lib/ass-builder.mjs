import { writeFileSync } from 'node:fs';

const DEVANAGARI_RE = /([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+)*)/g;

/**
 * Strip emoji arrows/unsupported glyphs in TTF text and escape ASS characters.
 */
export function sanitizeAssText(str) {
  if (!str) return '';
  return String(str)
    .replace(/👉|➡️|▶️/g, '->')
    .replace(/\uFE0F/g, '')
    .replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])(?=[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '$1 ')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

/**
 * Wrap mixed Hindi/English text cleanly into lines that fit within maxVisualUnits.
 */
export function wrapTextLines(text, maxUnits = 34) {
  const clean = String(text || '').replace(/👉|➡️|▶️/g, '->').trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\r?\n/);
  const lines = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureWeightedChars(candidate) <= maxUnits || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * Estimate visual width in normalized character units (accounting for narrow vs wide glyphs).
 */
export function measureWeightedChars(str) {
  let units = 0;
  for (const ch of String(str || '')) {
    if ('iltI1.,!|:\'" '.includes(ch)) units += 0.52;
    else if ('MW@%mwG'.includes(ch)) units += 1.32;
    else if (/[\u0900-\u097F]/.test(ch)) units += 0.92;
    else units += 0.98;
  }
  return units;
}

/**
 * Format text for ASS with automatic Devanagari <-> Latin font switching.
 * Preserves punctuation/Latin in latinFont while rendering Devanagari runs cleanly in hindiFont.
 */
export function formatMixedScriptAss(text, latinFont = 'Montserrat Thin Black', hindiFont = 'Noto Sans Devanagari Black') {
  const safe = sanitizeAssText(text);
  // Split around Devanagari segments so Latin punctuation & numbers stay in latinFont
  return safe.replace(DEVANAGARI_RE, match => `{\\fn${hindiFont}}${match}{\\fn${latinFont}}`);
}

/**
 * Convert #RRGGBB hex into ASS &H00BBGGRR& color tag.
 */
export function hexToAssColor(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}&`.toUpperCase();
}

/**
 * Build a complete ASS subtitle file content.
 */
export function writeAssFile({
  outPath,
  width = 1080,
  height = 1350,
  styles = [],
  dialogues = []
}) {
  const styleLines = styles.map(s => {
    const {
      name = 'Default',
      fontName = 'Montserrat Thin Black',
      fontSize = 46,
      primaryHex = '#000000',
      outlineHex = '#000000',
      backHex = '#000000',
      bold = 0,
      alignment = 5,
      marginL = 50,
      marginR = 50,
      marginV = 20,
      borderStyle = 1,
      outline = 0,
      shadow = 0
    } = s;

    return `Style: ${name},${fontName},${fontSize},${hexToAssColor(primaryHex)},&H000000FF,${hexToAssColor(outlineHex)},${hexToAssColor(backHex)},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1`;
  });

  const eventLines = dialogues.map(d => {
    const {
      layer = 0,
      start = '0:00:00.00',
      end = '0:00:30.00',
      style = 'Default',
      text = ''
    } = d;
    return `Dialogue: ${layer},${start},${end},${style},,0,0,0,,${text}`;
  });

  const assContent = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...eventLines,
    ''
  ].join('\n');

  writeFileSync(outPath, assContent, 'utf8');
  return outPath;
}
