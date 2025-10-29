import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

const STATUS_PAGE_SLUG = 'davidnet'; // your published slug
const STATUS_PAGE_URL = 'https://uptimekuma.davidnet.net/api/status-page';

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${STATUS_PAGE_URL}/${STATUS_PAGE_SLUG}`);
    if (!res.ok) return json({ error: 'Failed to fetch status page' }, { status: res.status });
    
    const data = await res.json();
    return json(data);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error' }, { status: 500 });
  }
};
