import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Empty, Pagination, Skeleton, useToast } from '@/components/ui/ui';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

type Ev = {
  seq: number;
  actor_id: string | null;
  document_id: string | null;
  action: string;
  outcome: 'success' | 'denied' | 'error';
  occurred_at: string;
  request_id: string;
  details: Record<string, unknown>;
};
type Ver = {
  ok: boolean;
  checked: number;
  first_bad_seq: number | null;
  head_seq: number | null;
  head_hash: string | null;
};
const PAGE = 25;

export default function AuditPage() {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [action, setAction] = useState('');
  const [ver, setVer] = useState<Ver | null>(null);
  const res = useAsync(async () => {
    const result = await api.json<{ events: Ev[]; total: number }>('admin-audit-query', {
      limit: PAGE,
      offset: page * PAGE,
      ...(outcome ? { outcome } : {}),
      ...(/^[a-z_.]+$/.test(action) ? { action } : {}),
    });
    const ids = [
      ...new Set(
        result.events
          .flatMap((event) => [
            event.actor_id,
            typeof event.details.grantee_id === 'string' ? event.details.grantee_id : null,
            typeof event.details.target === 'string' ? event.details.target : null,
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!ids.length) return { ...result, users: {} as Record<string, string> };
    const { data, error } = await supabase.from('profiles').select('id,email').in('id', ids);
    if (error) throw new Error(`Could not resolve audit user names: ${error.message}`);
    return {
      ...result,
      users: Object.fromEntries((data ?? []).map((user) => [user.id, user.email])) as Record<
        string,
        string
      >,
    };
  }, [page, outcome, action]);
  const userEmails = res.data?.users ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Audit log</h1>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              setVer(
                (await api.json<{ verification: Ver }>('admin-audit-query', { verify_chain: true }))
                  .verification,
              );
            } catch {
              toast('err', 'Verification failed');
            }
          }}
        >
          <ShieldCheck className="h-4 w-4" />
          Verify hash chain
        </Button>
      </div>
      {ver && (
        <div className={`card p-4 text-sm ${ver.ok ? 'border-ok' : 'border-danger'}`} role="status">
          <b>
            {ver.ok
              ? `Chain intact — ${ver.checked} events checked.`
              : `Chain BROKEN at event #${ver.first_bad_seq}.`}
          </b>
          <p className="mt-1 break-all font-mono text-xs text-muted">
            Head #{ver.head_seq}: {ver.head_hash}
          </p>
          <p className="mt-1 text-xs text-muted">
            Store this head hash somewhere independent: a chain inside one database cannot prove the
            database administrator did not rewrite it.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          className="field w-40"
          aria-label="Outcome"
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All outcomes</option>
          <option>success</option>
          <option>denied</option>
          <option>error</option>
        </select>
        <input
          className="field w-56"
          aria-label="Action"
          placeholder="Action, e.g. document.download"
          value={action}
          onChange={(e) => {
            setAction(e.target.value.trim());
            setPage(0);
          }}
        />
      </div>
      <div className="card overflow-x-auto">
        {res.loading ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : res.error ? (
          <Empty title="Could not load audit events" />
        ) : res.data?.events.length ? (
          <>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Document</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {res.data.events.map((e) => (
                  <tr key={e.seq} className="border-b border-line last:border-0">
                    <td className="p-3 text-muted">{e.seq}</td>
                    <td className="whitespace-nowrap p-3">{formatDate(e.occurred_at)}</td>
                    <td className="p-3">{e.action}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          e.outcome === 'success'
                            ? 'ok'
                            : e.outcome === 'denied'
                              ? 'danger'
                              : 'warn'
                        }
                      >
                        {e.outcome}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {e.actor_id ? (userEmails[e.actor_id] ?? e.actor_id.slice(0, 8)) : '—'}
                    </td>
                    <td className="p-3 font-mono text-xs">{e.document_id?.slice(0, 8) ?? '—'}</td>
                    <td className="max-w-xs p-3 text-xs">
                      <details>
                        <summary className="cursor-pointer">View</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all">
                          {JSON.stringify(
                            Object.fromEntries(
                              Object.entries(e.details).map(([key, value]) => [
                                key,
                                typeof value === 'string' && userEmails[value]
                                  ? userEmails[value]
                                  : value,
                              ]),
                            ),
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={PAGE} total={res.data.total} onChange={setPage} />
          </>
        ) : (
          <Empty title="No events match" />
        )}
      </div>
    </div>
  );
}
