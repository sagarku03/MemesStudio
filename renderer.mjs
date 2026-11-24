import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const STUDIO_DIR = '/data/user/0/com.termux/files/home/.gemini/meme-studio';
const FONT_MONTSERRAT = join(STUDIO_DIR, 'assets/fonts/Montserrat-Black.ttf');
const EMOJI_DIR = join(STUDIO_DIR, 'assets/emojis');
const DOWNLOAD_DIR = '/sdcard/Download/Memes';

if (!existsSync(DOWNLOAD_DIR)) {
  try { mkdirSync(DOWNLOAD_DIR, { recursive: true }); } catch (_) {}
}

function escapeFfmpegText(str) {
  if (!str) return '';
  return str
    .replace(/👉|➡️|▶️/g, '->')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

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

function getEmojiPath(emojiName) {
  const clean = (emojiName || 'joy').toLowerCase().replace(/[^a-z]/g, '');
  const p = join(EMOJI_DIR, `${clean}.png`);
  return existsSync(p) ? p : join(EMOJI_DIR, 'joy.png');
}

/**
 * 1. Classic Yellow Header Instagram Meme (1080x1350)
 */
export async function renderYellowHeaderMeme({
  imagePath,
  hookText,
  punchlineText,
  emoji = 'joy',
  watermark = '@soo_funny_memes',
  outputPath
}) {
  if (!existsSync(imagePath)) {
    throw new Error(`Input image not found: ${imagePath}`);
  }

  const out = outputPath || join(STUDIO_DIR, `meme_${Date.now()}.png`);
  const emojiFile = getEmojiPath(emoji);

  const escHook = escapeFfmpegText(hookText);
  const escPunch = escapeFfmpegText(punchlineText);
  const escWatermark = escapeFfmpegText(watermark);

  // Approximate punchline text width to position emoji with 12px gap
  const charWidth = 24;
  const punchLen = punchlineText.length * charWidth;
  const emojiX = Math.min(1000, Math.round((1080 + punchLen) / 2 + 10));

  const filterComplex = [
    `[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,eq=contrast=1.05:saturation=1.1,pad=1080:1350:0:270:color=0xFFE600[base]`,
    `[1:v]scale=50:50[emo]`,
    `[base]drawbox=x=0:y=270:w=1080:h=2:color=0x222222@0.35:t=fill[bordered]`,
    `[bordered]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escHook}':fontcolor=0x000000:fontsize=46:x=(w-text_w)/2:y=75[t1]`,
    `[t1]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escPunch} \\:':fontcolor=0xD32F2F:fontsize=46:x=(w-text_w-65)/2:y=155[t2]`,
    `[t2][emo]overlay=x=${emojiX}:y=152[withemo]`,
    `[withemo]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escWatermark}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.7:boxborderw=12[outv]`
  ].join('; ');

  const args = [
    '-y',
    '-i', imagePath,
    '-i', emojiFile,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-frames:v', '1',
    out
  ];

  await runCmd('ffmpeg', args);

  // Copy to gallery download
  try {
    const galleryTarget = join(DOWNLOAD_DIR, basename(out));
    copyFileSync(out, galleryTarget);
  } catch (_) {}

  return {
    success: true,
    outputPath: out,
    galleryPath: join(DOWNLOAD_DIR, basename(out)),
    dimensions: '1080x1350 (4:5 Portrait)'
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
  outputPath
}) {
  if (!existsSync(leftImg) || !existsSync(rightImg)) {
    throw new Error('Both left and right images must exist.');
  }

  const out = outputPath || join(STUDIO_DIR, `comparison_${Date.now()}.png`);
  const emojiFile = getEmojiPath(emoji);

  const escTitle = escapeFfmpegText(headerTitle);
  const escLeft = escapeFfmpegText(leftLabel);
  const escRight = escapeFfmpegText(rightLabel);
  const escWatermark = escapeFfmpegText(watermark);

  const filterComplex = [
    `[0:v]scale=538:1080:force_original_aspect_ratio=increase,crop=538:1080[left]`,
    `[1:v]scale=538:1080:force_original_aspect_ratio=increase,crop=538:1080[right]`,
    `[left][right]hstack=inputs=2[images]`,
    `[images]pad=1080:1350:0:270:color=0xFFE600[base]`,
    `[base]drawbox=x=0:y=270:w=1080:h=2:color=0x222222@0.4:t=fill[bordered]`,
    `[bordered]drawbox=x=538:y=270:w=4:h=1080:color=0x111111:t=fill[splitline]`,
    `[splitline]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escTitle}':fontcolor=0x000000:fontsize=48:x=(w-text_w-65)/2:y=100[t1]`,
    `[2:v]scale=52:52[emo]`,
    `[t1][emo]overlay=x=(1080+${escTitle.length * 24})/2+10:y=98[titler]`,
    `[titler]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escLeft}':fontcolor=0x000000:fontsize=36:x=269-(text_w/2):y=195[withleft]`,
    `[withleft]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escRight}':fontcolor=0xD32F2F:fontsize=36:x=809-(text_w/2):y=195[withboth]`,
    `[withboth]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escWatermark}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.7:boxborderw=12[outv]`
  ].join('; ');

  const args = [
    '-y',
    '-i', leftImg,
    '-i', rightImg,
    '-i', emojiFile,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-frames:v', '1',
    out
  ];

  await runCmd('ffmpeg', args);

  try {
    const galleryTarget = join(DOWNLOAD_DIR, basename(out));
    copyFileSync(out, galleryTarget);
  } catch (_) {}

  return {
    success: true,
    outputPath: out,
    galleryPath: join(DOWNLOAD_DIR, basename(out)),
    dimensions: '1080x1350 (4:5 Comparison)'
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

  const escTop = escapeFfmpegText(topLabel);
  const escBottom = escapeFfmpegText(bottomLabel);
  const escWatermark = escapeFfmpegText(watermark);

  const filterComplex = [
    `[0:v]scale=1080:673:force_original_aspect_ratio=increase,crop=1080:673[top]`,
    `[1:v]scale=1080:673:force_original_aspect_ratio=increase,crop=1080:673[bottom]`,
    `[top][bottom]vstack=inputs=2[combined]`,
    `[combined]drawbox=x=0:y=673:w=1080:h=4:color=black:t=fill[seam]`,
    `[seam]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escTop}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=600:box=1:boxcolor=black@0.65:boxborderw=10[t1]`,
    `[t1]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escBottom}':fontcolor=0xFFE600:fontsize=46:x=(w-text_w)/2:y=1270:box=1:boxcolor=black@0.65:boxborderw=10[t2]`,
    `[t2]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escWatermark}':fontcolor=white:fontsize=28:x=w-text_w-30:y=30:box=1:boxcolor=black@0.6:boxborderw=8[outv]`
  ].join('; ');

  const args = [
    '-y',
    '-i', topImg,
    '-i', bottomImg,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-frames:v', '1',
    out
  ];

  await runCmd('ffmpeg', args);

  try {
    const galleryTarget = join(DOWNLOAD_DIR, basename(out));
    copyFileSync(out, galleryTarget);
  } catch (_) {}

  return {
    success: true,
    outputPath: out,
    galleryPath: join(DOWNLOAD_DIR, basename(out)),
    dimensions: '1080x1350 (4:5 Top-Bottom)'
  };
}

/**
 * 4. Multi-Slide Carousel Meme Pack (1080x1350 per slide)
 * slides: Array of { hookText, punchlineText, imagePath, emoji }
 */
export async function renderCarouselMeme({
  slides,
  albumTitle,
  watermark = '@soo_funny_memes',
  outputDir
}) {
  if (!slides || !Array.isArray(slides) || slides.length < 2) {
    throw new Error('A carousel meme must have at least 2 slides.');
  }

  const timestamp = Date.now();
  const folderName = `Carousel_${albumTitle ? albumTitle.replace(/[^a-zA-Z0-9_-]/g, '_') : timestamp}`;
  const targetDir = outputDir || join(STUDIO_DIR, folderName);
  const galleryTargetDir = join(DOWNLOAD_DIR, 'Carousels', folderName);

  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  if (!existsSync(galleryTargetDir)) mkdirSync(galleryTargetDir, { recursive: true });

  const total = slides.length;
  const renderedSlides = [];

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
    const escHook = escapeFfmpegText(hookText);
    const escPunch = escapeFfmpegText(punchlineText);
    const escWatermark = escapeFfmpegText(watermark);

    const charWidth = 24;
    const punchLen = punchlineText.length * charWidth;
    const emojiX = Math.min(1000, Math.round((1080 + punchLen) / 2 + 10));

    const filterComplex = [
      `[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,eq=contrast=1.05:saturation=1.1,pad=1080:1350:0:270:color=0xFFE600[base]`,
      `[1:v]scale=50:50[emo]`,
      `[base]drawbox=x=0:y=270:w=1080:h=2:color=0x222222@0.35:t=fill[bordered]`,
      `[bordered]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escHook}':fontcolor=0x000000:fontsize=46:x=(w-text_w)/2:y=75[t1]`,
      `[t1]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escPunch} \\:':fontcolor=0xD32F2F:fontsize=46:x=(w-text_w-65)/2:y=155[t2]`,
      `[t2][emo]overlay=x=${emojiX}:y=152[withemo]`,
      `[withemo]drawtext=fontfile=${FONT_MONTSERRAT}:text='${slideNum}\\/${total}':fontcolor=white:fontsize=24:x=w-text_w-30:y=30:box=1:boxcolor=black@0.75:boxborderw=8[withbadge]`,
      `[withbadge]drawtext=fontfile=${FONT_MONTSERRAT}:text='${escWatermark}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.7:boxborderw=12[outv]`
    ].join('; ');

    const args = [
      '-y',
      '-i', imagePath,
      '-i', emojiFile,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-frames:v', '1',
      slideOut
    ];

    await runCmd('ffmpeg', args);

    const galleryFile = join(galleryTargetDir, slideFileName);
    try { copyFileSync(slideOut, galleryFile); } catch (_) {}

    renderedSlides.push({
      slide: slideNum,
      filePath: slideOut,
      galleryPath: galleryFile
    });
  }

  return {
    success: true,
    albumTitle,
    totalSlides: total,
    folderPath: targetDir,
    galleryFolder: galleryTargetDir,
    slides: renderedSlides
  };
}
