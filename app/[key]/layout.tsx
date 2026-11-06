import Link from 'next/link';
import { requireKey } from '@/lib/access';

export default async function KeyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const base = `/${key}`;
  return (
    <>
      <nav>
        <Link href={base}>Dashboard</Link>
        <Link href={`${base}/sale`}>Sale</Link>
        <Link href={`${base}/stock`}>Stock</Link>
        <Link href={`${base}/shipments`}>Shipments</Link>
        <Link href={`${base}/sales`}>Sales</Link>
        <Link href={`${base}/settings`}>Settings</Link>
      </nav>
      <main>{children}</main>
    </>
  );
}
