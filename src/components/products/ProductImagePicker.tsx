import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Sparkles, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { cn } from '../../lib/utils';
import {
  PRODUCT_EMOJI_PRESETS,
  categoryEmoji,
  categoryIconSrc,
  emojiToneClass,
  isRealImageUrl,
  toEmojiToken,
} from '../../lib/productMedia';
import { compressAndEncode } from '../../lib/imageCompress';
import ProductThumb from './ProductThumb';

export default function ProductImagePicker({
  value,
  category,
  name,
  tenantId,
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const hasPhoto = isRealImageUrl(value);

  const selectEmoji = (emoji: string) => {
    onChange(toEmojiToken(emoji));
  };

  const uploadPhoto = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const { fileBase64, contentType, fileName } = await compressAndEncode(file, {
        maxEdge: 1024,
        quality: 0.8,
      });
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          fileBase64,
          contentType,
          folder: `products/${tenantId || 'shared'}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'فشل رفع الصورة');
      }
      const data = await res.json();
      onChange(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="sm:col-span-2 rounded-2xl border border-app bg-subtle p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-app">
            <Sparkles className="h-4 w-4 text-primary" />
            صورة أو أيقونة المنتج
          </div>
          <p className="mt-0.5 text-xs text-muted">
            ارفع صورة حقيقية للمنتج، أو اختر أيقونة تعبيرية تناسب الصنف.
          </p>
        </div>
        <ProductThumb
          src={value}
          category={category}
          name={name}
          size="xl"
          rounded="2xl"
          className="shadow-lift"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {uploading ? 'جاري الرفع...' : hasPhoto ? 'تغيير الصورة' : 'رفع صورة'}
        </Button>
        {hasPhoto && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(categoryIconSrc(category))}
          >
            <Trash2 className="h-4 w-4 text-danger" />
            إزالة الصورة
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="soft"
          onClick={() => selectEmoji(defaultEmoji)}
        >
          أيقونة التصنيف ({defaultEmoji})
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger)]/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 max-h-64 overflow-y-auto pe-1">
        <button
          type="button"
          onClick={() => selectEmoji(defaultEmoji)}
          className={cn(
            'relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition',
            !hasPhoto && (!value || value === defaultToken || value === defaultEmoji)
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
          {!hasPhoto && (!value || value === defaultToken || value === defaultEmoji) && (
            <span className="absolute left-1 top-1 rounded-full bg-primary p-0.5 text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
          )}
        </button>

        {PRODUCT_EMOJI_PRESETS.map((icon) => {
          const token = toEmojiToken(icon.emoji);
          const active = !hasPhoto && (value === token || value === icon.emoji);
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
