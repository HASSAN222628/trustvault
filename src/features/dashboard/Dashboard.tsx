import { Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Empty, Skeleton } from '@/components/ui/ui';
import { DocList } from '@/features/documents/DocList';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import type { DocRow } from '@/types';

const search = async (scope: 'owned' | 'shared') => {
  const { data, error } = await supabase.rpc('search_documents', { p_scope: scope, p_limit: 5 });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocRow[];
};

export default function Dashboard() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const owned = useAsync(() => search('owned'), []);
  const shared = useAsync(() => search('shared'), []);
  // Activity is filtered by RLS: own actions + history of documents you own.
  const activity = useAsync(async () => {
    const { data } = await supabase.from('audit_events').select('id,action,outcome,occurred_at,document_id').order('seq', { ascending: false }).limit(8);
    const ids = [...new Set((data ?? []).map((e) => e.document_id).filter(Boolean))] as string[];
    const titles = ids.length ? (await supabase.from('documents').select('id,title').in('id', ids)).data ?? [] : [];
    return (data ?? []).map((e) => ({ ...e, title: titles.find((t) => t.id === e.document_id)?.title ?? null }));
  }, []);

  const block = (title: string, s: typeof owned, empty: string) => (
    <section className="card">
      <h2 className="border-b border-line px-4 py-3">{title}{s.data?.[0] ? ` · ${s.data[0].total_count}` : ''}</h2>
      {s.loading ? <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        : s.error ? <Empty title="Couldn't load documents" action={<Button variant="secondary" onClick={s.reload}>Retry</Button>} />
        : s.data?.length ? <DocList rows={s.data} /> : <Empty title={empty} />}
    </section>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1>Welcome, {profile?.display_name}</h1><p className="text-sm text-muted">Only documents you are authorised to see appear here.</p></div>
        {profile?.role !== 'viewer' && <Link to="/documents/new"><Button><Upload className="h-4 w-4" />Upload document</Button></Link>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); nav(`/documents?q=${encodeURIComponent(q)}`); }} className="flex gap-2" role="search">
        <input className="field" placeholder="Search by title or filename" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary"><Search className="h-4 w-4" />Search</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-2">
        {block('Your documents', owned, 'You have not uploaded anything yet')}
        {block('Shared with you', shared, 'Nothing has been shared with you')}
      </div>
      <section className="card">
        <h2 className="border-b border-line px-4 py-3">Recent activity</h2>
        {activity.loading ? <div className="p-4"><Skeleton className="h-10" /></div> : activity.data?.length ? (
          <ul className="divide-y divide-line text-sm">{activity.data.map((e) => (
            <li key={e.id} className="flex justify-between gap-3 px-4 py-2.5"><span>{e.action.replace('.', ' · ')} {e.title ? `— ${e.title}` : ''} {e.outcome !== 'success' && <b className="text-danger">({e.outcome})</b>}</span><span className="shrink-0 text-muted">{formatDate(e.occurred_at)}</span></li>))}</ul>
        ) : <Empty title="No recent activity" />}
      </section>
    </div>
  );
}
