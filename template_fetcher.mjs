import https from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const STUDIO_DIR = dirname(__filename);
const CACHE_PATH = join(STUDIO_DIR, 'assets', 'templates_cache.json');
const TEMPLATES_DIR = join(STUDIO_DIR, 'assets', 'templates');

if (!existsSync(TEMPLATES_DIR)) {
  mkdirSync(TEMPLATES_DIR, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      { headers: { 'User-Agent': 'MemesStudio/3.0 (Node.js)' } },
      res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    ).on('error', reject);
  });
}

function downloadBinary(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      { headers: { 'User-Agent': 'MemesStudio/3.0 (Node.js)' } },
      res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadBinary(res.headers.location, destPath).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          writeFileSync(destPath, Buffer.concat(chunks));
          resolve(destPath);
        });
      }
    ).on('error', reject);
  });
}

// Popular Hinglish / Desi tags mapped to classic visual templates
const DESI_TAG_HINTS = {
  drake: ['choice', 'expectation', 'desi', 'reject', 'accept', 'bachpan', 'jawani'],
  db: ['distracted', 'boyfriend', 'crush', 'gf', 'bf', 'cheating', 'relationship'],
  doge: ['cheems', 'dog', 'strength', 'coding', 'engineer', 'majdoor', 'exam'],
  buzz: ['everywhere', 'memes', 'relatives', 'shaadi', 'spam', 'monday'],
  'two-buttons': ['confusion', 'dilemma', 'exam', 'job', 'salary', 'paise'],
  stonks: ['stock', 'sensex', 'nifty', 'crypto', 'finance', 'profit', 'paisa', 'tax'],
  'fine': ['this is fine', 'deadline', 'monday', 'corporate', 'exam', 'crash', 'fire'],
  'hide-pain': ['harold', 'pain', 'smile', 'corporate', 'appraisal', 'salary', 'intern'],
  'disastergirl': ['devil', 'chota bhai', 'mummy', 'revenge', 'chaos', 'laugh'],
  'spiderman': ['same same', 'lookalike', 'dost', 'copy', 'point'],
  'woman-cat': ['argument', 'mummy', 'gf', 'fight', 'shouting', 'cat'],
  'brain': ['galaxy brain', 'topper', 'jugaad', 'indian', 'smart']
};

/**
 * Fetch and cache popular meme templates from Memegen.link + Imgflip (Free, No Auth).
 */
export async function fetchTemplates({
  source = 'all',
  query = '',
  limit = 15,
  forceRefresh = false
} = {}) {
  let cached = null;
  if (!forceRefresh && existsSync(CACHE_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      const ageMs = Date.now() - (parsed.fetchedAt || 0);
      if (ageMs < 24 * 60 * 60 * 1000 && Array.isArray(parsed.templates)) {
        cached = parsed.templates;
      }
    } catch (_) {}
  }

  let templates = cached;
  if (!templates) {
    const [memegenRes, imgflipRes] = await Promise.allSettled([
      fetchJson('https://api.memegen.link/templates/'),
      fetchJson('https://api.imgflip.com/get_memes')
    ]);

    const combined = [];
    if (memegenRes.status === 'fulfilled' && Array.isArray(memegenRes.value)) {
      for (const t of memegenRes.value) {
        combined.push({
          id: `memegen:${t.id}`,
          shortId: t.id,
          name: t.name,
          source: 'memegen.link',
          blankUrl: t.blank,
          lines: t.lines || 2,
          keywords: [...(t.keywords || []), ...(DESI_TAG_HINTS[t.id] || [])]
        });
      }
    }

    if (imgflipRes.status === 'fulfilled' && imgflipRes.value?.success) {
      for (const m of imgflipRes.value.data.memes) {
        combined.push({
          id: `imgflip:${m.id}`,
          shortId: String(m.id),
          name: m.name,
          source: 'imgflip',
          blankUrl: m.url,
          lines: m.box_count || 2,
          width: m.width,
          height: m.height,
          keywords: []
        });
      }
    }

    templates = combined;
    try {
      mkdirSync(dirname(CACHE_PATH), { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: Date.now(), templates }, null, 2));
    } catch (_) {}
  }

  let filtered = templates;
  if (source !== 'all') {
    filtered = filtered.filter(t => t.source.toLowerCase().includes(source.toLowerCase()));
  }
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.shortId.toLowerCase().includes(q) ||
      (t.keywords || []).some(k => k.toLowerCase().includes(q))
    );
  }

  return {
    totalAvailable: filtered.length,
    returned: Math.min(limit, filtered.length),
    templates: filtered.slice(0, limit)
  };
}

/**
 * Download a blank template locally so renderer.mjs can overlay Hinglish text / Reel motion.
 */
export async function downloadTemplate({
  url,
  templateId,
  outputPath
}) {
  let targetUrl = url;
  let safeName = 'template';

  if (!targetUrl && templateId) {
    const { templates } = await fetchTemplates({ limit: 500 });
    const found = templates.find(
      t => t.id === templateId || t.shortId === templateId
    );
    if (!found) {
      throw new Error(`Template ID not found: ${templateId}`);
    }
    targetUrl = found.blankUrl;
    safeName = found.shortId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  if (!targetUrl) {
    throw new Error('Either url or template_id must be provided.');
  }

  const extMatch = targetUrl.match(/\.(png|jpg|jpeg|webp)(?:[?#]|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
  const dest = outputPath || join(TEMPLATES_DIR, `${safeName}_${Date.now()}.${ext}`);

  mkdirSync(dirname(dest), { recursive: true });
  await downloadBinary(targetUrl, dest);

  return {
    success: true,
    templatePath: dest,
    sourceUrl: targetUrl
  };
}
