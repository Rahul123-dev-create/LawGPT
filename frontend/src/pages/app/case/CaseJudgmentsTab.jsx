import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BookMarked, Loader2, Search, Sparkles, Scale, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import researchService from '../../../services/researchService';

function PrecedentCard({ item, contextual = false }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-xl">{item.title}</CardTitle>
            <CardDescription className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1">
                <Landmark className="h-3.5 w-3.5" />
                {item.court} • {item.year}
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{item.citation}</Badge>
            <Badge variant="outline">Match {item.match_percentage}%</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ratio decidendi</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{item.ratio_decidendi}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Holding</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.holding}</p>
        </div>

        {contextual && item.practical_application && (
          <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Practical application to case</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{item.practical_application}</p>
          </div>
        )}

        {item.sections?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.sections.map((section) => (
              <Badge key={section} variant="outline">
                {section}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CaseJudgmentsTab() {
  const { caseId, caseData } = useOutletContext();
  const [precedents, setPrecedents] = useState([]);
  const [query, setQuery] = useState('');
  const [defaultQuery, setDefaultQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [queryMeta, setQueryMeta] = useState({ source: 'case', query: '', sectionFilter: '' });

  const loadCasePrecedents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await researchService.getCasePrecedents(caseId);
      setPrecedents(data.results || []);
      setDefaultQuery(data.query || '');
      setQuery(data.query || '');
      setSectionFilter(data.sectionFilter || '');
      setQueryMeta({ source: 'case', query: data.query || '', sectionFilter: data.sectionFilter || '' });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load precedents');
      setPrecedents([]);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCasePrecedents();
  }, [loadCasePrecedents]);

  const handleSearch = async (evt) => {
    evt.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a legal research query to search judgments.');
      return;
    }

    setSearching(true);
    setError('');
    try {
      const data = await researchService.searchJudgments({
        query: trimmed,
        top_k: 5,
        section_filter: sectionFilter.trim() || undefined,
      });
      setPrecedents(data.results || []);
      setQueryMeta({ source: 'manual', query: trimmed, sectionFilter: sectionFilter.trim() });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Judgment search failed');
    } finally {
      setSearching(false);
    }
  };

  const subtitle = useMemo(() => {
    if (queryMeta.source === 'manual') {
      return `Custom query within ${caseData.title}`;
    }
    return 'Auto-matched from the case summary, key issues, and identified statutes.';
  }, [caseData.title, queryMeta.source]);

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Similar Judgments</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadCasePrecedents} disabled={loading || searching}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
          Refresh case match
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Case Title: {caseData.title}</Badge>
            {queryMeta.sectionFilter && <Badge variant="accent">Section Filter: {queryMeta.sectionFilter}</Badge>}
          </div>

          <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={handleSearch}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by facts, issue, writ principle, quashing ground, bail issue, Article 21, etc."
                className="pl-9"
              />
            </div>
            <Input
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              placeholder="Optional section filter"
            />
            <Button type="submit" disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <BookMarked className="mr-2 h-3.5 w-3.5" />}
              Search
            </Button>
          </form>

          {defaultQuery && queryMeta.source === 'case' && (
            <p className="mt-3 text-xs text-muted-foreground">
              Initial case-derived query: {defaultQuery}
            </p>
          )}
          {queryMeta.query && queryMeta.source === 'manual' && (
            <p className="mt-3 text-xs text-muted-foreground">Showing results for: {queryMeta.query}</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Retrieving matching precedents…
        </p>
      ) : precedents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <Scale className="h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No precedents matched this query yet. Try broadening the facts or removing the section filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {precedents.map((item) => (
            <PrecedentCard key={`${item.id}-${queryMeta.source}`} item={item} contextual />
          ))}
        </div>
      )}
    </div>
  );
}