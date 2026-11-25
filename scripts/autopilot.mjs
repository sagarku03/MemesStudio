#!/usr/bin/env node

import { getAllIndiaTrends } from '../trend_hunter.mjs';
import { fetchTemplates, downloadTemplate } from '../template_fetcher.mjs';
import { renderYellowHeaderMeme, renderReelMeme } from '../renderer.mjs';

const SENSITIVE_RE = /earthquake|death|dead|killed|murder|suicide|accident|flood|crash|terror|attack|rape|war|bomb|disaster|died/i;

function pickSafeTrend(trendsObj) {
  const pool = [
    ...(trendsObj.googleTrends || []).map(t => ({ ...t, source: 'Google Trends' })),
    ...(trendsObj.twitterXTrends || []).map(t => ({ ...t, source: 'Twitter/X India' }))
  ];

  for (const item of pool) {
    if (item.topic && !SENSITIVE_RE.test(item.topic)) {
      return item;
    }
  }
  return { topic: 'Monday Corporate Life', source: 'Evergreen Desi' };
}

function buildMemeCopyForTrend(topic) {
  const lower = topic.toLowerCase();
  if (/gold|sona|silver|rate|sensex|nifty|stock|market/.test(lower)) {
    return {
      query: 'stonks',
      hookText: `${topic} Dekhne Ke Baad`,
      punchlineText: 'Middle Class Banda With 500rs',
      emoji: 'money'
    };
  }
  if (/ai|tech|nvidia|spacex|apple|iphone|google|chatgpt/.test(lower)) {
    return {
      query: 'brain',
      hookText: `${topic} Trend Dekh Kar`,
      punchlineText: 'Engineers Tension Mein Aa Gaye',
      emoji: 'mindblown'
    };
  }
  if (/cricket|ipl|match|cup|trophy|kohli|rohit/.test(lower)) {
    return {
      query: 'fine',
      hookText: `${topic} Match Ke Time`,
      punchlineText: 'Pura Ghar Stadium Ban Jata Hai',
      emoji: 'fire'
    };
  }
  return {
    query: 'drake',
    hookText: `Trending Topic: ${topic.slice(0, 28)}`,
    punchlineText: 'Desi Memers Ready Ho Jao',
    emoji: 'joy'
  };
}

async function runAutopilot() {
  console.log('\n🤖 MemesStudio v3.0 Daily Autopilot Started...\n');

  const trends = await getAllIndiaTrends(8);
  const picked = pickSafeTrend(trends);
  console.log(`🔥 Selected Safe Live Trend (${picked.source}): ${picked.topic}`);

  const copy = buildMemeCopyForTrend(picked.topic);
  const { templates } = await fetchTemplates({ query: copy.query, limit: 5 });
  const chosenTemplate = templates[0] || (await fetchTemplates({ limit: 5 })).templates[0];

  if (!chosenTemplate) {
    throw new Error('Could not fetch any template from Memegen/Imgflip.');
  }

  console.log(`🎭 Using Template: ${chosenTemplate.name} (${chosenTemplate.source})`);
  const dl = await downloadTemplate({ url: chosenTemplate.blankUrl, templateId: chosenTemplate.shortId });

  const postRes = await renderYellowHeaderMeme({
    imagePath: dl.templatePath,
    hookText: copy.hookText,
    punchlineText: copy.punchlineText,
    emoji: copy.emoji,
    topic: picked.topic,
    watermark: '@soo_funny_memes'
  });

  const reelRes = await renderReelMeme({
    imagePath: dl.templatePath,
    hookText: copy.hookText,
    punchlineText: copy.punchlineText,
    emoji: copy.emoji,
    watermark: '@soo_funny_memes',
    duration: 6,
    motion: 'zoom_in'
  });

  console.log('\n✅ Autopilot Generation Complete!');
  console.log('📸 Instagram 4:5 Post :', postRes.galleryPath);
  console.log('🎬 Instagram 9:16 Reel:', reelRes.galleryPath);
  console.log('\n📝 Ready-to-Copy Caption:\n' + postRes.instagramSEO.caption + '\n');
}

runAutopilot().catch(err => {
  console.error('❌ Autopilot failed:', err.message);
  process.exit(1);
});
