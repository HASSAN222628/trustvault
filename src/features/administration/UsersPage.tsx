import { useState } from 'react';
import { Badge, Button, ConfirmDialog, Skeleton, useToast } from '@/components/ui/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';

export default function UsersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [change, setChange] = useState<{ user: Profile; role: Role } | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    user: Profile;
    action: 'ban' | 'unban' | 'delete';
  } | null>(null);
  const users = useAsync(
    async () =>
      ((
        await supabase
          .from('profiles')
          .select('id,email,display_name,role,is_active')
          .order('email')
      ).data ?? []) as Profile[],
    [],
  );
  return (
    <div className="space-y-4">
      <h1>Users &amp; roles</h1>
      <p className="text-sm text-muted">
        Roles control platform features only. An administrator gains no access to anyone&apos;s
        documents.
      </p>
      <div className="card overflow-x-auto">
        {users.loading ? (
          <div className="p-4">
            <Skeleton className="h-20" />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Account</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <b>{u.display_name}</b>
                    <br />
                    <span className="text-muted">{u.email}</span>
                  </td>
                  <td className="p-3">
                    {u.id === profile?.id || u.role === 'admin' ? (
                      <Badge tone="accent">
                        {u.role}
                        {u.id === profile?.id ? ' (you)' : ''}
                      </Badge>
                    ) : (
                      <select
                        aria-label={`Role for ${u.email}`}
                        className="field w-32"
                        value={u.role}
                        onChange={(e) => setChange({ user: u, role: e.target.value as Role })}
                      >
                        <option>owner</option>
                        <option>viewer</option>
                      </select>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge tone={u.is_active ? 'ok' : 'danger'}>
                      {u.is_active ? 'Active' : 'Banned'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {u.id !== profile?.id && u.role !== 'admin' && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setPendingAction({ user: u, action: u.is_active ? 'ban' : 'unban' })
                          }
                        >
                          {u.is_active ? 'Ban' : 'Unban'}
                        </Button>
                      )}
                      {u.id !== profile?.id && u.role !== 'admin' && (
                        <Button
                          variant="danger"
                          onClick={() => setPendingAction({ user: u, action: 'delete' })}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog
        open={!!change}
        title="Change role?"
        confirmLabel="Change role"
        danger={change?.role === 'admin'}
        onCancel={() => setChange(null)}
        body={
          <>
            Set <b>{change?.user.email}</b> to <b>{change?.role}</b>. This is recorded in the audit
            log.
          </>
        }
        onConfirm={async () => {
          try {
            await api.json('admin-set-role', { user_id: change!.user.id, role: change!.role });
            toast('ok', 'Role updated');
            users.reload();
          } catch (e) {
            toast('err', e instanceof Error ? e.message : 'Failed');
          }
          setChange(null);
        }}
      />
      <ConfirmDialog
        open={!!pendingAction}
        danger={pendingAction?.action !== 'unban'}
        title={
          pendingAction?.action === 'delete'
            ? 'Delete this account?'
            : pendingAction?.action === 'ban'
              ? 'Ban this account?'
              : 'Restore this account?'
        }
        confirmLabel={
          pendingAction?.action === 'delete'
            ? 'Delete account'
            : pendingAction?.action === 'ban'
              ? 'Ban account'
              : 'Unban account'
        }
        onCancel={() => setPendingAction(null)}
        body={
          pendingAction?.action === 'delete' ? (
            <>
              Permanently remove <b>{pendingAction.user.email}</b>. Accounts that own documents
              cannot be deleted until those documents are removed. This cannot be undone.
            </>
          ) : pendingAction?.action === 'ban' ? (
            <>
              Ban <b>{pendingAction?.user.email}</b> from signing in and accessing protected data?
              This can be reversed later.
            </>
          ) : (
            <>
              Restore sign-in and data access for <b>{pendingAction?.user.email}</b>?
            </>
          )
        }
        onConfirm={async () => {
          try {
            await api.json('admin-manage-user', {
              user_id: pendingAction!.user.id,
              action: pendingAction!.action,
            });
            toast(
              'ok',
              pendingAction!.action === 'delete'
                ? 'Account deleted.'
                : pendingAction!.action === 'ban'
                  ? 'Account banned.'
                  : 'Account restored.',
            );
            users.reload();
          } catch (e) {
            toast('err', e instanceof Error ? e.message : 'Account action failed.');
          }
          setPendingAction(null);
        }}
      />
    </div>
  );
}
