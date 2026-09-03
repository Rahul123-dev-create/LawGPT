import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Loader2, RefreshCw, AlertTriangle, Scale, ShieldCheck, FileText,
  ChevronDown, ChevronRight, BookOpen, Gavel, CheckCircle2,
} from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import caseService from '../../../services/caseService';

const STRENGTH_COLORS = {
  High: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-red-100 text-red-700 border-red-200',
};

const ADMISSIBILITY_COLORS = {
  High: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-red-50 text-red-700 border-red-200',
};

function EvidenceScoreBar({ item }) {
  const pct = Math.max(0, Math.min(100, item.score));
  let barColor = 'bg-red-400';
  if (pct >= 70) barColor = 'bg-emerald-500';
  else if (pct >= 45) barColor = 'bg-amber-400';

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{item.documentName || 'Document'}</span>
            {item.primaryEvidence && (
              <Badge variant="accent" className="shrink-0 px-1.5 text-[10px]">
                <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                Primary
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{item.docType || 'Unknown type'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={`text-xs ${ADMISSIBILITY_COLORS[item.admissibility] || ''}`}>
            {item.admissibility}
          </Badge>
          <span className="text-sm font-bold tabular-nums">{pct}%</span>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {item.reasoning && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reasoning}</p>
      )}
    </div>
  );
}

function GroundCard({ item, side }) {
  const [open, setOpen] = useState(false);
  const strengthClass = STRENGTH_COLORS[item.strength] || STRENGTH_COLORS.Medium;

  return (
    <div className="rounded-md border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 text-sm font-medium">{item.title || 'Ground'}</span>
        {item.strength && side === 'petitioner' && (
          <Badge variant="outline" className={`shrink-0 text-[10px] ${strengthClass}`}>
            {item.strength}
          </Badge>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3 text-sm">
          {side === 'petitioner' ? (
            <>
              {item.legalGround && (
                <div className="mb-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Legal Ground</span>
                  <p className="mt-0.5 text-foreground">{item.legalGround}</p>
                </div>
              )}
              {item.proceduralViolations?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Procedural Violations</span>
                  <ul className="mt-1 space-y-1">
                    {item.proceduralViolations.map((v, i) => (
                      <li key={i} className="flex gap-2 text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                        {v}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.citations?.length > 0 && (
                <div>
                  <span className="text-xs font-medium uppercase text-muted-foreground">Citations</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.citations.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        <BookOpen className="mr-1 h-2.5 w-2.5" />
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {item.defenseStrategy && (
                <div className="mb-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Defense Strategy</span>
                  <p className="mt-0.5 text-foreground">{item.defenseStrategy}</p>
                </div>
              )}
              {item.counterArguments?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Counter-Arguments</span>
                  <ul className="mt-1 space-y-1">
                    {item.counterArguments.map((c, i) => (
                      <li key={i} className="flex gap-2 text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.mitigatingFactors?.length > 0 && (
                <div>
                  <span className="text-xs font-medium uppercase text-muted-foreground">Mitigating Factors</span>
                  <ul className="mt-1 space-y-1">
                    {item.mitigatingFactors.map((m, i) => (
                      <li key={i} className="flex gap-2 text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ArgumentsView({ args }) {
  const [activeSide, setActiveSide] = useState('petitioner');
  const petitioner = args.arguments?.petitioner || [];
  const respondent = args.arguments?.respondent || [];
  const evidenceScores = args.evidenceScores || [];
  const metrics = args.summaryMetrics || {};

  return (
    <div className="space-y-4">
      {/* Summary metrics */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4 text-primary" />
          Evidence Health Summary
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{metrics.evidenceHealthScore || 0}%</p>
            <p className="text-xs text-muted-foreground">Health Score</p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{metrics.totalGrounds || 0}</p>
            <p className="text-xs text-muted-foreground">Petitioner Grounds</p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{metrics.totalRebuttals || 0}</p>
            <p className="text-xs text-muted-foreground">Respondent Rebuttals</p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{metrics.evidenceCount || 0}</p>
            <p className="text-xs text-muted-foreground">Documents Scored</p>
          </div>
        </div>
      </Card>

      {/* Evidence Strength Meter */}
      {evidenceScores.length > 0 && (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Evidence Strength Meter
          </h3>
          <div className="mt-3 space-y-2">
            {evidenceScores.map((item, i) => (
              <EvidenceScoreBar key={item.documentId || i} item={item} />
            ))}
          </div>
        </Card>
      )}

      {/* Arguments: Petitioner / Respondent */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gavel className="h-4 w-4 text-primary" />
          Structured Arguments
        </h3>
        <div className="mt-3 flex gap-1 rounded-md border border-border p-0.5">
          <button
            onClick={() => setActiveSide('petitioner')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSide === 'petitioner'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Petitioner / Prosecution ({petitioner.length})
          </button>
          <button
            onClick={() => setActiveSide('respondent')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSide === 'respondent'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Respondent / Defense ({respondent.length})
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {activeSide === 'petitioner' ? (
            petitioner.length > 0 ? (
              petitioner.map((item, i) => (
                <GroundCard key={i} item={item} side="petitioner" />
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No petitioner grounds generated.</p>
            )
          ) : respondent.length > 0 ? (
            respondent.map((item, i) => (
              <GroundCard key={i} item={item} side="respondent" />
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No respondent rebuttals generated.</p>
          )}
        </div>
      </Card>

      {args.generationMode && (
        <p className="text-xs text-muted-foreground">
          Generated via {args.generationMode === 'llm' ? 'Gemini LLM' : 'deterministic rule-based fallback'}
        </p>
      )}
    </div>
  );
}

export default function CaseArgumentsTab() {
  const { caseId } = useOutletContext();
  const [args, setArgs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const existing = await caseService.getCaseArguments(caseId);
      setArgs(existing);
    } catch (err) {
      if (err.response?.status === 404) {
        setArgs(null);
      } else {
        setError(err.response?.data?.message || err.message || 'Could not load arguments');
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    setLoading(true);
    setError('');
    load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await caseService.generateCaseArguments(caseId);
      setArgs(result);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Argument generation failed');
      try {
        await load();
      } catch (_e) {
        /* no persisted state */
      }
    } finally {
      setGenerating(false);
    }
  };

  const isFailed = args?.status === 'failed';

  return (
    <div className="container max-w-3xl py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Arguments &amp; Evidence</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Petitioner vs. respondent structured arguments with per-document evidence strength scoring.
          </p>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : args ? (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          ) : (
            <Scale className="mr-2 h-3.5 w-3.5" />
          )}
          {args ? 'Regenerate' : 'Generate arguments'}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading arguments...</p>
      ) : generating ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating structured arguments — this can take a minute...
        </p>
      ) : isFailed ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <p className="mt-3 text-sm font-medium">Argument generation failed</p>
          {args?.error && <p className="mt-1 max-w-md text-sm text-muted-foreground">{args.error}</p>}
          <Button size="sm" variant="outline" className="mt-4" onClick={handleGenerate}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : !args ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <Scale className="h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No arguments generated yet. Run AI analysis first, then generate arguments.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={handleGenerate}>
            <Scale className="mr-2 h-3.5 w-3.5" />
            Generate arguments
          </Button>
        </div>
      ) : (
        <ArgumentsView args={args} />
      )}
    </div>
  );
}
