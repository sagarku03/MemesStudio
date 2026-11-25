import https from 'node:https';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

function graphRequest(method, path, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const urlStr = method === 'GET' ? `${GRAPH_BASE}${path}?${query}` : `${GRAPH_BASE}${path}`;
    const url = new URL(urlStr);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400 || json.error) {
            return reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${data}`));
          }
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    if (method === 'POST') req.write(query);
    req.end();
  });
}

async function waitForContainerReady(containerId, accessToken, maxAttempts = 20, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await graphRequest('GET', `/${containerId}`, {
      fields: 'status_code,status',
      access_token: accessToken
    });
    if (status.status_code === 'FINISHED') return status;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram container failed: ${status.status_code} (${status.status || 'unknown'})`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Instagram container ${containerId} to finish processing.`);
}

/**
 * Publish an Image, Carousel (max 10 items), or Reel to Instagram via Official Meta Graph API.
 * Requires public HTTPS URLs (Instagram cURLs media from public URLs) + IG_USER_ID + IG_ACCESS_TOKEN.
 */
export async function publishToInstagram({
  mediaType = 'IMAGE',
  mediaUrl,
  carouselUrls = [],
  caption = '',
  altText = '',
  shareToFeed = true,
  igUserId = process.env.IG_USER_ID,
  accessToken = process.env.IG_ACCESS_TOKEN
}) {
  if (!igUserId || !accessToken) {
    return {
      success: false,
      configured: false,
      message: 'Instagram Graph API credentials missing. Set IG_USER_ID and IG_ACCESS_TOKEN environment variables (or pass them directly).',
      setupSteps: [
        '1. Convert Instagram account (@soo_funny_memes) to Professional/Creator and link a Facebook Page.',
        '2. Create a Meta Developer App with instagram_basic & instagram_content_publish permissions.',
        '3. Set IG_USER_ID and long-lived IG_ACCESS_TOKEN in ~/.gemini/config/mcp_config.json env.',
        '4. Host generated meme on a public HTTPS URL (Graph API requires public HTTPS URLs).'
      ]
    };
  }

  const type = mediaType.toUpperCase();
  const validateHttps = u => typeof u === 'string' && u.startsWith('https://');

  if (type === 'CAROUSEL') {
    if (!Array.isArray(carouselUrls) || carouselUrls.length < 2 || carouselUrls.length > 10) {
      throw new Error('Instagram Graph API requires 2 to 10 public HTTPS URLs for CAROUSEL publishing.');
    }
    if (!carouselUrls.every(validateHttps)) {
      throw new Error('All carouselUrls must be publicly accessible https:// URLs.');
    }
  } else if (!validateHttps(mediaUrl)) {
    throw new Error('media_url must be a publicly accessible https:// URL for Instagram Graph API.');
  }

  // 1. Check 24h rate limit headroom before creating containers
  const limitInfo = await graphRequest('GET', `/${igUserId}/content_publishing_limit`, {
    fields: 'quota_usage,config',
    access_token: accessToken
  });

  let creationId;

  if (type === 'IMAGE') {
    const params = { image_url: mediaUrl, caption, access_token: accessToken };
    if (altText) params.alt_text = altText;
    const container = await graphRequest('POST', `/${igUserId}/media`, params);
    creationId = container.id;
  } else if (type === 'REELS') {
    const container = await graphRequest('POST', `/${igUserId}/media`, {
      media_type: 'REELS',
      video_url: mediaUrl,
      caption,
      share_to_feed: shareToFeed ? 'true' : 'false',
      access_token: accessToken
    });
    creationId = container.id;
    await waitForContainerReady(creationId, accessToken);
  } else if (type === 'CAROUSEL') {
    const childIds = [];
    for (const slideUrl of carouselUrls) {
      const isVideo = /\.(mp4|mov)(?:[?#]|$)/i.test(slideUrl);
      const childParams = isVideo
        ? { media_type: 'VIDEO', video_url: slideUrl, is_carousel_item: 'true', access_token: accessToken }
        : { image_url: slideUrl, is_carousel_item: 'true', access_token: accessToken };
      const child = await graphRequest('POST', `/${igUserId}/media`, childParams);
      if (isVideo) await waitForContainerReady(child.id, accessToken);
      childIds.push(child.id);
    }

    const parent = await graphRequest('POST', `/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: accessToken
    });
    creationId = parent.id;
    await waitForContainerReady(creationId, accessToken, 10, 2000);
  } else {
    throw new Error(`Unsupported mediaType: ${mediaType}. Use IMAGE, CAROUSEL, or REELS.`);
  }

  // 2. Publish the container
  const published = await graphRequest('POST', `/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken
  });

  return {
    success: true,
    configured: true,
    mediaType: type,
    mediaId: published.id,
    publishingQuota: limitInfo.data?.[0] || limitInfo
  };
}
