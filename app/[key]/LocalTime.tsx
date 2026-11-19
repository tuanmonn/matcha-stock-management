'use client';

// Rendered in the viewer's own time zone: Vietnam for the owner, Texas for the friend.
export default function LocalTime({ iso }: { iso: string }) {
  return <time dateTime={iso} suppressHydrationWarning>{new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>;
}
