'use client';
import { startTransition, useActionState, useEffect, useRef } from 'react';

export type State = { error?: string; saved?: string } | null;

/** A form that keeps what was typed when validation fails, and clears itself after a save. */
export function ActionForm({ action, submit, children, className }: {
  action: (prev: State, f: FormData) => Promise<State>;
  submit: string; children: React.ReactNode; className?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.saved) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} className={`act ${className ?? ''}`.trim()} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); startTransition(() => run(f)); }}>
      {children}
      {state?.error && <p role="alert" className="error">{state.error}</p>}
      {state?.saved && <p role="status" className="ok">{state.saved}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Saving…' : submit}</button>
    </form>
  );
}

/** A delete button that asks first. `action` is a server action already bound to its id. */
export function DeleteButton({ action, ask }: { action: () => Promise<void>; ask: string }) {
  return (
    <form action={action}>
      <button type="submit" className="danger" onClick={e => { if (!window.confirm(ask)) e.preventDefault(); }}>Delete</button>
    </form>
  );
}
