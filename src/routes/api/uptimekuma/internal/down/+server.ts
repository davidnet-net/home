import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

const STATUS_PAGE_SLUG = 'internal';
const STATUS_PAGE_URL = 'https://uptimekuma.davidnet.net/api/status-page';

export const GET: RequestHandler = async () => {
  try {
    // 1️⃣ Fetch public status page data for monitor info
    const resPage = await fetch(`${STATUS_PAGE_URL}/${STATUS_PAGE_SLUG}`);
    if (!resPage.ok)
      return json({ error: 'Failed to fetch status page' }, { status: resPage.status });

    const pageData = await resPage.json();

    // Flatten monitors across all public groups, keep group name
    const monitors = pageData.publicGroupList.flatMap((group: any) =>
      group.monitorList.map((m: any) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        group: group.name
      }))
    );

    // 2️⃣ Fetch heartbeat data to get current statuses
    const resHeartbeat = await fetch(`${STATUS_PAGE_URL}/heartbeat/${STATUS_PAGE_SLUG}`);
    if (!resHeartbeat.ok)
      return json({ error: 'Failed to fetch heartbeat data' }, { status: resHeartbeat.status });

    const heartbeatData = await resHeartbeat.json();
    const heartbeatList: Record<string, any[]> = heartbeatData.heartbeatList || {};

    // 3️⃣ Filter monitors that are currently down (status 0 = DOWN)
    const downMonitors = monitors.filter((monitor: any) => {
      const hb = heartbeatList[monitor.id];
      if (!hb || hb.length === 0) return false;
      const latest = hb[hb.length - 1];
      return latest.status === 0;
    });

    // 4️⃣ Include last heartbeat info for each down monitor
    const result = downMonitors.map((m: any) => {
      const latest = heartbeatList[m.id][heartbeatList[m.id].length - 1];
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        group: m.group,
        lastHeartbeat: latest.time,
        msg: latest.msg
      };
    });

    return json(result);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error' }, { status: 500 });
  }
};
