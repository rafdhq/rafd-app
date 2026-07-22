import { useEffect, useState } from 'react';
import { Gift, Plus, Sparkles, Star } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useI18n } from '../contexts/I18nContext';
import { tierLabel } from '../lib/loyalty/engine';
import type { Customer } from '../lib/types';

export default function Loyalty() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<Record<string, unknown> | null>(null);
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [offers, setOffers] = useState<Array<Record<string, unknown>>>([]);
  const [recent, setRecent] = useState<Array<Record<string, unknown>>>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offerForm, setOfferForm] = useState({
    title: '',
    title_en: '',
    description: '',
    offer_type: 'percent',
    value: 10,
    min_tier: 'bronze',
    min_points: 0,
  });
  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    action: 'earn',
    points: 100,
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    const [lRes, cRes] = await Promise.all([fetch('/api/loyalty'), fetch('/api/customers')]);
    if (lRes.ok) {
      const data = await lRes.json();
      setProgram(data.program);
      setAccounts(data.accounts || []);
      setOffers(data.offers || []);
      setRecent(data.recent || []);
    }
    if (cRes.ok) setCustomers(await cRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const saveProgram = async () => {
    if (!program) return;
    setBusy(true);
    await fetch('/api/loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_program', ...program }),
    });
    setBusy(false);
    load();
  };

  const createOffer = async () => {
    setBusy(true);
    await fetch('/api/loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_offer', ...offerForm }),
    });
    setBusy(false);
    setOfferOpen(false);
    load();
  };

  const runAdjust = async () => {
    setBusy(true);
    await fetch('/api/loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: adjustForm.action,
        customer_id: Number(adjustForm.customer_id),
        points: Number(adjustForm.points),
        notes: adjustForm.notes,
      }),
    });
    setBusy(false);
    setAdjustOpen(false);
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title={t('loyalty')}
        description={
          locale === 'ar'
            ? 'نقاط · استبدال · مستويات · عروض تلقائية'
            : 'Points · redeem · tiers · auto offers'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(true)}>
              <Star className="h-4 w-4" />
              {locale === 'ar' ? 'منح/استبدال' : 'Earn/Redeem'}
            </Button>
            <Button onClick={() => setOfferOpen(true)}>
              <Plus className="h-4 w-4" />
              {locale === 'ar' ? 'عرض' : 'Offer'}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={locale === 'ar' ? 'إعدادات البرنامج' : 'Program settings'} />
          <CardBody className="space-y-3">
            {program && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!program.enabled}
                    onChange={(e) => setProgram({ ...program, enabled: e.target.checked })}
                  />
                  {locale === 'ar' ? 'مفعّل' : 'Enabled'}
                </label>
                <Input
                  label={locale === 'ar' ? 'نقاط لكل وحدة عملة' : 'Points per currency'}
                  type="number"
                  value={Number(program.points_per_currency || 0)}
                  onChange={(e) => setProgram({ ...program, points_per_currency: Number(e.target.value) })}
                />
                <Input
                  label={locale === 'ar' ? 'نقاط = 1 وحدة عند الاستبدال' : 'Points per 1 currency redeem'}
                  type="number"
                  value={Number(program.redemption_rate || 0)}
                  onChange={(e) => setProgram({ ...program, redemption_rate: Number(e.target.value) })}
                />
                <Input
                  label={locale === 'ar' ? 'حد أدنى للاستبدال' : 'Min redeem points'}
                  type="number"
                  value={Number(program.min_redeem_points || 0)}
                  onChange={(e) => setProgram({ ...program, min_redeem_points: Number(e.target.value) })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {(['silver_min', 'gold_min', 'platinum_min'] as const).map((k) => (
                    <Input
                      key={k}
                      label={k}
                      type="number"
                      value={Number(program[k] || 0)}
                      onChange={(e) => setProgram({ ...program, [k]: Number(e.target.value) })}
                    />
                  ))}
                </div>
                <Button loading={busy} onClick={saveProgram}>
                  {t('save')}
                </Button>
              </>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={locale === 'ar' ? 'حسابات الولاء' : 'Loyalty accounts'} />
          <CardBody className="pt-0">
            <Table className="border-0">
              <THead>
                <TH>{locale === 'ar' ? 'عميل' : 'Customer'}</TH>
                <TH>{t('points')}</TH>
                <TH>{locale === 'ar' ? 'مدى الحياة' : 'Lifetime'}</TH>
                <TH>{t('tier')}</TH>
              </THead>
              <TBody>
                {accounts.map((a) => {
                  const c = customers.find((x) => x.id === Number(a.customer_id));
                  return (
                    <tr key={String(a.id)}>
                      <TD>{c?.name || `#${a.customer_id}`}</TD>
                      <TD className="tabular font-semibold">{Number(a.points_balance || 0)}</TD>
                      <TD className="tabular">{Number(a.lifetime_points || 0)}</TD>
                      <TD>
                        <Badge tone="accent">{tierLabel(String(a.tier || 'bronze'), locale)}</Badge>
                      </TD>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Gift className="h-4 w-4" />
                {locale === 'ar' ? 'العروض' : 'Offers'}
              </span>
            }
          />
          <CardBody className="space-y-2">
            {offers.map((o) => (
              <div key={String(o.id)} className="rounded-2xl border border-app p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{locale === 'ar' ? String(o.title) : String(o.title_en || o.title)}</div>
                  <Badge tone={o.active ? 'success' : 'default'}>{o.active ? t('active') : t('inactive')}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {String(o.offer_type)} · {String(o.value)} · {tierLabel(String(o.min_tier || 'bronze'), locale)}
                </div>
              </div>
            ))}
            {!offers.length && <div className="text-sm text-muted">{t('noData')}</div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {locale === 'ar' ? 'آخر الحركات' : 'Recent ledger'}
              </span>
            }
          />
          <CardBody className="space-y-2">
            {recent.map((r) => (
              <div key={String(r.id)} className="flex justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                <span>
                  #{String(r.customer_id)} · {String(r.type)}
                </span>
                <span className="tabular font-semibold">{Number(r.points)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        title={locale === 'ar' ? 'عرض ولاء' : 'Loyalty offer'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOfferOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={createOffer}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Title AR" value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} />
          <Input label="Title EN" value={offerForm.title_en} onChange={(e) => setOfferForm({ ...offerForm, title_en: e.target.value })} />
          <Select
            label="Type"
            value={offerForm.offer_type}
            onChange={(e) => setOfferForm({ ...offerForm, offer_type: e.target.value })}
            options={[
              { value: 'percent', label: '%' },
              { value: 'fixed', label: 'Fixed' },
              { value: 'points_bonus', label: 'Points bonus' },
            ]}
          />
          <Input
            label="Value"
            type="number"
            value={offerForm.value}
            onChange={(e) => setOfferForm({ ...offerForm, value: Number(e.target.value) })}
          />
          <Select
            label="Min tier"
            value={offerForm.min_tier}
            onChange={(e) => setOfferForm({ ...offerForm, min_tier: e.target.value })}
            options={['bronze', 'silver', 'gold', 'platinum'].map((x) => ({ value: x, label: tierLabel(x, locale) }))}
          />
        </div>
      </Dialog>

      <Dialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={locale === 'ar' ? 'حركة نقاط' : 'Points movement'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={runAdjust}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label={locale === 'ar' ? 'العميل' : 'Customer'}
            value={adjustForm.customer_id}
            onChange={(e) => setAdjustForm({ ...adjustForm, customer_id: e.target.value })}
            placeholder="—"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Action"
            value={adjustForm.action}
            onChange={(e) => setAdjustForm({ ...adjustForm, action: e.target.value })}
            options={[
              { value: 'earn', label: locale === 'ar' ? 'منح' : 'Earn' },
              { value: 'redeem', label: t('redeem') },
            ]}
          />
          <Input
            label={t('points')}
            type="number"
            value={adjustForm.points}
            onChange={(e) => setAdjustForm({ ...adjustForm, points: Number(e.target.value) })}
          />
          <Input
            label={locale === 'ar' ? 'ملاحظات' : 'Notes'}
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
          />
        </div>
      </Dialog>
    </div>
  );
}
