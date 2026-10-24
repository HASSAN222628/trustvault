import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AccessBadge, Badge } from '@/components/ui/ui';
import { formatBytes, formatDate } from '@/lib/utils';
import type { DocRow } from '@/types';

export const DocList = ({ rows }: { rows: DocRow[] }) => (
  <ul className="divide-y divide-line">
    {rows.map((d) => (
      <li key={d.id}>
        <Link to={`/documents/${d.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-bg">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.title}</p>
            <p className="truncate text-sm text-muted">{d.original_filename} · {formatBytes(d.size_bytes)} · {d.owner_name || 'Unknown'} · {formatDate(d.created_at)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1"><AccessBadge access={d.my_access} /><Badge>{d.category}</Badge></div>
        </Link>
      </li>
    ))}
  </ul>
);
