import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Pin, PinOff, Search as SearchIcon } from 'lucide-react';
import { caseStatusNav } from '../../config/navigation';
import { CASE_TYPES, CASE_PRIORITIES, STATUS_BADGE_VARIANT, PRIORITY_BADGE_VARIANT } from '../../config/caseOptions';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import caseService from '../../services/caseService';

/** Translates a sidebar status slug into the query params the API expects. */
function buildParams(status, { search, caseType, priority }) {
  const params = { limit: 50 };
  if (status === 'archived') params.isArchived = 'true';
  else if (status === 'pinned') params.isPinned = 'true';
  else if (['ongoing', 'won', 'lost', 'transferred', 'closed'].includes(status)) {
  params.status = status;
}
  // 'recent' → no extra filter, relies on the default -updatedAt sort

  if (search) params.search = search;
  if (caseType) params.caseType = caseType;
  if (priority) params.priority = priority;
  return params;
}

function CaseCard({ item, onTogglePin }) {
  const nextHearing = item.nextHearingDate ? new Date(item.nextHearingDate).toLocaleDateString() : null;

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/app/case/${item._id}/overview`} className="min-w-0">
          <p className="truncate font-display text-base font-semibold hover:text-primary">{item.title}</p>
          <p className="font-mono text-xs text-muted-foreground">{item.caseNumber}</p>
        </Link>
        <button
          onClick={() => onTogglePin(item)}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={item.isPinned ? 'Unpin case' : 'Pin case'}
        >
          {item.isPinned ? <Pin className="h-4 w-4 fill-current text-accent" /> : <PinOff className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={STATUS_BADGE_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
        <Badge variant={PRIORITY_BADGE_VARIANT[item.priority] || 'secondary'}>{item.priority}</Badge>
        <Badge variant="outline">{item.caseType}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {item.court && <span>{item.court}</span>}
        {nextHearing && <span>Next hearing: {nextHearing}</span>}
      </div>
    </Card>
  );
}

export default function CaseListView() {
  const { status } = useParams();
  const { t } = useTranslation('nav');
  const current = caseStatusNav.find((c) => c.status === status);
  const label = current ? t(current.labelKey) : status;
  const closedCaseOptions = [
  { status: 'won', labelKey: 'cases.won' },
  { status: 'lost', labelKey: 'cases.lost' },
  { status: 'transferred', labelKey: 'cases.transferred' },
  { status: 'closed', labelKey: 'cases.other' },
  ];
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [caseType, setCaseType] = useState('');
  const [priority, setPriority] = useState('');

  const fetchCases = useCallback(() => {
    setLoading(true);
    caseService
      .listCases(buildParams(status, { search, caseType, priority }))
      .then(({ cases: results }) => setCases(results))
      .finally(() => setLoading(false));
  }, [status, search, caseType, priority]);

  // Debounce search/filter changes rather than firing a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(fetchCases, 300);
    return () => clearTimeout(handle);
  }, [fetchCases]);

  const handleTogglePin = async (item) => {
    const updated = await caseService.togglePin(item._id, !item.isPinned);
    setCases((prev) =>
      status === 'pinned' && !updated.isPinned
        ? prev.filter((c) => c._id !== item._id)
        : prev.map((c) => (c._id === item._id ? updated : c))
    );
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">{label}</h1>
        <Button size="sm" asChild>
          <Link to="/app/cases/new">New case</Link>
        </Button>
      </div>
      {['closed', 'won', 'lost', 'transferred'].includes(status) && (
  <div className="mb-6 rounded-lg border border-border bg-card p-3">
    <div className="flex flex-wrap gap-2">
      {closedCaseOptions.map((option) => (
        <Button
          key={option.status}
          size="sm"
          variant={status === option.status ? 'default' : 'outline'}
          asChild
        >
          <Link to={`/app/cases/${option.status}`}>
            {t(option.labelKey)}
          </Link>
        </Button>
      ))}
    </div>

    <p className="mt-3 text-xs text-muted-foreground">
      {status === 'closed'
        ? 'Select a closed-case category.'
        : `Showing: ${t(
            closedCaseOptions.find((option) => option.status === status)?.labelKey ||
              'cases.other'
          )}`}
    </p>
  </div>
)}

      <div className="mb-6 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, case number, party, court, tags…"
            className="pl-9"
          />
        </div>
        <Select value={caseType || '__all__'} onValueChange={(v) => setCaseType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Case type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {CASE_TYPES.map((ct) => (
              <SelectItem key={ct} value={ct}>{ct}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority || '__all__'} onValueChange={(v) => setPriority(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All priorities</SelectItem>
            {CASE_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading cases…</p>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            {search || caseType || priority ? 'No cases match these filters.' : 'No cases here yet.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" asChild>
              <Link to="/app/cases/new">Start a case</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cases.map((item) => (
            <CaseCard key={item._id} item={item} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}
    </div>
  );
}
