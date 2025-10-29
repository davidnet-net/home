import type { RequestHandler } from './$types';

interface CacheEntry {
  timestamp: number;
  data: any;
}

// Simple in-memory cache keyed by "lat,lon"
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export const GET: RequestHandler = async ({ url }) => {
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) return new Response("Missing lat/lon", { status: 400 });

  const key = `${lat},${lon}`;
  const now = Date.now();

  // Serve from cache if available
  if (cache.has(key)) {
    const entry = cache.get(key)!;
    if (now - entry.timestamp < CACHE_DURATION) {
      return new Response(JSON.stringify(entry.data), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Fetch fresh data from Met.no
  try {
    const res = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
      {
        headers: {
          'User-Agent': 'Davidnet Hobby project/1.0 contact@davidnet.net'
        }
      }
    );

    if (!res.ok) throw new Error('Failed to fetch weather');

    const data = await res.json();

    // Save to cache
    cache.set(key, { timestamp: now, data });

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response('Failed to fetch weather', { status: 500 });
  }
};
