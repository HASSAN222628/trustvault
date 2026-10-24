import { Component } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/ui';

const Box = ({ title, text }: { title: string; text: string }) => (
  <div className="mx-auto max-w-md py-20 text-center">
    <h1>{title}</h1><p className="mt-2 text-muted">{text}</p>
    <Link to="/" className="mt-6 inline-block"><Button variant="secondary">Back to dashboard</Button></Link>
  </div>
);
export const NotFound = () => <Box title="Not found" text="This page or document doesn't exist, or you don't have access to it." />;
export const AccessDenied = () => <Box title="Access denied" text="Your account does not have permission to view this page." />;

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Box title="Something went wrong" text="Reload the page and try again." /> : this.props.children; }
}
