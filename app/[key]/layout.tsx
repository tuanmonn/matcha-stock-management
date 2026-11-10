import { requireKey } from '@/lib/access';
import Nav from './Nav';

export default async function KeyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const base = `/${key}`;
  return (
    <>
      <Nav base={base} />
      <main>{children}</main>
    </>
  );
}
