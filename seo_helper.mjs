import { writeFileSync } from 'node:fs';

const HASHTAG_BANK = {
  corporate: ['#corporatememes', '#indianmemes', '#officehumor', '#wfhlife'],
  college: ['#engineeringmemes', '#collegelife', '#indianstudents', '#backbenchers'],
  finance: ['#stockmarketindia', '#middleclass', '#desimemes', '#indianmemes'],
  relationship: ['#indianmemes', '#singlelife', '#desihumor', '#relatablememes'],
  cricket: ['#cricketmemes', '#indiancricket', '#desimemes', '#indianmemes'],
  desi_humor: ['#indianmemes', '#desimemes', '#hindimemes', '#relatablememes']
};

const SHARE_HOOKS = [
  'Us dost ko bhejo jiski shakal yaad aayi 😂👇',
  'Group chat me forward karo bina kuch bole 💀',
  'Sahi baat hai ki nahi? Comment me batao 👀',
  'Apne best friend ko tag karo jo bilkul aisa hai 😂',
  'Save kar lo baad me kaam aayega 📌'
];

/**
 * Generate 2025-2026 Instagram-optimized SEO caption, alt-text, and 3-5 targeted hashtags.
 * Avoids 20+ generic hashtag spam which hurts modern Instagram reach.
 */
export function generateInstagramSEO({
  topic = '',
  hookText = '',
  punchlineText = '',
  niche = 'desi_humor',
  format = 'post',
  watermark = '@soo_funny_memes',
  saveSidecarPath = null
} = {}) {
  const combined = `${topic} ${hookText} ${punchlineText}`.toLowerCase();

  let detectedNiche = niche;
  if (/office|monday|salary|corporate|boss|meeting|wfh|appraisal/.test(combined)) detectedNiche = 'corporate';
  else if (/exam|college|degree|teacher|school|backbencher|hostel/.test(combined)) detectedNiche = 'college';
  else if (/sensex|nifty|share|market|gold|tax|cashback|paisa|rupee/.test(combined)) detectedNiche = 'finance';
  else if (/gf|bf|shaadi|crush|rishta|pyaar|single|boys|girls/.test(combined)) detectedNiche = 'relationship';
  else if (/cricket|ipl|match|virat|rohit|dhoni|batting|wicket/.test(combined)) detectedNiche = 'cricket';

  const baseTags = HASHTAG_BANK[detectedNiche] || HASHTAG_BANK.desi_humor;
  const pageTag = `#${watermark.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '')}`;
  // Strictly 4-5 targeted hashtags per 2025-2026 algorithm best practices
  const hashtags = [...new Set([...baseTags.slice(0, 4), pageTag])].slice(0, 5);

  const hookIdx = Math.abs((hookText.length + punchlineText.length) % SHARE_HOOKS.length);
  const shareTrigger = SHARE_HOOKS[hookIdx];

  const caption = [
    `${shareTrigger}`,
    topic ? `Topic: ${topic}` : '',
    `Follow ${watermark} for daily desi humor 🔥`,
    '',
    hashtags.join(' ')
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const altText = `Indian Hinglish meme by ${watermark}: "${hookText} - ${punchlineText}". Relatable ${detectedNiche.replace('_', ' ')} humor.`;

  const seo = {
    niche: detectedNiche,
    format,
    caption,
    hashtags,
    hashtagCount: hashtags.length,
    altText,
    bestPostingWindowsIST: ['12:30 PM - 02:00 PM', '07:30 PM - 09:30 PM'],
    reelAudioTip: format === 'reel'
      ? 'Attach an Instagram Trending Arrow (↗) audio at 2-5% volume or ironic comedy SFX for max loop discovery.'
      : 'Use 4:5 portrait or carousel swipe hooks to maximize Sends per Reach (DM shares).'
  };

  if (saveSidecarPath) {
    try {
      const txt = [
        '=== INSTAGRAM CAPTION (COPY-PASTE) ===',
        seo.caption,
        '',
        '=== ALT TEXT (ACCESSIBILITY & SEARCH SEO) ===',
        seo.altText,
        '',
        `=== BEST POSTING TIME (IST): ${seo.bestPostingWindowsIST.join(' | ')} ===`,
        `TIP: ${seo.reelAudioTip}`
      ].join('\n');
      writeFileSync(saveSidecarPath, txt, 'utf8');
      seo.captionFile = saveSidecarPath;
    } catch (_) {}
  }

  return seo;
}
