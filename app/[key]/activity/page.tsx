import { requireKey } from '@/lib/access';
import { loadActivity } from '@/lib/activity';
import LocalTime from '../LocalTime';

export const dynamic = 'force-dynamic';

export default async function ActivityPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const rows = await loadActivity();
  return (
    <>
      <h1>Activity</h1>
      <p className="muted">Everything recorded from 19 Nov 2026 on, newest first. Times are in your device&apos;s time zone. Deleted entries don&apos;t show here.</p>
      <section className="panel">
      <div className="tablewrap"><table>
        <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}><td><LocalTime iso={r.at} /></td><td>{r.who}</td><td>{r.text}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={3}>Nothing yet.</td></tr>}
        </tbody>
      </table></div>
      </section>
    </>
  );
}
