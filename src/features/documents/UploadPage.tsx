import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import type { z } from 'zod';
import { RecipientPicker, type Recipient } from '@/components/users/RecipientPicker';
import { Button, Field, useToast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { checkFile, docSchema } from '@/schemas';
import { CATEGORIES } from '@/types';

type F = z.infer<typeof docSchema>;
export default function UploadPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState<File>();
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<F>({
    resolver: zodResolver(docSchema),
    defaultValues: { category: 'general', description: '' },
  });

  const submit = handleSubmit(async (v) => {
    const e = checkFile(file);
    setFileErr(e);
    if (e || !file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('title', v.title);
    form.set('description', v.description);
    form.set('category', v.category);
    try {
      const r = await api.form<{ id: string }>('document-upload', form);
      if (recipient) {
        try {
          await api.json('document-grant', {
            document_id: r.id,
            grantee_email: recipient.email,
            permission,
          });
          toast(
            'ok',
            `Document uploaded and shared with ${recipient.display_name} (${recipient.email}).`,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Access could not be granted.';
          toast('err', `Document uploaded, but sharing with ${recipient.email} failed: ${reason}`);
        }
      } else {
        toast('ok', 'Document uploaded. It has not been shared with anyone yet.');
      }
      nav(`/documents/${r.id}`);
    } catch (err) {
      toast('err', err instanceof Error ? err.message : 'Upload failed');
    }
  });
  return (
    <form onSubmit={submit} className="card max-w-xl space-y-4 p-6" noValidate>
      <h1>Upload document</h1>
      <Field id="t" label="Title" error={errors.title?.message}>
        <input id="t" className="field" {...register('title')} />
      </Field>
      <Field id="d" label="Description" error={errors.description?.message}>
        <textarea id="d" rows={3} className="field" {...register('description')} />
      </Field>
      <Field id="c" label="Category">
        <select id="c" className="field" {...register('category')}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field id="f" label="File (PDF, PNG or JPEG, up to 5 MB)" error={fileErr ?? undefined}>
        <input
          id="f"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="field"
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setFileErr(null);
          }}
        />
      </Field>
      <div className="space-y-3 border-t border-line pt-4">
        <h2>Share after uploading</h2>
        <p className="text-sm text-muted">
          Choose one registered user to grant access to this document. Leave blank to keep it
          private.
        </p>
        <RecipientPicker selected={recipient} onSelect={setRecipient} />
        {recipient && (
          <Field id="upload-permission" label="Access">
            <select
              id="upload-permission"
              className="field"
              value={permission}
              onChange={(event) => setPermission(event.target.value as 'read' | 'edit')}
            >
              <option value="read">Can read and download</option>
              <option value="edit">Can read, download and edit</option>
            </select>
          </Field>
        )}
      </div>
      <Button type="submit" loading={isSubmitting}>
        Upload securely
      </Button>
    </form>
  );
}
