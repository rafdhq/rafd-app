import { COUNTRY_CODES, cn } from '../../lib/utils';

export default function PhoneWhatsAppField({
  countryCode,
  localPhone,
  onCountryChange,
  onLocalChange,
  label = 'رقم الواتساب',
  required,
}: {
  countryCode: string;
  localPhone: string;
  onCountryChange: (code: string) => void;
  onLocalChange: (local: string) => void;
  label?: string;
  required?: boolean;
}) {
  return (
    <div className="w-full min-w-0">
      <label className="mb-1.5 block text-sm font-medium text-secondary">
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="flex min-w-0 flex-col gap-2 xs:flex-row sm:flex-row" dir="ltr">
        <select
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value)}
          className={cn(
            'h-11 w-full shrink-0 rounded-xl border border-app bg-surface px-2 text-sm text-app shadow-soft sm:w-auto sm:max-w-[11rem]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'
          )}
          aria-label="رمز الدولة"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code} {c.label}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={localPhone}
          onChange={(e) => onLocalChange(e.target.value.replace(/[^\d\s-]/g, ''))}
          placeholder="7xxxxxxxx"
          className="h-11 w-full min-w-0 rounded-xl border border-app bg-surface px-3.5 text-sm text-app shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-primary"
        />
      </div>
      <p className="mt-1.5 text-xs text-muted" dir="rtl">
        يُحفظ الرقم دولياً للمشاركة عبر واتساب مباشرة
      </p>
    </div>
  );
}