'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: [string, string][] = [['', 'Dashboard'], ['/sale', 'Record sale'], ['/stock', 'Stock'], ['/shipments', 'Shipments'], ['/sales', 'Sales'], ['/settle', 'Settle up'], ['/settings', 'Settings']];

export default function Nav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav>
      {LINKS.map(([p, text]) => (
        <Link key={p} href={base + p} className={p === '/sale' ? 'cta' : undefined} aria-current={path === base + p ? 'page' : undefined}>{text}</Link>
      ))}
    </nav>
  );
}
