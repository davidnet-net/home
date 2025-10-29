import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

const STATUS_PAGE_SLUG = 'internal';
const STATUS_PAGE_URL = 'https://uptimekuma.davidnet.net/api/status-page';

export const GET: RequestHandler = async () => {
  try {
    // 1️⃣ Fetch status page
    const resPage = await fetch(`${STATUS_PAGE_URL}/${STATUS_PAGE_SLUG}`);
    if (!resPage.ok)
      return json({ error: 'Failed to fetch status page' }, { status: resPage.status });

    const pageData = await resPage.json();

    // Flatten monitors across all public groups with group names
    const monitors = pageData.publicGroupList.flatMap((group: any) =>
      group.monitorList.map((m: any) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        group: group.name
      }))
    );

    // 2️⃣ Fetch heartbeat data
    const resHeartbeat = await fetch(`${STATUS_PAGE_URL}/heartbeat/${STATUS_PAGE_SLUG}`);
    if (!resHeartbeat.ok)
      return json({ error: 'Failed to fetch heartbeat data' }, { status: resHeartbeat.status });

    const heartbeatData = await resHeartbeat.json();
    const heartbeatList: Record<string, any[]> = heartbeatData.heartbeatList || {};

    // 3️⃣ Filter monitors currently in maintenance (status === 3)
    const maintenanceMonitors = monitors.filter((monitor: any) => {
      const hb = heartbeatList[monitor.id];
      if (!hb || hb.length === 0) return false;
      const latest = hb[hb.length - 1];
      return latest.status === 3; // 3 = Maintenance
    });

    // 4️⃣ Return cleaned up list
    const result = maintenanceMonitors.map((m: any) => {
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
