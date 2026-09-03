import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Loader2, Download, FileText, CheckCircle2, AlertTriangle,
  BarChart3, Users, Scale, BookOpen, Gavel, ShieldCheck,
} from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { getReportMetadata, downloadCasePdfReport } from '../../../services/reportService';

const SECTION_ICONS = {
  cover: FileText,
  summary: BarChart3,
  timeline: FileText,
  entities: Users,
  statutes: BookOpen,
  precedents: Gavel,
  arguments: Scale,
  evidence: ShieldCheck,
};

const SECTION_DEFAULTS = {
  includePrecedents: true,
  includeArguments: true,
  includeEvidenceScorecard: true,
};

export default function CaseReportsTab() {
  const { caseId } = useOutletContext();
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [lastDownload, setLastDownload] = useState(null);
  const [options, setOptions] = useState({ ...SECTION_DEFAULTS });

  const loadMetadata = useCallback(async () => {
    try {
      const data = await getReportMetadata(caseId);
      setMetadata(data);
    } catch (err) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.message || err.message || 'Could not load report metadata');
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    setLoading(true);
    setError('');
    loadMetadata();
  }, [loadMetadata]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const result = await downloadCasePdfReport(caseId, options);
      setLastDownload(result);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Report generation failed');
    } finally {
      setDownloading(false);
    }
  };

  const toggleOption = (key) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="container max-w-3xl py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Case Report</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generate a comprehensive PDF report of all case data — analysis, arguments, evidence, and timeline.
          </p>
        </div>
        <Button size="sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-2 h-3.5 w-3.5" />
          )}
          Download PDF
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lastDownload && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Downloaded: {lastDownload.filename} ({(lastDownload.size / 1024).toFixed(0)} KB)</span>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading report data...</p>
      ) : (
        <div className="space-y-4">
          {/* Completeness indicator */}
          {metadata && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Report Completeness</h3>
                <Badge variant={metadata.completeness >= 75 ? 'default' : 'secondary'}>
                  {metadata.completeness}%
                </Badge>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metadata.completeness >= 75
                      ? 'bg-emerald-500'
                      : metadata.completeness >= 40
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                  style={{ width: `${metadata.completeness}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {metadata.documentsCount} documents &middot; {metadata.hearingsCount} hearings
              </p>
            </Card>
          )}

          {/* Section checklist */}
          {metadata && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Report Sections</h3>
              <div className="space-y-2">
                {metadata.sections.map((section) => {
                  const Icon = SECTION_ICONS[section.id] || FileText;
                  return (
                    <div
                      key={section.id}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
                        section.available
                          ? 'border-border bg-background'
                          : 'border-border/50 bg-muted/30 opacity-60'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">{section.label}</span>
                      {section.available ? (
                        <Badge variant="outline" className="text-[10px]">
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                          Available
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] opacity-60">
                          No data
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Section toggles */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Include Sections</h3>
            <div className="space-y-2">
              {[
                { key: 'includePrecedents', label: 'Judicial Precedents (Section 5)', icon: Gavel },
                { key: 'includeArguments', label: 'Legal Arguments (Section 6)', icon: Scale },
                { key: 'includeEvidenceScorecard', label: 'Evidence Scorecard (Section 7)', icon: ShieldCheck },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => toggleOption(key)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    options[key]
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/50'
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      options[key]
                        ? 'border-primary bg-primary text-white'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {options[key] && <CheckCircle2 className="h-3 w-3" />}
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Download CTA */}
          <div className="flex justify-end">
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-2 h-3.5 w-3.5" />
              )}
              Download PDF Report
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
