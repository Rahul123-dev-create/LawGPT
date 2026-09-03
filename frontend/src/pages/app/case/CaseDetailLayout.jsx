import { useState, useEffect, useCallback } from 'react';
import { useParams, NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard, Clock, Gavel, Users, StickyNote, Activity, Paperclip,
  ShieldCheck, UserSearch, ScrollText, BookMarked, Sparkles, Target,
  FileBarChart, Pencil, Pin, MoreHorizontal, Archive, RotateCcw, Trash2,
  RotateCw, ArrowRightLeft, AlertTriangle, Scale, MessageSquare, Download,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '../../../components/ui/dropdown-menu';
import { Button } from '../../../components/ui/button';
import { STATUS_BADGE_VARIANT, PRIORITY_BADGE_VARIANT, CASE_STATUSES } from '../../../config/caseOptions';
import { cn } from '../../../utils/cn';
import caseService from '../../../services/caseService';

const REAL_TABS = [
  { slug: 'overview', label: 'Overview', icon: LayoutDashboard },
  { slug: 'timeline', label: 'Timeline', icon: Clock },
  { slug: 'hearings', label: 'Hearings', icon: Gavel },
  { slug: 'documents', label: 'Documents', icon: Paperclip },
  { slug: 'judgments', label: 'Judgments', icon: BookMarked },
  { slug: 'ai-analysis', label: 'AI Analysis', icon: Sparkles },
  { slug: 'laws', label: 'Applicable Laws', icon: ScrollText },
  { slug: 'arguments', label: 'Arguments', icon: Scale },
  { slug: 'chat', label: 'Chat', icon: MessageSquare },
  { slug: 'reports', label: 'Reports', icon: Download },
  { slug: 'parties', label: 'Parties', icon: Users },
  { slug: 'notes', label: 'Notes', icon: StickyNote },
  { slug: 'activity', label: 'Activity', icon: Activity },
];

// Slug, label, icon, and which module builds it — rendered by the generic
// CaseComingSoonTab so these don't need one file each. ai-analysis and laws
// were built by Module 5 Phase 3 and moved to REAL_TABS above.
export const COMING_SOON_TABS = [
  { slug: 'evidence', label: 'Evidence', icon: ShieldCheck, plannedModule: 4 },
  { slug: 'witnesses', label: 'Witnesses', icon: UserSearch, plannedModule: 4 },
  { slug: 'strategy', label: 'Courtroom Strategy', icon: Target, plannedModule: 8 },
];

export default function CaseDetailLayout() {
  const { caseId } = useParams();
  const [caseData, setCaseData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    return caseService.getCase(caseId).then(({ case: c, stats: s }) => {
      setCaseData(c);
      setStats(s);
      setLoading(false);
    });
  }, [caseId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  const handleTogglePin = async () => {
    const updated = await caseService.togglePin(caseId, !caseData.isPinned);
    setCaseData(updated);
  };

  const handleStatusChange = async (status) => {
    const updated = await caseService.changeStatus(caseId, status);
    setCaseData(updated);
  };

  const handleArchiveToggle = async () => {
    const updated = caseData.isArchived ? await caseService.restoreCase(caseId) : await caseService.archiveCase(caseId);
    setCaseData(updated);
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this case? It will be hidden from all lists but can be restored — nothing is permanently destroyed.')) return;
    await caseService.deleteCase(caseId);
    setCaseData((prev) => ({ ...prev, isDeleted: true, deletedAt: new Date().toISOString() }));
  };

  const handleUndelete = async () => {
    const updated = await caseService.undeleteCase(caseId);
    setCaseData(updated);
  };

  if (loading) {
    return <div className="container py-12 text-sm text-muted-foreground">Loading case…</div>;
  }
  if (!caseData) {
    return <div className="container py-12 text-sm text-muted-foreground">Case not found.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 pt-6 sm:px-6">
        {caseData.isDeleted && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>
                This case was deleted on {new Date(caseData.deletedAt).toLocaleDateString()}. It&apos;s hidden from
                all case lists but nothing was destroyed — hearings, parties, and notes are intact.
              </span>
              <Button size="sm" variant="outline" onClick={handleUndelete}>
                <RotateCw className="mr-2 h-3.5 w-3.5" />
                Restore case
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!caseData.isDeleted && caseData.isArchived && (
          <Alert className="mb-4">
            <Archive className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>This case is archived — hidden from your status filters, still shown under &quot;Archived Cases&quot;.</span>
              <Button size="sm" variant="outline" onClick={handleArchiveToggle}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Restore from archive
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{caseData.caseNumber}</p>
            <h1 className="truncate font-display text-2xl font-semibold">{caseData.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={STATUS_BADGE_VARIANT[caseData.status] || 'secondary'}>{caseData.status}</Badge>
              <Badge variant={PRIORITY_BADGE_VARIANT[caseData.priority] || 'secondary'}>{caseData.priority}</Badge>
              <Badge variant="outline">{caseData.caseType}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleTogglePin}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted',
                caseData.isPinned && 'border-accent/40 bg-accent/10 text-accent'
              )}
              aria-label={caseData.isPinned ? 'Unpin case' : 'Pin case'}
            >
              <Pin className={cn('h-4 w-4', caseData.isPinned && 'fill-current')} />
            </button>
            <Link
              to={`/app/case/${caseId}/edit`}
              className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Change status</DropdownMenuLabel>
                {CASE_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    disabled={caseData.status === s.value}
                    onSelect={() => handleStatusChange(s.value)}
                  >
                    <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                    {s.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleArchiveToggle}>
                  {caseData.isArchived ? <RotateCcw className="mr-2 h-3.5 w-3.5" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
                  {caseData.isArchived ? 'Restore from archive' : 'Archive case'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete case
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 overflow-x-auto pb-2">
          {REAL_TABS.map((tab) => (
            <NavLink
              key={tab.slug}
              to={`/app/case/${caseId}/${tab.slug}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm',
                  isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'
                )
              }
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          ))}
          <span className="mx-1 my-auto h-4 w-px bg-border" />
          {COMING_SOON_TABS.map((tab) => (
            <NavLink
              key={tab.slug}
              to={`/app/case/${caseId}/${tab.slug}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground/70 hover:bg-muted',
                  isActive && 'bg-muted font-medium text-muted-foreground'
                )
              }
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ caseData, stats, refetch, caseId }} />
      </div>
    </div>
  );
}
