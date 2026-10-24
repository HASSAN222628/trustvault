import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AccessDenied } from '@/components/feedback/Pages';
import { ConfirmDialog } from './ui';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="T" body="b" confirmLabel="Go" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('confirms and cancels', async () => {
    const ok = vi.fn(), no = vi.fn();
    render(<ConfirmDialog open title="Revoke?" body="x" confirmLabel="Revoke" onConfirm={ok} onCancel={no} />);
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(ok).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(no).toHaveBeenCalled();
  });
});
describe('AccessDenied', () => {
  it('shows a clear message', () => {
    render(<MemoryRouter><AccessDenied /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });
});
