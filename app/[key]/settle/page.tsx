import Link from 'next/link';
import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { formatUsd, formatVnd, MissingRateError } from '@/lib/money';
import { settle } from '@/lib/settle';
import { deleteTransferAction, saveTransferAction } from '../actions';
import { ActionForm, DeleteButton } from '../ui';

export const dynamic = 'force-dynamic';

export default async function SettlePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  if (!s.timeZone) return <><h1>Settle up</h1><p><Link className="link" href={`/${key}/settings`}>Set the store&apos;s time zone in Settings</Link></p></>;
  const year = new Date().getUTCFullYear();
  let r: ReturnType<typeof settle>;
  try { r = settle(s, s.timeZone, year); } catch (e) {
    if (e instanceof MissingRateError) return <><h1>Settle up</h1><p>Add the {e.year} exchange rate in <Link href={`/${key}/settings`}>Settings</Link> to see this page.</p></>;
    throw e;
  }
  const today = new Date().toISOString().slice(0, 10);
  const row = (label: string, cents: number, strong = false) => (
    <tr className={strong ? 'total' : undefined}><td>{strong ? <strong>{label}</strong> : label}</td><td className="n">{strong ? <strong>{formatUsd(cents)}</strong> : formatUsd(cents)}</td></tr>
  );
  const owes = r.payout?.ngocOwesVnd ?? 0;
  return (
    <>
      <h1>Settle up</h1>
      <section className="panel">
        <p className="muted">All time, in cash: everything paid for stock and expenses counts when it was paid, even if it is not sold yet. Etsy fees and ads are taken out of the money in.</p>
        <div className="tablewrap"><table><tbody>
          {row('Money in (after Etsy fees and ads)', r.moneyIn)}
          {row('Paid by My', r.paid.my)}
          {row('Paid by Ngoc', r.paid.ngoc)}
          {row('Profit', r.profit, true)}
        </tbody></table></div>
        {r.payout ? (
          <>
            <div className="tablewrap"><table><tbody>
              {row('My gets (paid back + half the profit)', r.payout.my)}
              {row('Ngoc keeps (paid back + half the profit)', r.payout.ngoc)}
              <tr><td>Ngoc has already sent My</td><td className="n">{formatVnd(r.sent)}</td></tr>
            </tbody></table></div>
            <div className="hero">
              <h2>{owes >= 0 ? 'Ngoc still sends My' : 'Ngoc has sent too much'}</h2>
              <div className="big">{formatVnd(Math.abs(owes))}</div>
              <div className="vnd">about {formatUsd(Math.round(Math.abs(owes) / s.rates[year] * 100))} at {s.rates[year].toLocaleString('en-US')} ₫ per $1</div>
            </div>
          </>
        ) : (
          <p role="status"><strong>No profit yet.</strong> {formatUsd(-r.profit)} more to earn before anyone is paid.{r.sent > 0 && ` Ngoc has sent My ${formatVnd(r.sent)} so far.`}</p>
        )}
      </section>

      <section className="panel">
        <h2>Transfers from Ngoc to My</h2>
        <ActionForm action={saveTransferAction.bind(null, key)} submit="Add transfer">
          <div className="row"><label>Date<input type="date" name="sent_on" defaultValue={today} required /></label></div>
          <div className="row"><label>Amount (₫)<input name="amount" inputMode="numeric" required /></label></div>
          <div className="row"><label>Note (optional)<input name="note" /></label></div>
        </ActionForm>
        <div className="tablewrap"><table>
          <thead><tr><th>Date</th><th className="n">Amount</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {s.transfers.map(t => (
              <tr key={t.id}><td>{t.sent_on}</td><td className="n">{formatVnd(t.amount)}</td><td>{t.note}</td>
                <td><DeleteButton action={deleteTransferAction.bind(null, key, t.id)} ask="Delete this transfer?" /></td></tr>
            ))}
            {s.transfers.length === 0 && <tr><td colSpan={4}>None yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
