import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Pagination, Skeleton } from '@/components/ui/ui';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, type DocRow } from '@/types';
import { DocList } from './DocList';

const PAGE = 10;
export default function Library() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [page, setPage] = useState(0);
  const category = params.get('category') ?? '', owner = params.get('owner') ?? '';
  const scope = params.get('scope') ?? 'all', from = params.get('from') ?? '', to = params.get('to') ?? '';
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n); setPage(0); };

  const res = useAsync(async () => {
    const end = to ? new Date(new Date(to).getTime() + 86_400_000).toISOString() : null; // inclusive end date
    const { data, error } = await supabase.rpc('search_documents', {
      p_query: debounced || null, p_category: category || null, p_owner: owner || null,
      p_from: from ? new Date(from).toISOString() : null, p_to: end, p_scope: scope, p_limit: PAGE, p_offset: page * PAGE });
    if (error) throw new Error(error.message);
    return (data ?? []) as DocRow[];
  }, [debounced, category, owner, scope, from, to, page]);

  return (
    <div className="space-y-4">
      <h1>Documents</h1>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <input className="field" aria-label="Title or filename" placeholder="Title or filename" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="field" aria-label="Owner" placeholder="Owner name or email" value={owner} onChange={(e) => set('owner', e.target.value)} />
        <select className="field" aria-label="Category" value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="field" aria-label="Scope" value={scope} onChange={(e) => set('scope', e.target.value)}>
          <option value="all">Owned and shared</option><option value="owned">Owned by me</option><option value="shared">Shared with me</option></select>
        <input className="field" type="date" aria-label="From date" value={from} onChange={(e) => set('from', e.target.value)} />
        <input className="field" type="date" aria-label="To date" value={to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <div className="card">
        {res.loading ? <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : res.error ? <Empty title="Search failed" hint="Please try again." />
          : res.data?.length ? (<><DocList rows={res.data} /><Pagination page={page} pageSize={PAGE} total={res.data[0]?.total_count ?? 0} onChange={setPage} /></>)
          : <Empty title="No documents found" hint="Adjust the filters, or upload a document." />}
      </div>
    </div>
  );
}
