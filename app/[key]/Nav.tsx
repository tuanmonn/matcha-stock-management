'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

const LINKS: [string, string][] = [['', 'Dashboard'], ['/sale', 'Record sale'], ['/stock', 'Stock'], ['/shipments', 'Shipments'], ['/sales', 'Sales'], ['/settle', 'Settle up'], ['/settings', 'Settings']];

export default function Nav({ base }: { base: string }) {
  const path = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  return (
    <nav>
      {LINKS.map(([p, text]) => (
        <Link key={p} href={base + p} className={p === '/sale' ? 'cta' : undefined} aria-current={path === base + p ? 'page' : undefined}>{text}</Link>
      ))}
      {/* A home-screen web app on iPhone has no reload button, so this re-fetches the page's data. */}
      <button type="button" className="refresh" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing}>{refreshing ? 'Refreshing…' : <><span aria-hidden="true">↻ </span>Refresh</>}</button>
    </nav>
  );
}
