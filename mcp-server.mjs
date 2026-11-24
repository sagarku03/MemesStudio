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
  renderYellowHeaderMeme,
  renderComparisonMeme,
  renderSplitMeme,
  renderCarouselMeme
} from './renderer.mjs';

const __filename = fileURLToPath(import.meta.url);
const STUDIO_DIR = dirname(__filename);
let PKG_VERSION = '2.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(STUDIO_DIR, 'package.json'), 'utf8'));
  PKG_VERSION = pkg.version || '2.0.0';
} catch (_) {}

const TOOLS = [
  {
    name: 'meme_fetch_all_trends',
    description: 'Fetch multi-source real-time Indian trends from both Google Trends (Search surges) and Twitter/X India (Trending hashtags and topics). Returns ranked, structured topics with source tags.',
    inputSchema: {
      type: 'object',
      properties: {
        limit_per_source: {
          type: 'number',
          description: 'Number of trending topics per source (default: 8, max: 20)',
          default: 8
        }
      }
    }
  },
  {
    name: 'meme_fetch_india_trends',
    description: 'Fetch real-time trending topics and viral search queries in India from Google Trends. Returns ranked topics, search traffic, and descriptions.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of trending topics to return (default: 10, max: 20)'
        }
      }
    }
  },
  {
    name: 'meme_fetch_twitter_trends',
    description: 'Fetch real-time Twitter/X trending hashtags and topics in India (via Trends24 India).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of Twitter trends to return (default: 10)'
        }
      }
    }
  },
  {
    name: 'meme_render_yellow_header',
    description: 'Render a 1080x1350 (4:5 Instagram Portrait) viral yellow-header meme using Montserrat-Black 900 typography, dual-color contrast (Black hook + Crimson red punchline), Apple 3D emoji, and watermark in 0.5s.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Absolute path of the meme photo / reaction visual'
        },
        hook_text: {
          type: 'string',
          description: 'Top setup / hook text line (e.g. "Gali Mein Jab Naya Kutta Aa Jaye")'
        },
        punchline_text: {
          type: 'string',
          description: 'Bottom punchline line (e.g. "Mohalle Ka Billu Don")'
        },
        emoji: {
          type: 'string',
          description: 'Emoji name: joy (😂), sob (😭), skull (💀), drool (🤤), smirk (😏), fire (🔥), eyes (👀), money (💸), devil (😈), flushed (😳)',
          enum: ['joy', 'sob', 'skull', 'drool', 'smirk', 'fire', 'eyes', 'money', 'devil', 'flushed'],
          default: 'joy'
        },
        watermark: {
          type: 'string',
          description: 'Watermark handle badge (default: "@soo_funny_memes")',
          default: '@soo_funny_memes'
        },
        output_path: {
          type: 'string',
          description: 'Optional custom output file path'
        }
      },
      required: ['image_path', 'hook_text', 'punchline_text']
    }
  },
  {
    name: 'meme_render_carousel',
    description: 'Render a 1080x1350 Multi-Slide Carousel Meme Pack (e.g., 5 Types of Friends, Engineering Life in 5 Slides, Shaadi Reality). Creates numbered slides with "1/N 👉" badges and auto-saves to /sdcard/Download/Memes/Carousels/.',
    inputSchema: {
      type: 'object',
      properties: {
        album_title: {
          type: 'string',
          description: 'Title for the carousel folder (e.g. "5_types_of_friends")'
        },
        slides: {
          type: 'array',
          description: 'List of slide objects (minimum 2 slides, recommended 4-7 slides)',
          items: {
            type: 'object',
            properties: {
              hook_text: { type: 'string', description: 'Top hook line' },
              punchline_text: { type: 'string', description: 'Bottom punchline' },
              image_path: { type: 'string', description: 'Absolute path to slide visual' },
              emoji: { type: 'string', description: 'Emoji name (default: joy)', default: 'joy' }
            },
            required: ['hook_text', 'punchline_text', 'image_path']
          }
        },
        watermark: {
          type: 'string',
          description: 'Watermark handle (default: "@soo_funny_memes")',
          default: '@soo_funny_memes'
        },
        output_dir: {
          type: 'string',
          description: 'Optional target directory'
        }
      },
      required: ['slides']
    }
  },
  {
    name: 'meme_render_comparison',
    description: 'Render a 1080x1350 Left vs Right comparison meme (e.g. Bachpan vs Jawani, Bhai vs She, Fake vs Real) with dual columns, yellow top bar, labels, and watermark.',
    inputSchema: {
      type: 'object',
      properties: {
        left_image: { type: 'string', description: 'Absolute path of the left image' },
        right_image: { type: 'string', description: 'Absolute path of the right image' },
        left_label: { type: 'string', description: 'Label above left image' },
        right_label: { type: 'string', description: 'Label above right image' },
        header_title: { type: 'string', description: 'Main yellow header title' },
        emoji: { type: 'string', description: 'Emoji for header (default: joy)', default: 'joy' },
        watermark: { type: 'string', description: 'Watermark handle', default: '@soo_funny_memes' },
        output_path: { type: 'string', description: 'Optional output path' }
      },
      required: ['left_image', 'right_image', 'left_label', 'right_label', 'header_title']
    }
  },
  {
    name: 'meme_render_split',
    description: 'Render a 1080x1350 Top vs Bottom comparison meme (e.g. Boys in text vs When you meet them) with two horizontal blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        top_image: { type: 'string', description: 'Absolute path of top image' },
        bottom_image: { type: 'string', description: 'Absolute path of bottom image' },
        top_label: { type: 'string', description: 'Overlay text for top image' },
        bottom_label: { type: 'string', description: 'Overlay text for bottom image' },
        watermark: { type: 'string', description: 'Watermark handle', default: '@soo_funny_memes' },
        output_path: { type: 'string', description: 'Optional output path' }
      },
      required: ['top_image', 'bottom_image', 'top_label', 'bottom_label']
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
          case 'meme_render_yellow_header': {
            res = await renderYellowHeaderMeme({
              imagePath: args.image_path,
              hookText: args.hook_text,
              punchlineText: args.punchline_text,
              emoji: args.emoji || 'joy',
              watermark: args.watermark || '@soo_funny_memes',
              outputPath: args.output_path
            });
            break;
          }
          case 'meme_render_carousel': {
            res = await renderCarouselMeme({
              slides: args.slides,
              albumTitle: args.album_title,
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

// Stdio JSON-RPC Loop
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
