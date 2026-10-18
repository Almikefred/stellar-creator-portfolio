'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Gavel, RefreshCw } from 'lucide-react';
import { DisputeDetail } from './components/DisputeDetail';
import { DisputeFilters } from './components/DisputeFilters';
import { DisputeList } from './components/DisputeList';
import { Toast } from './components/Toast';
import { RESOLUTION_LABELS, type Dispute, type Resolution, type StatusFilter } from './types';

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/disputes?status=${statusFilter}&page=${page}&limit=${LIMIT}`,
      );
      if (!res.ok) throw new Error('Failed to load disputes');
      const data = await res.json();
      setDisputes(data.disputes);
      setTotal(data.total);
    } catch {
      notify('Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const selected = disputes.find((d) => d.id === selectedId) ?? null;

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function resolve(resolution: Resolution) {
    if (!selected) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/disputes/${selected.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to resolve');
      }
      notify(`Resolved: ${RESOLUTION_LABELS[resolution]}`);
      setNote('');
      setSelectedId(null);
      await load();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : 'Error resolving dispute');
    } finally {
      setResolving(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <Toast message={toast ?? ''} />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin"><ArrowLeft className="mr-1 h-4 w-4" />Admin</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Dispute Management
          </CardTitle>
          <CardDescription>
            Review disputes and trigger on-chain resolution. All actions are logged to the audit trail.
          </CardDescription>
        </CardHeader>
      </Card>

      <DisputeFilters
        current={statusFilter}
        onChange={(s) => { setStatusFilter(s); setPage(1); setSelectedId(null); }}
        total={total}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DisputeList
          disputes={disputes}
          loading={loading}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setNote(''); }}
          totalPages={totalPages}
          currentPage={page}
          onPageChange={setPage}
        />

        <DisputeDetail
          dispute={selected}
          note={note}
          onNoteChange={setNote}
          onResolve={resolve}
          resolving={resolving}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
