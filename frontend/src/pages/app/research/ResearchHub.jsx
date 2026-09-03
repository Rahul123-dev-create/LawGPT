import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookMarked, Loader2, Search as SearchIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import researchService from '../../../services/researchService';

const LIVE_RESEARCH_SLUGS = new Set([
  'judge-research',
  'constitution',
  'supreme-court',
  'high-court',
  'judgment-search',
  'case-comparison',
  'legal-dictionary',
]);

const DEFAULT_QUERY_BY_SLUG = {
  'judge-research': 'Administrative law judicial review of arbitrary transfers and statutory tenure protections',
  constitution: 'Article 14 Article 19 Article 21 constitutional due process and proportionality',
  'supreme-court': 'Supreme Court of India landmark judgments on writ jurisdiction, quashing, bail, and privacy',
  'high-court': 'High Court judgments on societies management, Article 226, and natural justice',
  'judgment-search': 'Search landmark Indian precedents by facts, issue, ratio decidendi, or citation',
  'case-comparison': 'Compare precedents on quashing FIR, interim stay of investigation, and bail jurisprudence',
  'legal-dictionary': 'Meaning of ratio decidendi, writ jurisdiction, quashing, natural justice, and proportionality',
};

function inferSectionFilter(slug) {
  if (slug === 'constitution') return 'Article 21';
  if (slug === 'judge-research') return 'Article 226';
  return '';
}

function PrecedentCard({ result }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug">{result.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.court} • {result.year} • {result.bench}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="accent">{result.citation}</Badge>
            <Badge variant="outline">{result.match_percentage}%</Badge>
          </div>
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ratio decidendi</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{result.ratio_decidendi}</p>

        {result.sections?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {result.sections.map((section) => (
              <Badge key={`${result.id}-${section}`} variant="outline">
                {section}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResearchHub({ registry, fallback = null }) {
  const { slug } = useParams();
  const { t } = useTranslation('nav');
  const tool = registry.find((item) => item.slug === slug);

  const live = LIVE_RESEARCH_SLUGS.has(slug);
  const initialQuery = useMemo(() => DEFAULT_QUERY_BY_SLUG[slug] || '', [slug]);
  const [query, setQuery] = useState(initialQuery);
  const [sectionFilter, setSectionFilter] = useState(inferSectionFilter(slug));
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(initialQuery);
    setSectionFilter(inferSectionFilter(slug));
  }, [initialQuery, slug]);

  useEffect(() => {
    if (!live || !initialQuery) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    researchService
      .searchJudgments({
        query: initialQuery,
        top_k: 5,
        section_filter: inferSectionFilter(slug) || undefined,
      })
      .then((data) => {
        if (!cancelled) setResults(data.results || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Research search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialQuery, live, slug]);

  const handleSearch = async (evt) => {
    evt.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a legal query to search landmark judgments.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await researchService.searchJudgments({
        query: trimmed,
        top_k: 5,
        section_filter: sectionFilter.trim() || undefined,
      });
      setResults(data.results || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Research search failed');
    } finally {
      setLoading(false);
    }
  };

  if (!live) return fallback;

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tool ? t(tool.labelKey) : slug}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Landmark precedent retrieval over the seeded Supreme Court of India and High Court corpus.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/cases/ongoing">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            {t('comingSoon.backToWorkspace')}
          </Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Search judgments</CardTitle>
          <CardDescription>
            Query by facts, articles, statutory sections, quashing grounds, bail issues, societies disputes, or constitutional principles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={handleSearch}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Describe the issue or legal principle" />
            </div>
            <Input value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} placeholder="Optional section filter" />
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <BookMarked className="mr-2 h-3.5 w-3.5" />}
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching landmark precedents…
        </p>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <BookMarked className="h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No matching judgments found for this query.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => (
            <PrecedentCard key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}