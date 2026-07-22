import { useEffect, useState } from 'react';
import { Bot, Send, Sparkles, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import { useI18n } from '../contexts/I18nContext';
import { formatMoney } from '../lib/utils';
import { useTenant } from '../contexts/TenantContext';

interface Insight {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
}

interface Analysis {
  insights: Insight[];
  stats: Record<string, number>;
  reorderSuggestions: Array<{ id: number; name: string; stock: number; min: number; suggestQty: number }>;
  deadStock: Array<{ id: number; name: string; stock: number; value: number }>;
  topProducts: Array<{ id: number; name: string; revenue: number; qty: number }>;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

export default function AIAssistant() {
  const { locale, t } = useI18n();
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ai?locale=${locale}`);
      if (!res.ok) throw new Error(await res.text());
      setAnalysis(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [locale]);

  const ask = async (preset?: string) => {
    const message = (preset || question).trim();
    if (!message) return;
    setBusy(true);
    setChat((c) => [...c, { role: 'user', text: message }]);
    setQuestion('');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, locale }),
      });
      if (!res.ok) throw new Error('AI failed');
      const data = await res.json();
      setChat((c) => [...c, { role: 'assistant', text: data.answer }]);
      if (data.analysis) setAnalysis(data.analysis);
    } catch {
      setChat((c) => [
        ...c,
        {
          role: 'assistant',
          text: locale === 'ar' ? 'تعذر الحصول على إجابة.' : 'Could not get an answer.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !analysis) return <ErrorState description={error} onRetry={load} />;

  const tone = (s: string) =>
    s === 'success' ? 'success' : s === 'warning' ? 'warning' : s === 'danger' ? 'danger' : 'info';

  const presets =
    locale === 'ar'
      ? ['كيف كانت المبيعات؟', 'ما الأرباح؟', 'ما المنتجات التي تحتاج إعادة طلب؟', 'ما المنتجات الراكدة؟']
      : ['How were sales?', 'What is the profit?', 'What needs reorder?', 'What is dead stock?'];

  return (
    <div>
      <PageHeader
        title={t('aiAssistant')}
        description={
          locale === 'ar'
            ? 'تحليل مبيعات · أرباح · إعادة طلب · راكد — بالعربية والإنجليزية'
            : 'Sales · profit · reorder · dead stock — Arabic & English'
        }
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            {locale === 'ar' ? 'تحديث' : 'Refresh'}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: 'revenue_7d', ar: 'إيراد 7 أيام', en: '7d revenue' },
          { k: 'revenue_30d', ar: 'إيراد 30 يوماً', en: '30d revenue' },
          { k: 'net_30d', ar: 'صافي 30 يوماً', en: '30d net' },
          { k: 'margin_pct', ar: 'هامش %', en: 'Margin %' },
        ].map((m) => (
          <Card key={m.k}>
            <CardBody>
              <div className="text-sm text-muted">{locale === 'ar' ? m.ar : m.en}</div>
              <div className="mt-1 text-2xl font-bold tabular">
                {m.k === 'margin_pct'
                  ? `${Number(analysis.stats[m.k] || 0).toFixed(1)}%`
                  : formatMoney(analysis.stats[m.k], currency)}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {analysis.insights.map((ins) => (
              <Card key={ins.id}>
                <CardBody>
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <div className="font-semibold text-app">{ins.title}</div>
                    <Badge tone={tone(ins.severity) as 'info'} className="ms-auto">
                      {ins.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-secondary whitespace-pre-wrap">{ins.body}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title={locale === 'ar' ? 'اقتراحات إعادة الطلب' : 'Reorder suggestions'} />
            <CardBody className="space-y-2">
              {!analysis.reorderSuggestions.length && (
                <div className="text-sm text-muted">{t('noData')}</div>
              )}
              {analysis.reorderSuggestions.slice(0, 12).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular text-muted">
                    {r.stock}/{r.min} → <strong className="text-app">{r.suggestQty}</strong>
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={locale === 'ar' ? 'راكد' : 'Dead stock'} />
            <CardBody className="space-y-2">
              {analysis.deadStock.slice(0, 12).map((d) => (
                <div key={d.id} className="flex justify-between rounded-xl border border-app px-3 py-2 text-sm">
                  <span>{d.name}</span>
                  <span className="tabular text-muted">
                    {d.stock} · {formatMoney(d.value, currency)}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <Card className="xl:col-span-1">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                {t('aiAssistant')}
              </span>
            }
          />
          <CardBody className="flex h-[520px] flex-col">
            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className="rounded-full border border-app bg-subtle px-3 py-1 text-xs text-secondary hover:border-primary hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-muted/50 p-3">
              {!chat.length && (
                <div className="text-center text-sm text-muted py-10">
                  {locale === 'ar' ? 'ابدأ بسؤال عن أداء متجرك' : 'Start with a question about your store'}
                </div>
              )}
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ms-auto bg-primary text-inverse'
                      : 'me-auto bg-surface border border-app text-app'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ask()}
                placeholder={t('askAi')}
                className="h-11 flex-1 rounded-xl border border-app bg-surface px-3 text-sm"
              />
              <Button loading={busy} onClick={() => ask()}>
                <Send className="h-4 w-4" />
                {t('send')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
