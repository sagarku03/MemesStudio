import https from 'node:https';

function fetchHttps(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers
        }
      },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }
    ).on('error', reject);
  });
}

/**
 * 1. Fetch Real-time Google Trends India
 */
export async function getGoogleTrends(limit = 10) {
  try {
    const rawData = await fetchHttps('https://trends.google.com/trending/rss?geo=IN');
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(rawData)) !== null) {
      const itemBlock = match[1];
      const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/);
      const trafficMatch = itemBlock.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
      const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/);

      if (titleMatch) {
        const title = titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const traffic = trafficMatch ? trafficMatch[1].trim() : 'N/A';
        const description = descMatch
          ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim()
          : '';

        items.push({
          source: 'Google Trends India',
          topic: title,
          traffic,
          snippet: description.slice(0, 150)
        });

        if (items.length >= limit) break;
      }
    }
    return items;
  } catch (err) {
    console.error('Error fetching Google trends:', err.message);
    return [];
  }
}

/**
 * 2. Fetch Real-time Twitter / X India Trends (via Trends24)
 */
export async function getTwitterXTrends(limit = 10) {
  try {
    const rawHtml = await fetchHttps('https://trends24.in/india/');
    const matches = [
      ...rawHtml.matchAll(
        /<a[^>]+href="[^"]*(?:\/trend\/|twitter\.com\/search)[^"]*"[^>]*>([^<]+)<\/a>/gi
      )
    ]
      .map(m => m[1].trim())
      .filter(t => t.length > 2);

    // Deduplicate
    const unique = [...new Set(matches)];
    return unique.slice(0, limit).map((topic, i) => ({
      source: 'Twitter/X India',
      rank: i + 1,
      topic,
      isHashtag: topic.startsWith('#')
    }));
  } catch (err) {
    console.error('Error fetching Twitter/X trends:', err.message);
    return [];
  }
}

/**
 * 3. Unified Multi-Source Trend Hunter
 */
export async function getAllIndiaTrends(limitPerSource = 8) {
  const [googleTrends, twitterTrends] = await Promise.all([
    getGoogleTrends(limitPerSource),
    getTwitterXTrends(limitPerSource)
  ]);

  return {
    timestamp: new Date().toISOString(),
    totalFound: googleTrends.length + twitterTrends.length,
    googleTrends,
    twitterXTrends: twitterTrends
  };
}
