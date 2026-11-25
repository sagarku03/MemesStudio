import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  createRoundedRectPng,
  createCircleMaskPng,
  createVerifiedBadgePng
} from './lib/png-shapes.mjs';
import {
  wrapTextLines,
  measureWeightedChars,
  formatMixedScriptAss,
  hexToAssColor,
  writeAssFile
} from './lib/ass-builder.mjs';
import { generateInstagramSEO } from './seo_helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const STUDIO_DIR = dirname(__filename);
const FONTS_DIR = join(STUDIO_DIR, 'assets/fonts');
const EMOJI_DIR = join(STUDIO_DIR, 'assets/emojis');

// Automatically detect Android /sdcard or fallback to ~/Downloads/Memes
const DOWNLOAD_DIR = existsSync('/sdcard')
  ? '/sdcard/Download/Memes'
  : join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'Memes');

const REELS_DOWNLOAD_DIR = join(DOWNLOAD_DIR, 'Reels');

for (const dir of [DOWNLOAD_DIR, REELS_DOWNLOAD_DIR]) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

const THEMES = {
  yellow: { bg: '0xFFE600', hookHex: '#000000', punchHex: '#D32F2F', divider: '0x222222@0.35' },
  dark: { bg: '0x111111', hookHex: '#FFFFFF', punchHex: '#FFE600', divider: '0x333333@0.8' },
  light: { bg: '0xFFFFFF', hookHex: '#111111', punchHex: '#D32F2F', divider: '0xCCCCCC@0.8' }
};

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', code => {
      if (code === 0) resolve(true);
      else reject(new Error(stderr.trim() || `Command failed with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'memes_studio_'));
  try {
    return await fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

function getEmojiPath(emojiName) {
  const clean = (emojiName || 'joy').toLowerCase().replace(/[^a-z]/g, '');
  const p = join(EMOJI_DIR, `${clean}.png`);
  return existsSync(p) ? p : join(EMOJI_DIR, 'joy.png');
}

function escapeAssFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function copyOutputAndSeo({ outPath, subDir = '', seoParams }) {
  const targetDir = subDir ? join(DOWNLOAD_DIR, subDir) : DOWNLOAD_DIR;
  try {
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const galleryTarget = join(targetDir, basename(outPath));
    copyFileSync(outPath, galleryTarget);
    const captionPath = galleryTarget.replace(/\.[^.]+$/, '_caption.txt');
    const seo = generateInstagramSEO({ ...seoParams, saveSidecarPath: captionPath });
    return { galleryPath: galleryTarget, seo };
  } catch (_) {
    const seo = generateInstagramSEO(seoParams);
    return { galleryPath: outPath, seo };
  }
}

/**
 * Compute wrapped lines, adaptive font size, and header height for top banner memes.
 */
function layoutBannerText(hookText, punchlineText) {
  const hookWordsLen = measureWeightedChars(hookText);
  const punchWordsLen = measureWeightedChars(punchlineText);
  const totalUnits = hookWordsLen + punchWordsLen;

  let fontSize = 46;
  let maxUnits = 34;
  if (totalUnits > 75) {
    fontSize = 38;
    maxUnits = 41;
  } else if (totalUnits > 50) {
    fontSize = 42;
    maxUnits = 37;
  }

  const hookLines = wrapTextLines(hookText, maxUnits);
  const punchLines = wrapTextLines(punchlineText, maxUnits - 3);
  const totalLines = hookLines.length + punchLines.length;
  const headerH = totalLines > 3 ? 330 : totalLines === 3 ? 296 : 270;

  return { hookLines, punchLines, fontSize, headerH };
}

/**
 * Build ASS file + emoji overlay coordinate for Yellow/Dark/Light header cards.
 */
function prepareHeaderAss({
  assPath,
  hookText,
  punchlineText,
  watermark,
  theme = 'yellow',
  topBadge = '',
  canvasWidth = 1080,
  canvasHeight = 1350,
  headerOffsetY = 0,
  watermarkY = null
}) {
  const themeCfg = THEMES[theme] || THEMES.yellow;
  const { hookLines, punchLines, fontSize, headerH } = layoutBannerText(hookText, punchlineText);

  const lineSpacing = Math.round(fontSize * 1.24);
  const blockH = (hookLines.length + punchLines.length) * lineSpacing;
  const startY = headerOffsetY + Math.max(24, Math.round((headerH - blockH) / 2));

  const styles = [
    {
      name: 'Hook',
      fontName: 'Montserrat Thin Black',
      fontSize,
      primaryHex: themeCfg.hookHex,
      alignment: 8,
      marginL: 50,
      marginR: 50,
      marginV: 0
    },
    {
      name: 'Punch',
      fontName: 'Montserrat Thin Black',
      fontSize: Math.max(34, fontSize - 2),
      primaryHex: themeCfg.punchHex,
      alignment: 8,
      marginL: 50,
      marginR: 50,
      marginV: 0
    },
    {
      name: 'Badge',
      fontName: 'Montserrat Thin Black',
      fontSize: 26,
      primaryHex: '#FFFFFF',
      alignment: 5,
      marginL: 10,
      marginR: 10,
      marginV: 0
    }
  ];

  const dialogues = [];

  hookLines.forEach((line, idx) => {
    const y = startY + idx * lineSpacing;
    dialogues.push({
      style: 'Hook',
      text: `{\\pos(${Math.round(canvasWidth / 2)},${y})}${formatMixedScriptAss(line)}`
    });
  });

  let lastPunchY = startY + hookLines.length * lineSpacing;
  let lastPunchWidth = 0;

  punchLines.forEach((line, idx) => {
    const isLast = idx === punchLines.length - 1;
    const y = startY + (hookLines.length + idx) * lineSpacing;
    lastPunchY = y;
    const textWithSuffix = isLast ? `${line} :` : line;
    const pxPerUnit = Math.max(34, fontSize - 2) * 0.48;
    lastPunchWidth = measureWeightedChars(textWithSuffix) * pxPerUnit;

    // Shift last line slightly left so emoji sits balanced beside it
    const centerX = isLast
      ? Math.round(canvasWidth / 2 - 28)
      : Math.round(canvasWidth / 2);

    dialogues.push({
      style: 'Punch',
      text: `{\\pos(${centerX},${y})}${formatMixedScriptAss(textWithSuffix)}`
    });
  });

  if (topBadge) {
    dialogues.push({
      style: 'Badge',
      text: `{\\pos(${canvasWidth - 68},${headerOffsetY + 38})\\fs24}${formatMixedScriptAss(topBadge)}`
    });
  }

  if (watermark) {
    const wmY = watermarkY !== null ? watermarkY : (canvasHeight - 44);
    dialogues.push({
      style: 'Badge',
      text: `{\\pos(${Math.round(canvasWidth / 2)},${wmY})}${formatMixedScriptAss(watermark)}`
    });
  }

  writeAssFile({ outPath: assPath, width: canvasWidth, height: canvasHeight, styles, dialogues });

  const emojiX = Math.min(
    canvasWidth - 78,
    Math.max(Math.round(canvasWidth / 2 + 40), Math.round((canvasWidth - 56 + lastPunchWidth) / 2 + 4))
  );
  const emojiY = Math.max(headerOffsetY + 12, lastPunchY - 2);

  return { headerH, emojiX, emojiY, themeCfg };
}

/**
 * 1. Signature Header Instagram Meme (1080x1350) - Upgraded with auto-wrap, Devanagari, themes & PNG logo
 */
export async function renderYellowHeaderMeme({
  imagePath,
  hookText,
  punchlineText,
  emoji = 'joy',
  watermark = '@soo_funny_memes',
  theme = 'yellow',
  logoPath = null,
  topic = '',
  outputPath
}) {
  if (!existsSync(imagePath)) {
    throw new Error(`Input image not found: ${imagePath}`);
  }

  const out = outputPath || join(STUDIO_DIR, `meme_${Date.now()}.png`);
  const emojiFile = getEmojiPath(emoji);
  const hasLogo = Boolean(logoPath && existsSync(logoPath));

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'header.ass');
    const pillPath = join(tmp, 'wm_pill.png');

    const { headerH, emojiX, emojiY, themeCfg } = prepareHeaderAss({
      assPath,
      hookText,
      punchlineText,
      watermark,
      theme
    });

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({
      width: pillW,
      height: 50,
      radius: 25,
      bgRgba: [0, 0, 0, 185],
      outPath: pillPath
    });

    const imgH = 1350 - headerH;
    const filters = [
      `[0:v]scale=1080:${imgH}:force_original_aspect_ratio=increase,crop=1080:${imgH},eq=contrast=1.05:saturation=1.1,pad=1080:1350:0:${headerH}:color=${themeCfg.bg}[base]`,
      `[1:v]scale=50:50[emo]`,
      `[base]drawbox=x=0:y=${headerH}:w=1080:h=2:color=${themeCfg.divider}:t=fill[bordered]`,
      `[bordered][2:v]overlay=x=(W-w)/2:y=H-69[withpill]`,
      `[withpill][emo]overlay=x=${emojiX}:y=${emojiY}[withemo]`
    ];

    let cur = '[withemo]';
    const inputs = ['-y', '-i', imagePath, '-i', emojiFile, '-i', pillPath];
    if (hasLogo) {
      inputs.push('-i', logoPath);
      filters.push(`[3:v]scale=-1:54,format=rgba,colorchannelmixer=aa=0.9[logo]`);
      filters.push(`${cur}[logo]overlay=x=24:y=${headerH + 20}[withlogo]`);
      cur = '[withlogo]';
    }

    filters.push(`${cur}ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`);

    await runCmd('ffmpeg', [...inputs, '-filter_complex', filters.join('; '), '-map', '[outv]', '-frames:v', '1', out]);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { topic, hookText, punchlineText, format: 'post', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    theme,
    dimensions: '1080x1350 (4:5 Portrait)',
    instagramSEO: seo
  };
}

/**
 * 2. Left vs Right Comparison Meme (1080x1350)
 */
export async function renderComparisonMeme({
  leftImg,
  rightImg,
  leftLabel,
  rightLabel,
  headerTitle,
  emoji = 'joy',
  watermark = '@soo_funny_memes',
  theme = 'yellow',
  outputPath
}) {
  if (!existsSync(leftImg) || !existsSync(rightImg)) {
    throw new Error('Both left and right images must exist.');
  }

  const out = outputPath || join(STUDIO_DIR, `comparison_${Date.now()}.png`);
  const emojiFile = getEmojiPath(emoji);
  const themeCfg = THEMES[theme] || THEMES.yellow;

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'comp.ass');
    const pillPath = join(tmp, 'wm_pill.png');

    const titleLines = wrapTextLines(headerTitle, 32);
    const titleH = titleLines.length > 1 ? 150 : 120;
    const headerH = titleH + 85;
    const imgH = 1350 - headerH;

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 50, radius: 25, bgRgba: [0, 0, 0, 185], outPath: pillPath });

    const styles = [
      { name: 'Title', fontName: 'Montserrat Thin Black', fontSize: 46, primaryHex: themeCfg.hookHex, alignment: 8 },
      { name: 'Left', fontName: 'Montserrat Thin Black', fontSize: 34, primaryHex: themeCfg.hookHex, alignment: 8, marginL: 20, marginR: 20 },
      { name: 'Right', fontName: 'Montserrat Thin Black', fontSize: 34, primaryHex: themeCfg.punchHex, alignment: 8, marginL: 20, marginR: 20 },
      { name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 26, primaryHex: '#FFFFFF', alignment: 5 }
    ];

    const dialogues = [];
    titleLines.forEach((line, idx) => {
      dialogues.push({
        style: 'Title',
        text: `{\\pos(${idx === titleLines.length - 1 ? 512 : 540},${42 + idx * 54})}${formatMixedScriptAss(line)}`
      });
    });

    const lastLine = titleLines[titleLines.length - 1] || '';
    const lastW = measureWeightedChars(lastLine) * 24;
    const emojiX = Math.min(1000, Math.round((1080 - 56 + lastW) / 2 + 12));
    const emojiY = 42 + (titleLines.length - 1) * 54 - 2;

    dialogues.push({ style: 'Left', text: `{\\pos(269,${titleH + 14})}${formatMixedScriptAss(leftLabel)}` });
    dialogues.push({ style: 'Right', text: `{\\pos(809,${titleH + 14})}${formatMixedScriptAss(rightLabel)}` });
    dialogues.push({ style: 'Badge', text: `{\\pos(540,1306)}${formatMixedScriptAss(watermark)}` });

    writeAssFile({ outPath: assPath, width: 1080, height: 1350, styles, dialogues });

    const filterComplex = [
      `[0:v]scale=538:${imgH}:force_original_aspect_ratio=increase,crop=538:${imgH}[left]`,
      `[1:v]scale=538:${imgH}:force_original_aspect_ratio=increase,crop=538:${imgH}[right]`,
      `[left][right]hstack=inputs=2[images]`,
      `[images]pad=1080:1350:0:${headerH}:color=${themeCfg.bg}[base]`,
      `[base]drawbox=x=0:y=${headerH}:w=1080:h=2:color=${themeCfg.divider}:t=fill,drawbox=x=538:y=${headerH}:w=4:h=${imgH}:color=0x111111:t=fill[splitline]`,
      `[2:v]scale=50:50[emo]`,
      `[splitline][3:v]overlay=x=(W-w)/2:y=H-69[withpill]`,
      `[withpill][emo]overlay=x=${emojiX}:y=${emojiY}[withemo]`,
      `[withemo]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`
    ].join('; ');

    await runCmd('ffmpeg', ['-y', '-i', leftImg, '-i', rightImg, '-i', emojiFile, '-i', pillPath, '-filter_complex', filterComplex, '-map', '[outv]', '-frames:v', '1', out]);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { topic: headerTitle, hookText: leftLabel, punchlineText: rightLabel, format: 'comparison', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    dimensions: '1080x1350 (4:5 Comparison)',
    instagramSEO: seo
  };
}

/**
 * 3. Top vs Bottom Split Meme (1080x1350)
 */
export async function renderSplitMeme({
  topImg,
  bottomImg,
  topLabel,
  bottomLabel,
  watermark = '@soo_funny_memes',
  outputPath
}) {
  if (!existsSync(topImg) || !existsSync(bottomImg)) {
    throw new Error('Both top and bottom images must exist.');
  }

  const out = outputPath || join(STUDIO_DIR, `split_${Date.now()}.png`);

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'split.ass');
    const pillPath = join(tmp, 'wm_pill.png');

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 46, radius: 23, bgRgba: [0, 0, 0, 175], outPath: pillPath });

    const styles = [
      { name: 'TopLbl', fontName: 'Montserrat Thin Black', fontSize: 44, primaryHex: '#FFFFFF', outlineHex: '#000000', borderStyle: 1, outline: 5, shadow: 2, alignment: 2, marginL: 45, marginR: 45, marginV: 20 },
      { name: 'BotLbl', fontName: 'Montserrat Thin Black', fontSize: 44, primaryHex: '#FFE600', outlineHex: '#000000', borderStyle: 1, outline: 5, shadow: 2, alignment: 2, marginL: 45, marginR: 45, marginV: 20 },
      { name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 24, primaryHex: '#FFFFFF', alignment: 5 }
    ];

    const topLines = wrapTextLines(topLabel, 34).join('\n');
    const botLines = wrapTextLines(bottomLabel, 34).join('\n');

    const dialogues = [
      { style: 'TopLbl', text: `{\\pos(540,648)}${formatMixedScriptAss(topLines)}` },
      { style: 'BotLbl', text: `{\\pos(540,1318)}${formatMixedScriptAss(botLines)}` },
      { style: 'Badge', text: `{\\pos(${1080 - Math.round(pillW / 2) - 24},47)}${formatMixedScriptAss(watermark)}` }
    ];

    writeAssFile({ outPath: assPath, width: 1080, height: 1350, styles, dialogues });

    const filterComplex = [
      `[0:v]scale=1080:673:force_original_aspect_ratio=increase,crop=1080:673[top]`,
      `[1:v]scale=1080:673:force_original_aspect_ratio=increase,crop=1080:673[bottom]`,
      `[top][bottom]vstack=inputs=2,pad=1080:1350:0:0:black[combined]`,
      `[combined]drawbox=x=0:y=673:w=1080:h=4:color=black:t=fill[seam]`,
      `[seam][2:v]overlay=x=W-w-24:y=24[withpill]`,
      `[withpill]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`
    ].join('; ');

    await runCmd('ffmpeg', ['-y', '-i', topImg, '-i', bottomImg, '-i', pillPath, '-filter_complex', filterComplex, '-map', '[outv]', '-frames:v', '1', out]);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { hookText: topLabel, punchlineText: bottomLabel, format: 'split', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    dimensions: '1080x1350 (4:5 Top-Bottom)',
    instagramSEO: seo
  };
}

/**
 * 4. Multi-Slide Carousel Meme Pack (1080x1350 per slide, 2-20 slides)
 */
export async function renderCarouselMeme({
  slides,
  albumTitle,
  watermark = '@soo_funny_memes',
  theme = 'yellow',
  outputDir
}) {
  if (!slides || !Array.isArray(slides) || slides.length < 2) {
    throw new Error('A carousel meme must have at least 2 slides.');
  }
  if (slides.length > 20) {
    throw new Error('Instagram supports up to 20 slides per carousel.');
  }

  const timestamp = Date.now();
  const folderName = `Carousel_${albumTitle ? albumTitle.replace(/[^a-zA-Z0-9_-]/g, '_') : timestamp}`;
  const targetDir = outputDir || join(STUDIO_DIR, folderName);
  const galleryTargetDir = join(DOWNLOAD_DIR, 'Carousels', folderName);

  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  if (!existsSync(galleryTargetDir)) mkdirSync(galleryTargetDir, { recursive: true });

  const total = slides.length;
  const renderedSlides = [];

  await withTempDir(async tmp => {
    const pillPath = join(tmp, 'wm_pill.png');
    const slideBadgeBg = join(tmp, 'slide_badge.png');
    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 50, radius: 25, bgRgba: [0, 0, 0, 185], outPath: pillPath });
    createRoundedRectPng({ width: 92, height: 42, radius: 21, bgRgba: [0, 0, 0, 200], outPath: slideBadgeBg });

    for (let i = 0; i < total; i++) {
      const slide = slides[i];
      const slideNum = i + 1;
      const slideFileName = `slide_${String(slideNum).padStart(2, '0')}.png`;
      const slideOut = join(targetDir, slideFileName);

      const imagePath = slide.imagePath || slide.image_path;
      const hookText = slide.hookText || slide.hook_text || '';
      const punchlineText = slide.punchlineText || slide.punchline_text || '';

      if (!imagePath || !existsSync(imagePath)) {
        throw new Error(`Slide image not found: ${imagePath}`);
      }

      const emojiFile = getEmojiPath(slide.emoji || 'joy');
      const assPath = join(tmp, `slide_${slideNum}.ass`);

      const { headerH, emojiX, emojiY, themeCfg } = prepareHeaderAss({
        assPath,
        hookText,
        punchlineText,
        watermark,
        theme,
        topBadge: `${slideNum}/${total}`
      });

      const imgH = 1350 - headerH;
      const filterComplex = [
        `[0:v]scale=1080:${imgH}:force_original_aspect_ratio=increase,crop=1080:${imgH},eq=contrast=1.05:saturation=1.1,pad=1080:1350:0:${headerH}:color=${themeCfg.bg}[base]`,
        `[1:v]scale=50:50[emo]`,
        `[base]drawbox=x=0:y=${headerH}:w=1080:h=2:color=${themeCfg.divider}:t=fill[bordered]`,
        `[bordered][2:v]overlay=x=(W-w)/2:y=H-69[withpill]`,
        `[withpill][3:v]overlay=x=W-114:y=17[withnum]`,
        `[withnum][emo]overlay=x=${emojiX}:y=${emojiY}[withemo]`,
        `[withemo]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`
      ].join('; ');

      await runCmd('ffmpeg', ['-y', '-i', imagePath, '-i', emojiFile, '-i', pillPath, '-i', slideBadgeBg, '-filter_complex', filterComplex, '-map', '[outv]', '-frames:v', '1', slideOut]);

      const galleryFile = join(galleryTargetDir, slideFileName);
      try { copyFileSync(slideOut, galleryFile); } catch (_) {}

      renderedSlides.push({
        slide: slideNum,
        filePath: slideOut,
        galleryPath: galleryFile
      });
    }
  });

  const seo = generateInstagramSEO({
    topic: albumTitle || slides[0].hookText || slides[0].hook_text,
    hookText: slides[0].hookText || slides[0].hook_text || '',
    punchlineText: slides[0].punchlineText || slides[0].punchline_text || '',
    format: 'carousel',
    watermark,
    saveSidecarPath: join(galleryTargetDir, 'caption_seo.txt')
  });

  return {
    success: true,
    albumTitle,
    totalSlides: total,
    folderPath: targetDir,
    galleryFolder: galleryTargetDir,
    slides: renderedSlides,
    instagramSEO: seo
  };
}

/**
 * 5. NEW v3.0: Twitter / X Tweet Card Meme (1080x1350)
 */
export async function renderTweetCardMeme({
  tweetText,
  displayName = 'Soo Funny Memes',
  handle = '@soo_funny_memes',
  avatarPath = null,
  reactionImagePath = null,
  theme = 'dark',
  verified = true,
  likes = '24.8K',
  reposts = '4.2K',
  watermark = '@soo_funny_memes',
  outputPath
}) {
  if (!tweetText) throw new Error('tweetText is required.');
  const out = outputPath || join(STUDIO_DIR, `tweet_${Date.now()}.png`);
  const isDark = theme !== 'light';
  const hasReaction = Boolean(reactionImagePath && existsSync(reactionImagePath));

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'tweet.ass');
    const cardBgPath = join(tmp, 'card_bg.png');
    const avatarCirclePath = join(tmp, 'avatar.png');
    const badgePath = join(tmp, 'verified.png');
    const pillPath = join(tmp, 'wm_pill.png');

    const wrappedTweet = wrapTextLines(tweetText, 38);
    const tweetFontSize = wrappedTweet.length > 4 ? 38 : 42;
    const lineH = Math.round(tweetFontSize * 1.35);
    const cardW = 980;
    const cardPadX = 50;
    const cardX = 50;
    const cardH = Math.max(360, 210 + wrappedTweet.length * lineH);
    const cardY = hasReaction ? 55 : Math.round((1350 - cardH) / 2);

    createRoundedRectPng({
      width: cardW,
      height: cardH,
      radius: 34,
      bgRgba: isDark ? [22, 24, 28, 255] : [255, 255, 255, 255],
      borderRgba: isDark ? [47, 51, 54, 255] : [215, 222, 228, 255],
      borderWidth: 2,
      outPath: cardBgPath
    });

    if (verified) {
      createVerifiedBadgePng({ size: 40, outPath: badgePath });
    }

    // Create circular avatar (from image or sleek fallback colored badge)
    if (avatarPath && existsSync(avatarPath)) {
      const maskPath = join(tmp, 'circle_mask.png');
      createCircleMaskPng({ size: 96, outPath: maskPath });
      await runCmd('ffmpeg', [
        '-y', '-i', avatarPath, '-i', maskPath,
        '-filter_complex', '[0:v]scale=96:96:force_original_aspect_ratio=increase,crop=96:96,format=rgba[a];[1:v]format=rgba[m];[a][m]alphamerge[out]',
        '-map', '[out]', '-frames:v', '1', avatarCirclePath
      ]);
    } else {
      createRoundedRectPng({
        width: 96,
        height: 96,
        radius: 48,
        bgRgba: [255, 230, 0, 255],
        outPath: avatarCirclePath
      });
    }

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 48, radius: 24, bgRgba: [0, 0, 0, 185], outPath: pillPath });

    const styles = [
      { name: 'Name', fontName: 'Inter', bold: -1, fontSize: 34, primaryHex: isDark ? '#E7E9EA' : '#0F1419', alignment: 7, marginL: 0, marginR: 0 },
      { name: 'Handle', fontName: 'Inter Medium', fontSize: 28, primaryHex: isDark ? '#71767B' : '#536471', alignment: 7 },
      { name: 'Tweet', fontName: 'Inter Medium', fontSize: tweetFontSize, primaryHex: isDark ? '#E7E9EA' : '#0F1419', alignment: 7 },
      { name: 'Meta', fontName: 'Inter Medium', fontSize: 25, primaryHex: isDark ? '#71767B' : '#536471', alignment: 7 },
      { name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 26, primaryHex: '#FFFFFF', alignment: 5 }
    ];

    const nameX = cardX + 46 + 96 + 22;
    const dialogues = [
      { style: 'Name', text: `{\\pos(${nameX},${cardY + 46})}${formatMixedScriptAss(displayName, 'Inter', 'Noto Sans Devanagari Black')}` },
      { style: 'Handle', text: `{\\pos(${nameX},${cardY + 90})}${formatMixedScriptAss(handle, 'Inter Medium', 'Noto Sans Devanagari Black')}` },
      { style: 'Meta', text: `{\\pos(${cardX + 46},${cardY + cardH - 58})}${reposts} Reposts   •   ${likes} Likes` },
      { style: 'Badge', text: `{\\pos(540,1306)}${formatMixedScriptAss(watermark)}` }
    ];

    if (!avatarPath || !existsSync(avatarPath)) {
      const initial = (displayName || 'M')[0].toUpperCase();
      dialogues.push({
        style: 'Badge',
        text: `{\\pos(${cardX + 46 + 48},${cardY + 44 + 48})\\fs48\\c&H000000&}${initial}`
      });
    }

    wrappedTweet.forEach((line, idx) => {
      dialogues.push({
        style: 'Tweet',
        text: `{\\pos(${cardX + 46},${cardY + 168 + idx * lineH})}${formatMixedScriptAss(line, 'Inter Medium', 'Noto Sans Devanagari Black')}`
      });
    });

    writeAssFile({ outPath: assPath, width: 1080, height: 1350, styles, dialogues });

    const bgColor = isDark ? '0x000000' : '0xF2F4F7';
    const inputs = ['-y', '-f', 'lavfi', '-i', `color=c=${bgColor}:s=1080x1350:d=1`, '-i', cardBgPath, '-i', avatarCirclePath, '-i', pillPath];
    const filters = [
      `[0:v][1:v]overlay=x=${cardX}:y=${cardY}[withcard]`,
      `[withcard][2:v]overlay=x=${cardX + 46}:y=${cardY + 44}[withdp]`
    ];

    let cur = '[withdp]';
    let idx = 4;

    if (verified) {
      inputs.push('-i', badgePath);
      const badgeX = Math.min(cardX + cardW - 70, Math.round(nameX + measureWeightedChars(displayName) * 19 + 12));
      filters.push(`${cur}[${idx}:v]overlay=x=${badgeX}:y=${cardY + 46}[withver]`);
      cur = '[withver]';
      idx++;
    }

    if (hasReaction) {
      inputs.push('-i', reactionImagePath);
      const reactY = cardY + cardH + 30;
      const reactH = Math.max(320, 1350 - reactY - 24);
      const reactW = 980;
      filters.push(`[${idx}:v]scale=${reactW}:${reactH}:force_original_aspect_ratio=increase,crop=${reactW}:${reactH},eq=contrast=1.04:saturation=1.08[react]`);
      filters.push(`${cur}[react]overlay=x=50:y=${reactY}[withreact]`);
      cur = '[withreact]';
      idx++;
    }

    filters.push(`${cur}[3:v]overlay=x=(W-w)/2:y=H-68[withpill]`);
    filters.push(`[withpill]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`);

    await runCmd('ffmpeg', [...inputs, '-filter_complex', filters.join('; '), '-map', '[outv]', '-frames:v', '1', out]);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { hookText: tweetText.slice(0, 80), punchlineText: handle, format: 'tweet_card', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    theme,
    dimensions: '1080x1350 (4:5 Tweet Card)',
    instagramSEO: seo
  };
}

/**
 * 6. NEW v3.0: WhatsApp / iMessage Fake Chat Meme (1080x1350)
 * messages: Array of { sender: 'them' | 'me', text: string, time?: string }
 */
export async function renderFakeChatMeme({
  contactName = 'Best Friend 😂',
  statusText = 'online',
  messages = [],
  reactionImagePath = null,
  theme = 'whatsapp_dark',
  watermark = '@soo_funny_memes',
  outputPath
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('At least 1 chat message is required.');
  }

  const out = outputPath || join(STUDIO_DIR, `chat_${Date.now()}.png`);
  const hasReaction = Boolean(reactionImagePath && existsSync(reactionImagePath));

  const chatPalettes = {
    whatsapp_dark: {
      bg: '0x0B141A',
      header: '0x202C33',
      headerText: '#E9EDEF',
      subText: '#8696A0',
      inBg: [32, 44, 51, 255],
      outBg: [0, 92, 75, 255],
      msgText: '#E9EDEF'
    },
    whatsapp_light: {
      bg: '0xECE5DD',
      header: '0x075E54',
      headerText: '#FFFFFF',
      subText: '#D0ECE7',
      inBg: [255, 255, 255, 255],
      outBg: [217, 253, 211, 255],
      msgText: '#111B21'
    },
    imessage: {
      bg: '0xFFFFFF',
      header: '0xF2F2F7',
      headerText: '#000000',
      subText: '#8E8E93',
      inBg: [233, 233, 235, 255],
      outBg: [0, 122, 255, 255],
      msgText: '#000000',
      outText: '#FFFFFF'
    }
  };
  const pal = chatPalettes[theme] || chatPalettes.whatsapp_dark;

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'chat.ass');
    const avatarPath = join(tmp, 'dp.png');
    const pillPath = join(tmp, 'wm_pill.png');

    createRoundedRectPng({ width: 82, height: 82, radius: 41, bgRgba: [255, 230, 0, 255], outPath: avatarPath });
    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 48, radius: 24, bgRgba: [0, 0, 0, 185], outPath: pillPath });

    const styles = [
      { name: 'HeaderName', fontName: 'Inter', bold: -1, fontSize: 36, primaryHex: pal.headerText, alignment: 7 },
      { name: 'HeaderSub', fontName: 'Inter Medium', fontSize: 24, primaryHex: pal.subText, alignment: 7 },
      { name: 'MsgIn', fontName: 'Inter Medium', fontSize: 34, primaryHex: pal.msgText, alignment: 7 },
      { name: 'MsgOut', fontName: 'Inter Medium', fontSize: 34, primaryHex: pal.outText || pal.msgText, alignment: 7 },
      { name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 26, primaryHex: '#FFFFFF', alignment: 5 }
    ];

    const dialogues = [
      { style: 'HeaderName', text: `{\\pos(156,34)}${formatMixedScriptAss(contactName, 'Inter', 'Noto Sans Devanagari Black')}` },
      { style: 'HeaderSub', text: `{\\pos(156,78)}${formatMixedScriptAss(statusText, 'Inter Medium', 'Noto Sans Devanagari Black')}` },
      { style: 'Badge', text: `{\\pos(85,68)\\fs40\\c&H000000&\\an5}${(contactName || 'B')[0].toUpperCase()}` },
      { style: 'Badge', text: `{\\pos(540,1306)}${formatMixedScriptAss(watermark)}` }
    ];

    const inputs = ['-y', '-f', 'lavfi', '-i', `color=c=${pal.bg}:s=1080x1350:d=1`, '-i', avatarPath, '-i', pillPath];
    const filters = [
      `[0:v]drawbox=x=0:y=0:w=1080:h=136:color=${pal.header}:t=fill[hdr]`,
      `[hdr][1:v]overlay=x=44:y=27[withdp]`
    ];

    let cur = '[withdp]';
    let inpIdx = 3;
    let curY = 175;

    for (let i = 0; i < Math.min(6, messages.length); i++) {
      const m = messages[i];
      const isMe = (m.sender || '').toLowerCase() === 'me';
      const lines = wrapTextLines(m.text, 28);
      const maxLineW = Math.max(...lines.map(l => measureWeightedChars(l))) * 18.5;
      const bubbleW = Math.min(760, Math.max(220, Math.round(maxLineW + 64)));
      const lineH = 44;
      const bubbleH = Math.max(78, 36 + lines.length * lineH);
      const bx = isMe ? 1080 - 44 - bubbleW : 44;

      const bubblePng = join(tmp, `bubble_${i}.png`);
      createRoundedRectPng({
        width: bubbleW,
        height: bubbleH,
        radius: 26,
        bgRgba: isMe ? pal.outBg : pal.inBg,
        outPath: bubblePng
      });

      inputs.push('-i', bubblePng);
      filters.push(`${cur}[${inpIdx}:v]overlay=x=${bx}:y=${curY}[b${i}]`);
      cur = `[b${i}]`;
      inpIdx++;

      lines.forEach((line, li) => {
        dialogues.push({
          style: isMe ? 'MsgOut' : 'MsgIn',
          text: `{\\pos(${bx + 30},${curY + 20 + li * lineH})}${formatMixedScriptAss(line, 'Inter Medium', 'Noto Sans Devanagari Black')}`
        });
      });

      curY += bubbleH + 22;
    }

    if (hasReaction && curY < 1050) {
      inputs.push('-i', reactionImagePath);
      const reactH = 1350 - curY - 30;
      filters.push(`[${inpIdx}:v]scale=992:${reactH}:force_original_aspect_ratio=increase,crop=992:${reactH}[react]`);
      filters.push(`${cur}[react]overlay=x=44:y=${curY}[withreact]`);
      cur = '[withreact]';
      inpIdx++;
    }

    writeAssFile({ outPath: assPath, width: 1080, height: 1350, styles, dialogues });

    filters.push(`${cur}[2:v]overlay=x=(W-w)/2:y=H-68[withpill]`);
    filters.push(`[withpill]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`);

    await runCmd('ffmpeg', [...inputs, '-filter_complex', filters.join('; '), '-map', '[outv]', '-frames:v', '1', out]);
  });

  const summary = messages.map(m => m.text).join(' / ').slice(0, 90);
  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { topic: contactName, hookText: summary, punchlineText: statusText, format: 'fake_chat', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    theme,
    dimensions: '1080x1350 (4:5 Fake Chat)',
    instagramSEO: seo
  };
}

/**
 * 7. NEW v3.0: 3-Panel Stacked Comic Meme (1080x1350)
 * panels: Array of 3 objects { imagePath, caption, captionColor }
 */
export async function renderThreePanelMeme({
  panels,
  watermark = '@soo_funny_memes',
  outputPath
}) {
  if (!Array.isArray(panels) || panels.length !== 3) {
    throw new Error('Exactly 3 panels are required for renderThreePanelMeme.');
  }
  for (const p of panels) {
    const img = p.imagePath || p.image_path;
    if (!img || !existsSync(img)) {
      throw new Error(`Panel image not found: ${img}`);
    }
  }

  const out = outputPath || join(STUDIO_DIR, `comic3_${Date.now()}.png`);

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'comic3.ass');
    const pillPath = join(tmp, 'wm_pill.png');

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 46, radius: 23, bgRgba: [0, 0, 0, 175], outPath: pillPath });

    const styles = [
      { name: 'PanelCap', fontName: 'Montserrat Thin Black', fontSize: 40, primaryHex: '#FFFFFF', outlineHex: '#000000', borderStyle: 1, outline: 5, shadow: 2, alignment: 2, marginL: 40, marginR: 40, marginV: 14 },
      { name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 24, primaryHex: '#FFFFFF', alignment: 5 }
    ];

    const dialogues = [
      { style: 'Badge', text: `{\\pos(${1080 - Math.round(pillW / 2) - 20},43)}${formatMixedScriptAss(watermark)}` }
    ];

    const panelH = 448;
    panels.forEach((p, idx) => {
      const cap = (p.caption || '').trim();
      if (!cap) return;
      const lines = wrapTextLines(cap, 36).join('\n');
      const bottomY = (idx + 1) * panelH - 18;
      const colorTag = p.captionColor ? `\\c${hexToAssColor(p.captionColor)}` : '';
      dialogues.push({
        style: 'PanelCap',
        text: `{\\pos(540,${bottomY})${colorTag}}${formatMixedScriptAss(lines)}`
      });
    });

    writeAssFile({ outPath: assPath, width: 1080, height: 1350, styles, dialogues });

    const inputs = [
      '-y',
      '-i', panels[0].imagePath || panels[0].image_path,
      '-i', panels[1].imagePath || panels[1].image_path,
      '-i', panels[2].imagePath || panels[2].image_path,
      '-i', pillPath
    ];

    const filterComplex = [
      `[0:v]scale=1080:448:force_original_aspect_ratio=increase,crop=1080:448[p0]`,
      `[1:v]scale=1080:448:force_original_aspect_ratio=increase,crop=1080:448[p1]`,
      `[2:v]scale=1080:448:force_original_aspect_ratio=increase,crop=1080:448[p2]`,
      `[p0][p1][p2]vstack=inputs=3,pad=1080:1350:0:0:black[stacked]`,
      `[stacked]drawbox=x=0:y=447:w=1080:h=4:color=black:t=fill,drawbox=x=0:y=895:w=1080:h=4:color=black:t=fill[borders]`,
      `[borders][3:v]overlay=x=W-w-20:y=20[withpill]`,
      `[withpill]ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`
    ].join('; ');

    await runCmd('ffmpeg', [...inputs, '-filter_complex', filterComplex, '-map', '[outv]', '-frames:v', '1', out]);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    seoParams: { hookText: panels[0].caption || '', punchlineText: panels[2].caption || '', format: '3_panel_comic', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    dimensions: '1080x1350 (4:5 3-Panel Comic)',
    instagramSEO: seo
  };
}

/**
 * 8. NEW v3.0: Instagram Reels 9:16 Video Meme Engine (1080x1920 MP4)
 * Uses FFmpeg zoompan (Ken Burns motion) + optional background audio/SFX.
 */
export async function renderReelMeme({
  imagePath,
  hookText = '',
  punchlineText = '',
  emoji = 'joy',
  watermark = '@soo_funny_memes',
  theme = 'yellow',
  audioPath = null,
  duration = 7,
  motion = 'zoom_in',
  outputPath
}) {
  if (!existsSync(imagePath)) {
    throw new Error(`Input image not found: ${imagePath}`);
  }

  const out = outputPath || join(STUDIO_DIR, `reel_${Date.now()}.mp4`);
  const emojiFile = getEmojiPath(emoji);
  const fps = 30;
  const totalFrames = Math.max(90, Math.min(450, Math.round(duration * fps))); // 3s to 15s
  const hasAudio = Boolean(audioPath && existsSync(audioPath));

  let zoomExpr = `min(zoom+0.0012,1.22)`;
  let xExpr = `(iw-iw/zoom)/2`;
  let yExpr = `(ih-ih/zoom)/2`;

  if (motion === 'zoom_out') {
    zoomExpr = `if(eq(on,1),1.22,max(zoom-0.0012,1.0))`;
  } else if (motion === 'pan_right') {
    zoomExpr = `1.18`;
    xExpr = `min(iw-iw/zoom, on*1.5)`;
  }

  await withTempDir(async tmp => {
    const assPath = join(tmp, 'reel.ass');
    const pillPath = join(tmp, 'wm_pill.png');

    const pillW = Math.min(540, Math.max(240, Math.round(measureWeightedChars(watermark) * 18 + 44)));
    createRoundedRectPng({ width: pillW, height: 50, radius: 25, bgRgba: [0, 0, 0, 185], outPath: pillPath });

    // Place meme card inside Instagram 9:16 Safe Zone (top margin 260px, height 1350px)
    const cardTopY = 260;
    const hasHeader = Boolean(hookText || punchlineText);

    let headerH = 0;
    let emojiX = 500;
    let emojiY = 300;
    const themeCfg = THEMES[theme] || THEMES.yellow;

    if (hasHeader) {
      const res = prepareHeaderAss({
        assPath,
        hookText: hookText || ' ',
        punchlineText: punchlineText || ' ',
        watermark,
        theme,
        canvasWidth: 1080,
        canvasHeight: 1920,
        headerOffsetY: cardTopY,
        watermarkY: cardTopY + 1350 - 44
      });
      headerH = res.headerH;
      emojiX = res.emojiX;
      emojiY = res.emojiY;
    } else {
      writeAssFile({
        outPath: assPath,
        width: 1080,
        height: 1920,
        styles: [{ name: 'Badge', fontName: 'Montserrat Thin Black', fontSize: 26, primaryHex: '#FFFFFF', alignment: 5 }],
        dialogues: [{ style: 'Badge', text: `{\\pos(540,1566)}${formatMixedScriptAss(watermark)}` }]
      });
    }

    const visualH = hasHeader ? (1350 - headerH) : 1350;
    const visualY = cardTopY + headerH;

    const filterParts = [
      // Ambient blurred 9:16 background from source photo
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5,eq=brightness=-0.22[bg]`,
      // Smooth Ken Burns zoompan on the meme visual
      `[0:v]scale=2160:-1,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1080x${visualH}:fps=${fps},eq=contrast=1.05:saturation=1.1[anim]`
    ];

    let canvas = '[bg]';
    if (hasHeader) {
      filterParts.push(`${canvas}drawbox=x=0:y=${cardTopY}:w=1080:h=${headerH}:color=${themeCfg.bg}:t=fill[hdrbg]`);
      canvas = '[hdrbg]';
    }

    filterParts.push(`${canvas}[anim]overlay=x=0:y=${visualY}[withanim]`);
    filterParts.push(`[withanim][2:v]overlay=x=(W-w)/2:y=${cardTopY + 1350 - 69}[withpill]`);

    let cur = '[withpill]';
    if (hasHeader && punchlineText) {
      filterParts.push(`[1:v]scale=50:50[emo]`);
      filterParts.push(`${cur}[emo]overlay=x=${emojiX}:y=${emojiY}[withemo]`);
      cur = '[withemo]';
    }

    filterParts.push(`${cur}ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(FONTS_DIR)}'[outv]`);

    const inputs = ['-y', '-i', imagePath, '-i', emojiFile, '-i', pillPath];
    if (hasAudio) {
      inputs.push('-i', audioPath);
    } else {
      inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }

    const args = [
      ...inputs,
      '-filter_complex', filterParts.join('; '),
      '-map', '[outv]',
      '-map', '3:a',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-shortest',
      '-movflags', '+faststart',
      out
    ];

    await runCmd('ffmpeg', args);
  });

  const { galleryPath, seo } = copyOutputAndSeo({
    outPath: out,
    subDir: 'Reels',
    seoParams: { hookText, punchlineText, format: 'reel', watermark }
  });

  return {
    success: true,
    outputPath: out,
    galleryPath,
    durationSeconds: duration,
    motion,
    hasCustomAudio: hasAudio,
    dimensions: '1080x1920 (9:16 Instagram Reel)',
    instagramSEO: seo
  };
}
