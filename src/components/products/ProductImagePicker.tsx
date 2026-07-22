import { Check, Sparkles } from 'lucide-react';
import Button from '../ui/Button';
import { cn } from '../../lib/utils';
import {
  PRODUCT_EMOJI_PRESETS,
  categoryEmoji,
  emojiToneClass,
  toEmojiToken,
} from '../../lib/productMedia';
import ProductThumb from './ProductThumb';

export default function ProductImagePicker({
  value,
  category,
  name,
  onChange,
}: {
  value?: string;
  category?: string;
  name?: string;
  tenantId?: number | null;
  onChange: (url: string) => void;
}) {
  const defaultEmoji = categoryEmoji(category);
  const defaultToken = toEmojiToken(defaultEmoji);
  const currentToken = value ? toEmojiToken(value.startsWith('emoji:') || (!value.includes('/') && !value.startsWith('http')) ? value : defaultEmoji) : defaultToken;

  const selectEmoji = (emoji: string) => {
    onChange(toEmojiToken(emoji));
  };

  return (
    <div className="sm:col-span-2 rounded-2xl border border-app bg-subtle p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-app">
            <Sparkles className="h-4 w-4 text-primary" />
            أيقونة المنتج
          </div>
          <p className="mt-0.5 text-xs text-muted">
            أيقونات تعبيرية عصرية — بدون صور منتجات. اختر رمزاً يناسب الصنف.
          </p>
        </div>
        <ProductThumb
          src={currentToken}
          category={category}
          name={name}
          size="xl"
          rounded="2xl"
          className="shadow-lift"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="soft"
          onClick={() => selectEmoji(defaultEmoji)}
        >
          أيقونة التصنيف ({defaultEmoji})
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 max-h-64 overflow-y-auto pe-1">
        <button
          type="button"
          onClick={() => selectEmoji(defaultEmoji)}
          className={cn(
            'relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition',
            !value || value === defaultToken || value === defaultEmoji
              ? 'border-primary bg-primary-soft ring-1 ring-primary/30'
              : 'border-app bg-surface hover:border-primary/40'
          )}
          title="أيقونة التصنيف"
        >
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-2xl',
              emojiToneClass(defaultEmoji)
            )}
          >
            {defaultEmoji}
          </div>
          <span className="text-[10px] text-muted">تصنيف</span>
          {(!value || value === defaultToken || value === defaultEmoji) && (
            <span className="absolute left-1 top-1 rounded-full bg-primary p-0.5 text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
          )}
        </button>

        {PRODUCT_EMOJI_PRESETS.map((icon) => {
          const token = toEmojiToken(icon.emoji);
          const active = value === token || value === icon.emoji;
          return (
            <button
              key={icon.id}
              type="button"
              onClick={() => selectEmoji(icon.emoji)}
              className={cn(
                'relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition',
                active
                  ? 'border-primary bg-primary-soft ring-1 ring-primary/30'
                  : 'border-app bg-surface hover:border-primary/40'
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-soft',
                  emojiToneClass(icon.emoji)
                )}
              >
                {icon.emoji}
              </div>
              <span className="w-full truncate text-center text-[10px] text-muted">{icon.label}</span>
              {active && (
                <span className="absolute left-1 top-1 rounded-full bg-primary p-0.5 text-white">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
