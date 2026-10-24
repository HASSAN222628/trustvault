import { useEffect, useState } from 'react';
import { Field } from '@/components/ui/ui';
import { supabase } from '@/lib/supabase';

export type Recipient = { id: string; email: string; display_name: string };

export function RecipientPicker({
  selected,
  onSelect,
}: {
  selected: Recipient | null;
  onSelect: (recipient: Recipient | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (selected || value.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error: searchError } = await supabase.rpc('rpc_search_share_recipients', {
            p_query: value,
          });
          if (!active) return;
          if (searchError) {
            setError(searchError.message);
            setResults([]);
          } else {
            setResults((data ?? []) as Recipient[]);
          }
        } catch (searchError) {
          if (!active) return;
          setError(searchError instanceof Error ? searchError.message : 'Could not search users.');
          setResults([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
          <span className="min-w-0">
            <b>{selected.display_name}</b> <span className="text-muted">{selected.email}</span>
          </span>
          <button
            type="button"
            className="shrink-0 text-accent underline"
            onClick={() => onSelect(null)}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Field id="recipient-search" label="Search signed-in users">
            <input
              id="recipient-search"
              className="field"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a name or email"
              aria-describedby="recipient-search-hint"
              aria-controls="recipient-results"
              aria-expanded={results.length > 0}
            />
          </Field>
          <p id="recipient-search-hint" className="text-xs text-muted">
            Enter at least 2 characters to search.
          </p>
          {loading && (
            <p className="text-sm text-muted" role="status">
              Searching users…
            </p>
          )}
          {error && (
            <p className="text-sm text-danger" role="alert">
              Could not search users: {error}
            </p>
          )}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-muted" role="status">
              No matching users found.
            </p>
          )}
          {results.length > 0 && (
            <ul
              id="recipient-results"
              className="max-h-48 overflow-y-auto rounded-md border border-line"
              role="listbox"
              aria-label="Matching users"
            >
              {results.map((recipient) => (
                <li key={recipient.id} role="option" aria-selected="false">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-bg focus:bg-bg"
                    onClick={() => {
                      onSelect(recipient);
                      setQuery('');
                      setResults([]);
                    }}
                  >
                    <span className="block font-medium">{recipient.display_name}</span>
                    <span className="block text-muted">{recipient.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
