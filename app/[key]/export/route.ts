import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { dayKey } from '@/lib/periods';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const snapshot = await loadSnapshot();
  const today = dayKey(new Date().toISOString(), snapshot.timeZone ?? 'UTC');
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="matcha-export-${today}.json"`,
    },
  });
}
