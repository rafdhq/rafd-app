import Logo, { RafdMark } from '../components/brand/Logo';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';

const colors = [
  { name: 'Rafd Teal', token: '--primary', value: '#0d9488' },
  { name: 'Sand Amber', token: '--accent', value: '#d97706' },
  { name: 'Ink', token: '--text', value: '#0f172a' },
  { name: 'Success', token: '--success', value: '#059669' },
  { name: 'Danger', token: '--danger', value: '#dc2626' },
  { name: 'Info', token: '--info', value: '#0284c7' },
];

export default function BrandGuidelines() {
  return (
    <div>
      <PageHeader
        title="هوية رفد | Brand System"
        description="Trust · Speed · Simplicity · Reliability · Growth · Technology · Professionalism"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الشعار" description="Logo concept — حرف الراء + نمو" />
          <CardBody className="space-y-6">
            <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-muted p-6">
              <Logo size="lg" />
              <Logo size="md" variant="mark" />
              <div className="rounded-2xl bg-[#042f2e] p-4">
                <Logo inverted size="md" />
              </div>
            </div>
            <div className="flex gap-4">
              <RafdMark size={64} />
              <RafdMark size={48} />
              <RafdMark size={36} />
              <RafdMark size={28} />
            </div>
            <p className="text-sm text-secondary">
              الشعار يجمع بين حرف الراء stylized كرمز للرفد/الإمداد، ونقطة نمو بلون الرمل الذهبي.
              مناسب للتطبيق، الفواتير، واللافتات.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="استراتيجية العلامة" />
          <CardBody className="space-y-3 text-sm text-secondary">
            <p>
              <strong className="text-app">الوعد:</strong> إدارة بقالة حديثة تعمل بسرعة الثقة — حتى بدون إنترنت.
            </p>
            <p>
              <strong className="text-app">الجمهور:</strong> ملاك المتاجر، الكاشير، المستودع، المدراء، المحاسبون في اليمن والسعودية.
            </p>
            <p>
              <strong className="text-app">التموضع:</strong> ليس نظام محاسبة تقليدي — بل منصة تشغيل POS/ERP خفيفة تنافس Shopify POS و Square.
            </p>
            <p>
              <strong className="text-app">الصوت:</strong> واضح، هادئ، واثق، بلا مصطلحات تقنية زائدة.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="نظام الألوان" description="Light + Dark tokens" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {colors.map((c) => (
                <div key={c.name} className="overflow-hidden rounded-2xl border border-app">
                  <div className="h-16" style={{ background: c.value }} />
                  <div className="p-2 text-xs">
                    <div className="font-medium text-app">{c.name}</div>
                    <div className="text-muted">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الخطوط" description="IBM Plex Sans Arabic" />
          <CardBody className="space-y-3">
            <div className="text-3xl font-bold">إدارة أسرع. مبيعات أوضح.</div>
            <div className="text-xl font-semibold">Display / SemiBold 600</div>
            <div className="text-base">Body / Regular 400 — واجهات يومية مريحة للقراءة الطويلة</div>
            <div className="text-sm text-muted">Caption / Medium 500 — جداول، شارات، تلميحات</div>
            <div className="rounded-xl bg-muted p-3 font-mono text-sm tabular">1,250.00 ر.س — tabular nums</div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="مكونات النظام" description="Buttons · Inputs · Badges" />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="max-w-sm">
              <Input label="حقل إدخال" placeholder="مثال: اسم المنتج" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary" dot>Primary</Badge>
              <Badge tone="success" dot>Success</Badge>
              <Badge tone="warning" dot>Warning</Badge>
              <Badge tone="danger" dot>Danger</Badge>
              <Badge tone="info" dot>Info</Badge>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="مبادئ التصميم" />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Offline First', 'كل مسار حرج يعمل محلياً'],
                ['RTL First', 'العربية أصلية وليست ترجمة'],
                ['Touch First', 'أهداف لمس ≥ 44px'],
                ['3 Clicks Max', 'أي ميزة خلال ثلاث نقرات'],
                ['Minimal', 'لا زخرفة بلا وظيفة'],
                ['Fast', 'استجابة فورية وتغذية راجعة'],
                ['Accessible', 'WCAG AA وتباين واضح'],
                ['Productive', 'اختصارات للكاشير المحترف'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-app bg-subtle p-4">
                  <div className="font-semibold text-app">{t}</div>
                  <div className="mt-1 text-sm text-muted">{d}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
