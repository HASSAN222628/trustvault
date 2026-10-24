import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { NotFound } from '@/components/feedback/Pages';
import {
  AccessBadge,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Skeleton,
  useToast,
} from '@/components/ui/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { SharePanel } from '@/features/permissions/SharePanel';
import { useAsync } from '@/hooks/useAsync';
import { api, ApiFailure } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatBytes, formatDate, isUuid } from '@/lib/utils';
import { checkFile, docSchema } from '@/schemas';
import { CATEGORIES, type Access } from '@/types';

type F = z.infer<typeof docSchema>;
type Doc = {
  id: string;
  title: string;
  description: string;
  category: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner: { display_name: string } | null;
};

export default function DocumentPage() {
  const { id } = useParams();
  return isUuid(id) ? <Inner id={id} /> : <NotFound />;
}

function Inner({ id }: { id: string }) {
  const { profile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const doc = useAsync(async () => {
    // RLS: returns null for documents you may not see (indistinguishable from "does not exist").
    const { data } = await supabase
      .from('documents')
      .select(
        'id,title,description,category,original_filename,mime_type,size_bytes,sha256,created_at,updated_at,owner_id,owner:profiles!documents_owner_id_fkey(display_name)',
      )
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    let access: Access = 'owner';
    if (data.owner_id !== profile?.id) {
      const g = await supabase
        .from('document_permissions')
        .select('permission')
        .eq('document_id', id)
        .eq('user_id', profile!.id)
        .is('revoked_at', null)
        .maybeSingle();
      access = (g.data?.permission as Access | undefined) ?? 'read';
    }
    const ev = await supabase
      .from('audit_events')
      .select('id,action,outcome,occurred_at,actor_id')
      .eq('document_id', id)
      .order('seq', { ascending: false })
      .limit(10);
    return { doc: data as unknown as Doc, access, events: ev.data ?? [] };
  }, [id]);

  useEffect(() => {
    if (!doc.data?.doc) return;
    let active = true;
    let objectUrl: string | null = null;
    setPreviewError(null);
    void api
      .preview(id)
      .then((url) => {
        if (active) {
          objectUrl = url;
          setPreviewUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setPreviewError(error instanceof Error ? error.message : 'Could not load preview.');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    };
  }, [id, doc.data?.doc]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<F>({ resolver: zodResolver(docSchema) });
  const loaded = doc.data?.doc;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (loaded && seeded !== loaded.updated_at) {
    setSeeded(loaded.updated_at);
    reset({
      title: loaded.title,
      description: loaded.description,
      category: loaded.category as F['category'],
    });
  }

  if (doc.loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40" />
      </div>
    );
  if (!doc.data) return <NotFound />;
  const { access, events } = doc.data;
  const d = doc.data.doc;
  const canEdit = access === 'owner' || access === 'edit';
  const fail = (e: unknown) =>
    toast(
      'err',
      e instanceof ApiFailure && e.status === 403
        ? 'You do not have permission to do that.'
        : e instanceof Error
          ? e.message
          : 'Failed',
    );

  const save = handleSubmit(async (v) => {
    try {
      await api.json('document-edit', { document_id: id, ...v });
      toast('ok', 'Details saved');
      doc.reload();
    } catch (e) {
      fail(e);
    }
  });
  const replace = async (f?: File) => {
    const err = checkFile(f);
    if (err || !f) return err && toast('err', err);
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', f);
      await api.form('document-edit', form, `?document_id=${id}`);
      toast('ok', 'File replaced');
      doc.reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words">{d.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <AccessBadge access={access} />
            <Badge>{d.category}</Badge>
            {d.original_filename} · {formatBytes(d.size_bytes)} · Owner:{' '}
            {d.owner?.display_name ?? 'Unknown'}
          </p>
        </div>
        <div className="flex gap-2">
          {access !== 'read' && (
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.download(id);
                  toast('ok', 'Download started');
                } catch (e) {
                  fail(e);
                  doc.reload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          )}
          {access === 'owner' && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <section className="card space-y-3 p-4">
        <div>
          <h2>Document preview</h2>
          <p className="text-sm text-muted">
            {access === 'read'
              ? 'Read-only access: preview only. Ask the owner for edit access to download.'
              : 'Preview of the current document.'}
          </p>
        </div>
        {previewError && (
          <p className="text-sm text-danger" role="alert">
            {previewError}
          </p>
        )}
        {!previewUrl && !previewError && (
          <p className="text-sm text-muted" role="status">
            Loading preview…
          </p>
        )}
        {previewUrl && d.mime_type === 'application/pdf' && (
          <iframe
            title={`Preview of ${d.original_filename}`}
            src={`${previewUrl}#toolbar=0&navpanes=0`}
            className="h-[70vh] min-h-96 w-full rounded-md border border-line"
          />
        )}
        {previewUrl && d.mime_type.startsWith('image/') && (
          <img
            src={previewUrl}
            alt={`Preview of ${d.original_filename}`}
            className="mx-auto max-h-[70vh] max-w-full object-contain"
          />
        )}
      </section>

      <form onSubmit={save} className="card space-y-4 p-5" noValidate>
        <h2>Details</h2>
        <Field id="t" label="Title" error={errors.title?.message}>
          <input id="t" className="field" disabled={!canEdit} {...register('title')} />
        </Field>
        <Field id="d" label="Description" error={errors.description?.message}>
          <textarea
            id="d"
            rows={3}
            className="field"
            disabled={!canEdit}
            {...register('description')}
          />
        </Field>
        <Field id="c" label="Category">
          <select id="c" className="field" disabled={!canEdit} {...register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => {
                void replace(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Replace file
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">You have read-only access to this document.</p>
        )}
        <p className="break-all font-mono text-xs text-muted">
          SHA-256 {d.sha256} · updated {formatDate(d.updated_at)}
        </p>
      </form>

      {access === 'owner' && <SharePanel documentId={id} />}

      <section className="card">
        <h2 className="border-b border-line px-4 py-3">Activity</h2>
        {events.length ? (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between px-4 py-2.5">
                <span>
                  {e.action}
                  {e.outcome !== 'success' && <b className="ml-2 text-danger">{e.outcome}</b>}
                </span>
                <span className="text-muted">{formatDate(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted">No recorded activity visible to you.</p>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete this document?"
        confirmLabel="Delete permanently"
        onCancel={() => setConfirmDelete(false)}
        body="The file is removed and all access grants are revoked. The deletion is recorded in the audit log. This cannot be undone."
        onConfirm={async () => {
          try {
            await api.json('document-delete', { document_id: id });
            toast('ok', 'Document deleted');
            nav('/documents');
          } catch (e) {
            fail(e);
            setConfirmDelete(false);
          }
        }}
      />
    </div>
  );
}
