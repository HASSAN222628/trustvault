import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary, NotFound } from '@/components/feedback/Pages';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/ui';
import UsersPage from '@/features/administration/UsersPage';
import AuditPage from '@/features/audit/AuditPage';
import { AuthProvider, RequireAuth, RequireRole } from '@/features/auth/AuthProvider';
import LoginPage from '@/features/auth/LoginPage';
import Dashboard from '@/features/dashboard/Dashboard';
import DocumentPage from '@/features/documents/DocumentPage';
import Library from '@/features/documents/Library';
import UploadPage from '@/features/documents/UploadPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<Dashboard />} />
                <Route path="documents" element={<Library />} />
                <Route path="documents/new" element={<RequireRole roles={['owner', 'admin']}><UploadPage /></RequireRole>} />
                <Route path="documents/:id" element={<DocumentPage />} />
                <Route path="admin/audit" element={<RequireRole roles={['admin']}><AuditPage /></RequireRole>} />
                <Route path="admin/users" element={<RequireRole roles={['admin']}><UsersPage /></RequireRole>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
