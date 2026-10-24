import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { RecipientPicker, type Recipient } from '@/components/users/RecipientPicker';
import { Button, ConfirmDialog, Field, useToast } from '@/components/ui/ui';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { shareSchema } from '@/schemas';

type F = z.infer<typeof shareSchema>;
type Grant = {
  id: string;
  user_id: string;
  permission: 'read' | 'edit';
  granted_at: string;
  revoked_at: string | null;
  grantee: { email: string; display_name: string } | null;
};
type PendingGrant = { recipient: Recipient; permission: F['permission'] };

export function SharePanel({ documentId }: { documentId: string }) {
  const toast = useToast();
  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [accessDrafts, setAccessDrafts] = useState<Record<string, 'read' | 'edit'>>({});
  const [updatingGrantId, setUpdatingGrantId] = useState<string | null>(null);
  const grants = useAsync(async () => {
    const { data } = await supabase
      .from('document_permissions')
      .select(
        'id,user_id,permission,granted_at,revoked_at,grantee:profiles!document_permissions_user_id_fkey(email,display_name)',
      )
      .eq('document_id', documentId)
      .order('granted_at', { ascending: false });
    return (data ?? []) as unknown as Grant[];
  }, [documentId]);
  const { register, handleSubmit, reset } = useForm<F>({
    resolver: zodResolver(shareSchema),
    defaultValues: { permission: 'read' },
  });
  const active = grants.data?.filter((g) => !g.revoked_at) ?? [];
  const history = grants.data?.filter((g) => g.revoked_at) ?? [];

  return (
    <section className="card p-5">
      <h2>Sharing</h2>
      <p className="mt-1 text-sm text-muted">
        Only registered users you name can access this document. Revoking takes effect on their next
        request. Read access previews in the app; edit access also allows downloading and editing.
      </p>
      <form
        onSubmit={handleSubmit((v) => {
          if (!recipient) {
            toast('err', 'Search for and select a registered user first.');
            return;
          }
          setPending({ recipient, permission: v.permission });
        })}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
        noValidate
      >
        <div className="sm:col-span-3">
          <RecipientPicker selected={recipient} onSelect={setRecipient} />
        </div>
        <Field id="sp" label="Access">
          <select id="sp" className="field" {...register('permission')}>
            <option value="read">Can read</option>
            <option value="edit">Can edit</option>
          </select>
        </Field>
        <Button type="submit" disabled={!recipient}>
          Grant access
        </Button>
      </form>
      <ul className="mt-5 divide-y divide-line text-sm">
        {active.length === 0 && <li className="py-3 text-muted">Not shared with anyone.</li>}
        {active.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <b>{g.grantee?.display_name}</b>{' '}
              <span className="text-muted">{g.grantee?.email}</span>
            </span>
            <span className="flex items-center gap-3">
              <select
                aria-label={`Access for ${g.grantee?.email ?? 'user'}`}
                className="field w-40"
                value={accessDrafts[g.id] ?? g.permission}
                onChange={(event) =>
                  setAccessDrafts((drafts) => ({
                    ...drafts,
                    [g.id]: event.target.value as 'read' | 'edit',
                  }))
                }
              >
                <option value="read">Read — preview only</option>
                <option value="edit">Edit — download and edit</option>
              </select>
              {(accessDrafts[g.id] ?? g.permission) !== g.permission && (
                <Button
                  variant="secondary"
                  loading={updatingGrantId === g.id}
                  onClick={async () => {
                    const permission = accessDrafts[g.id];
                    if (!permission || !g.grantee) return;
                    setUpdatingGrantId(g.id);
                    try {
                      await api.json('document-grant', {
                        document_id: documentId,
                        grantee_email: g.grantee.email,
                        permission,
                      });
                      toast(
                        'ok',
                        `Access changed to ${permission === 'edit' ? 'edit' : 'read-only preview'}.`,
                      );
                      setAccessDrafts((drafts) => {
                        const next = { ...drafts };
                        delete next[g.id];
                        return next;
                      });
                      grants.reload();
                    } catch (error) {
                      toast(
                        'err',
                        error instanceof Error ? error.message : 'Could not update access.',
                      );
                    } finally {
                      setUpdatingGrantId(null);
                    }
                  }}
                >
                  Save
                </Button>
              )}
              <Button variant="secondary" onClick={() => setRevoking(g)}>
                Revoke
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {history.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Revoked grants ({history.length})</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {history.map((g) => (
              <li key={g.id}>
                {g.grantee?.email} · {g.permission} · revoked {formatDate(g.revoked_at!)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Grant access?"
        confirmLabel="Grant access"
        onCancel={() => setPending(null)}
        body={
          <>
            Give{' '}
            <b>
              {pending?.recipient.display_name} ({pending?.recipient.email})
            </b>{' '}
            permission to{' '}
            <b>{pending?.permission === 'edit' ? 'read, download and edit' : 'preview only'}</b>{' '}
            this document.
          </>
        }
        onConfirm={async () => {
          try {
            await api.json('document-grant', {
              document_id: documentId,
              grantee_email: pending!.recipient.email,
              permission: pending!.permission,
            });
            toast('ok', `Access granted to ${pending!.recipient.display_name}.`);
            setRecipient(null);
            reset({ permission: 'read' });
            grants.reload();
          } catch (e) {
            toast('err', e instanceof Error ? e.message : 'Failed');
          }
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        danger
        title="Revoke access?"
        confirmLabel="Revoke access"
        onCancel={() => setRevoking(null)}
        body={
          <>
            <b>{revoking?.grantee?.email}</b> will be refused on their next request. A copy they
            already downloaded cannot be recalled.
          </>
        }
        onConfirm={async () => {
          try {
            await api.json('document-revoke', {
              document_id: documentId,
              user_id: revoking!.user_id,
            });
            toast('ok', 'Access revoked');
            grants.reload();
          } catch (e) {
            toast('err', e instanceof Error ? e.message : 'Failed');
          }
          setRevoking(null);
        }}
      />
    </section>
  );
}
