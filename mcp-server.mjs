#!/usr/bin/env node

import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getGoogleTrends,
  getTwitterXTrends,
  getAllIndiaTrends
} from './trend_hunter.mjs';
import {
  fetchTemplates,
  downloadTemplate
} from './template_fetcher.mjs';
import {
  renderYellowHeaderMeme,
  renderComparisonMeme,
  renderSplitMeme,
  renderCarouselMeme,
  renderTweetCardMeme,
  renderFakeChatMeme,
  renderThreePanelMeme,
  renderReelMeme
} from './renderer.mjs';
import { generateInstagramSEO } from './seo_helper.mjs';
import { publishToInstagram } from './ig_publisher.mjs';

const __filename = fileURLToPath(import.meta.url);
const STUDIO_DIR = dirname(__filename);
let PKG_VERSION = '3.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(STUDIO_DIR, 'package.json'), 'utf8'));
  PKG_VERSION = pkg.version || '3.0.0';
} catch (_) {}

const EMOJI_ENUM = [
  'joy', 'sob', 'skull', 'drool', 'smirk', 'fire', 'eyes', 'money', 'devil', 'flushed',
  'clown', 'hundred', 'mindblown', 'brokenheart', 'pointright'
];

const TOOLS = [
  {
    name: 'meme_fetch_all_trends',
    description: 'Fetch multi-source real-time Indian trends from both Google Trends (Search surges) and Twitter/X India (Trending hashtags and topics).',
    inputSchema: {
      type: 'object',
      properties: {
        limit_per_source: { type: 'number', description: 'Trends per source (default: 8, max: 20)', default: 8 }
      }
    }
  },
  {
    name: 'meme_fetch_india_trends',
    description: 'Fetch real-time trending topics and viral search queries in India from Google Trends.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of trending topics (default: 10, max: 20)' }
      }
    }
  },
  {
    name: 'meme_fetch_twitter_trends',
    description: 'Fetch real-time Twitter/X trending hashtags and topics in India (via Trends24 India).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of Twitter trends (default: 10)' }
      }
    }
  },
  {
    name: 'meme_fetch_templates',
    description: 'Search and list free viral meme templates from Memegen.link & Imgflip (no API key needed, 24h local cache).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword filter (e.g. "drake", "stonks", "fine", "doge", "shaadi")' },
        source: { type: 'string', enum: ['all', 'memegen', 'imgflip'], default: 'all' },
        limit: { type: 'number', description: 'Max templates to return (default: 15)', default: 15 }
      }
    }
  },
  {
    name: 'meme_download_template',
    description: 'Download a blank meme template image locally by template_id or url so it can be rendered with custom Hinglish/Hindi text or converted into a Reel.',
    inputSchema: {
      type: 'object',
      properties: {
        template_id: { type: 'string', description: 'Template ID from meme_fetch_templates (e.g. "memegen:drake" or "drake")' },
        url: { type: 'string', description: 'Direct HTTPS image URL of template' },
        output_path: { type: 'string', description: 'Optional local save path' }
      }
    }
  },
  {
    name: 'meme_render_yellow_header',
    description: 'Render a 1080x1350 (4:5 Instagram Portrait) header meme with Montserrat Black 900 + Devanagari Hindi auto-fallback, smart multi-line wrap, iOS 3D emoji, optional PNG logo, SEO caption, and watermark.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Absolute path of the meme photo / reaction visual' },
        hook_text: { type: 'string', description: 'Top setup / hook text line (supports English, Hinglish, and Hindi Devanagari)' },
        punchline_text: { type: 'string', description: 'Bottom punchline line' },
        emoji: { type: 'string', enum: EMOJI_ENUM, default: 'joy' },
        theme: { type: 'string', enum: ['yellow', 'dark', 'light'], default: 'yellow' },
        logo_path: { type: 'string', description: 'Optional PNG logo watermark path' },
        topic: { type: 'string', description: 'Optional topic context for Instagram SEO caption' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['image_path', 'hook_text', 'punchline_text']
    }
  },
  {
    name: 'meme_render_tweet_card',
    description: 'Render a viral 1080x1350 X/Twitter Card meme with verified badge, circular avatar, multi-line Hinglish/Hindi tweet text, engagement counters, and optional reaction photo below.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_text: { type: 'string', description: 'Main tweet punchline text (supports Hinglish & Hindi)' },
        display_name: { type: 'string', default: 'Soo Funny Memes' },
        handle: { type: 'string', default: '@soo_funny_memes' },
        avatar_path: { type: 'string', description: 'Optional circular avatar image path' },
        reaction_image_path: { type: 'string', description: 'Optional funny photo/reaction below the tweet card' },
        theme: { type: 'string', enum: ['dark', 'light'], default: 'dark' },
        verified: { type: 'boolean', default: true },
        likes: { type: 'string', default: '24.8K' },
        reposts: { type: 'string', default: '4.2K' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['tweet_text']
    }
  },
  {
    name: 'meme_render_fake_chat',
    description: 'Render a viral 1080x1350 WhatsApp / iMessage fake chat meme with authentic header, rounded message bubbles, and optional bottom reaction photo.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_name: { type: 'string', default: 'Best Friend' },
        status_text: { type: 'string', default: 'online' },
        messages: {
          type: 'array',
          description: 'Up to 6 chat bubbles',
          items: {
            type: 'object',
            properties: {
              sender: { type: 'string', enum: ['them', 'me'] },
              text: { type: 'string' }
            },
            required: ['sender', 'text']
          }
        },
        reaction_image_path: { type: 'string', description: 'Optional reaction photo below chat bubbles' },
        theme: { type: 'string', enum: ['whatsapp_dark', 'whatsapp_light', 'imessage'], default: 'whatsapp_dark' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['messages']
    }
  },
  {
    name: 'meme_render_three_panel',
    description: 'Render a 1080x1350 3-Panel Stacked Comic Dialogue Meme (like Dog & Baby 3-panel fourth-wall memes) with thick outlined comic captions.',
    inputSchema: {
      type: 'object',
      properties: {
        panels: {
          type: 'array',
          description: 'Exactly 3 panel objects in order (top, middle, bottom)',
          items: {
            type: 'object',
            properties: {
              image_path: { type: 'string' },
              caption: { type: 'string' },
              caption_color: { type: 'string', description: 'Optional hex color (e.g. "#FFE600" or "#FFFFFF")' }
            },
            required: ['image_path', 'caption']
          }
        },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['panels']
    }
  },
  {
    name: 'meme_render_reel',
    description: 'Render a 1080x1920 (9:16) Instagram Reels Video Meme (MP4) with smooth FFmpeg zoompan Ken Burns motion, optional header + emoji, and optional audio/BGM.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Absolute path of visual image' },
        hook_text: { type: 'string', description: 'Optional top header hook text' },
        punchline_text: { type: 'string', description: 'Optional punchline text' },
        emoji: { type: 'string', enum: EMOJI_ENUM, default: 'joy' },
        theme: { type: 'string', enum: ['yellow', 'dark', 'light'], default: 'yellow' },
        audio_path: { type: 'string', description: 'Optional MP3/WAV/M4A audio track path (omit for silent MP4 ready for Instagram Trending Audio)' },
        duration: { type: 'number', description: 'Duration in seconds (3 to 15, default 7)', default: 7 },
        motion: { type: 'string', enum: ['zoom_in', 'zoom_out', 'pan_right'], default: 'zoom_in' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['image_path']
    }
  },
  {
    name: 'meme_render_carousel',
    description: 'Render a 1080x1350 Multi-Slide Carousel Meme Pack (2 to 20 slides) with "1/N" badges, auto-wrap, Hindi/English support, and Instagram SEO caption.',
    inputSchema: {
      type: 'object',
      properties: {
        album_title: { type: 'string' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hook_text: { type: 'string' },
              punchline_text: { type: 'string' },
              image_path: { type: 'string' },
              emoji: { type: 'string', default: 'joy' }
            },
            required: ['hook_text', 'punchline_text', 'image_path']
          }
        },
        theme: { type: 'string', enum: ['yellow', 'dark', 'light'], default: 'yellow' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_dir: { type: 'string' }
      },
      required: ['slides']
    }
  },
  {
    name: 'meme_render_comparison',
    description: 'Render a 1080x1350 Left vs Right comparison meme with dual columns, header, labels, and watermark.',
    inputSchema: {
      type: 'object',
      properties: {
        left_image: { type: 'string' },
        right_image: { type: 'string' },
        left_label: { type: 'string' },
        right_label: { type: 'string' },
        header_title: { type: 'string' },
        emoji: { type: 'string', enum: EMOJI_ENUM, default: 'joy' },
        theme: { type: 'string', enum: ['yellow', 'dark', 'light'], default: 'yellow' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['left_image', 'right_image', 'left_label', 'right_label', 'header_title']
    }
  },
  {
    name: 'meme_render_split',
    description: 'Render a 1080x1350 Top vs Bottom split meme with thick outlined labels and watermark.',
    inputSchema: {
      type: 'object',
      properties: {
        top_image: { type: 'string' },
        bottom_image: { type: 'string' },
        top_label: { type: 'string' },
        bottom_label: { type: 'string' },
        watermark: { type: 'string', default: '@soo_funny_memes' },
        output_path: { type: 'string' }
      },
      required: ['top_image', 'bottom_image', 'top_label', 'bottom_label']
    }
  },
  {
    name: 'meme_generate_seo',
    description: 'Generate 2025-2026 Instagram-optimized DM-share trigger Hinglish caption, 3-5 targeted hashtags, alt-text SEO, and best IST posting time.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        hook_text: { type: 'string' },
        punchline_text: { type: 'string' },
        format: { type: 'string', enum: ['post', 'reel', 'carousel'], default: 'post' },
        watermark: { type: 'string', default: '@soo_funny_memes' }
      },
      required: ['hook_text']
    }
  },
  {
    name: 'meme_publish_instagram',
    description: 'Publish an IMAGE, CAROUSEL (2-10 HTTPS URLs), or REELS post directly via Official Meta Instagram Graph API v21.0 (requires IG_USER_ID, IG_ACCESS_TOKEN, and public HTTPS media URLs).',
    inputSchema: {
      type: 'object',
      properties: {
        media_type: { type: 'string', enum: ['IMAGE', 'CAROUSEL', 'REELS'], default: 'IMAGE' },
        media_url: { type: 'string', description: 'Public HTTPS URL for IMAGE or REELS' },
        carousel_urls: { type: 'array', items: { type: 'string' }, description: '2-10 public HTTPS URLs for CAROUSEL' },
        caption: { type: 'string' },
        alt_text: { type: 'string' },
        share_to_feed: { type: 'boolean', default: true }
      },
      required: ['media_type']
    }
  }
];

async function handleMcpRequest(req) {
  const { id, method, params } = req;
  const respond = result => ({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize':
      return respond({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'meme_studio_mcp', version: PKG_VERSION }
      });

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return respond({ tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        let res;
        switch (toolName) {
          case 'meme_fetch_all_trends': {
            const limit = Math.min(20, Math.max(1, args.limit_per_source || 8));
            res = await getAllIndiaTrends(limit);
            break;
          }
          case 'meme_fetch_india_trends': {
            const limit = Math.min(20, Math.max(1, args.limit || 10));
            const trends = await getGoogleTrends(limit);
            res = { count: trends.length, trends };
            break;
          }
          case 'meme_fetch_twitter_trends': {
            const limit = Math.min(20, Math.max(1, args.limit || 10));
            const trends = await getTwitterXTrends(limit);
            res = { count: trends.length, trends };
            break;
          }
          case 'meme_fetch_templates': {
            res = await fetchTemplates({
              query: args.query || '',
              source: args.source || 'all',
              limit: Math.min(50, Math.max(1, args.limit || 15))
            });
            break;
          }
          case 'meme_download_template': {
            res = await downloadTemplate({
              templateId: args.template_id,
              url: args.url,
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_yellow_header': {
            res = await renderYellowHeaderMeme({
              imagePath: args.image_path,
              hookText: args.hook_text,
              punchlineText: args.punchline_text,
              emoji: args.emoji || 'joy',
              theme: args.theme || 'yellow',
              logoPath: args.logo_path || null,
              topic: args.topic || '',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_tweet_card': {
            res = await renderTweetCardMeme({
              tweetText: args.tweet_text,
              displayName: args.display_name || 'Soo Funny Memes',
              handle: args.handle || '@soo_funny_memes',
              avatarPath: args.avatar_path || null,
              reactionImagePath: args.reaction_image_path || null,
              theme: args.theme || 'dark',
              verified: args.verified !== false,
              likes: args.likes || '24.8K',
              reposts: args.reposts || '4.2K',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_fake_chat': {
            res = await renderFakeChatMeme({
              contactName: args.contact_name || 'Best Friend',
              statusText: args.status_text || 'online',
              messages: args.messages,
              reactionImagePath: args.reaction_image_path || null,
              theme: args.theme || 'whatsapp_dark',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_three_panel': {
            const panels = (args.panels || []).map(p => ({
              imagePath: p.image_path || p.imagePath,
              caption: p.caption,
              captionColor: p.caption_color || p.captionColor
            }));
            res = await renderThreePanelMeme({
              panels,
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_reel': {
            res = await renderReelMeme({
              imagePath: args.image_path,
              hookText: args.hook_text || '',
              punchlineText: args.punchline_text || '',
              emoji: args.emoji || 'joy',
              theme: args.theme || 'yellow',
              audioPath: args.audio_path || null,
              duration: args.duration || 7,
              motion: args.motion || 'zoom_in',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_carousel': {
            res = await renderCarouselMeme({
              slides: args.slides,
              albumTitle: args.album_title,
              theme: args.theme || 'yellow',
              watermark: args.watermark || '@soo_funny_memes',
              outputDir: args.output_dir
            });
            break;
          }
          case 'meme_render_comparison': {
            res = await renderComparisonMeme({
              leftImg: args.left_image,
              rightImg: args.right_image,
              leftLabel: args.left_label,
              rightLabel: args.right_label,
              headerTitle: args.header_title,
              emoji: args.emoji || 'joy',
              theme: args.theme || 'yellow',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_split': {
            res = await renderSplitMeme({
              topImg: args.top_image,
              bottomImg: args.bottom_image,
              topLabel: args.top_label,
              bottomLabel: args.bottom_label,
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_generate_seo': {
            res = generateInstagramSEO({
              topic: args.topic || '',
              hookText: args.hook_text || '',
              punchlineText: args.punchline_text || '',
              format: args.format || 'post',
              watermark: args.watermark || '@soo_funny_memes'
            });
            break;
          }
          case 'meme_publish_instagram': {
            res = await publishToInstagram({
              mediaType: args.media_type || 'IMAGE',
              mediaUrl: args.media_url,
              carouselUrls: args.carousel_urls || [],
              caption: args.caption || '',
              altText: args.alt_text || '',
              shareToFeed: args.share_to_feed !== false
            });
            break;
          }
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return respond({
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
        });
      } catch (err) {
        return respond({
          isError: true,
          content: [{ type: 'text', text: `Error: ${err.message}` }]
        });
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    continue;
  }

  Promise.resolve()
    .then(() => handleMcpRequest(request))
    .then(value => {
      if (value) process.stdout.write(JSON.stringify(value) + '\n');
    }, error => {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: error.message } }) + '\n');
    });
}
