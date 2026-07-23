import { cn } from '../../lib/utils';
import { emojiToneClass, isRealImageUrl, resolveProductEmoji } from '../../lib/productMedia';
import type { Product } from '../../lib/types';

export default function ProductThumb({
  product,
  src,
  category,
  name,
  size = 'md',
  className,
  rounded = 'xl',
}: {
  product?: Pick<Product, 'image_url' | 'category' | 'name_ar' | 'name'> | null;
  src?: string | null;
  category?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'pos';
  className?: string;
  rounded?: 'lg' | 'xl' | '2xl' | 'full';
}) {
  const emoji = resolveProductEmoji(
    product ||
      (category
        ? { image_url: src || null, category, name_ar: name || '', name: name || '' }
        : src
          ? { image_url: src, category: '', name_ar: name || '', name: name || '' }
          : null)
  );

  // Real uploaded photo takes precedence over the emoji fallback.
  const photoUrl = product?.image_url ?? src ?? null;
  const hasPhoto = isRealImageUrl(photoUrl);

  const seed = `${emoji}-${product?.category || category || name || ''}`;

  const sizes = {
    sm: 'h-9 w-9 text-base',
    md: 'h-11 w-11 text-xl',
    lg: 'h-16 w-16 text-3xl',
    xl: 'h-24 w-24 text-5xl',
    pos: 'h-16 w-full text-3xl',
  };

  const radius = {
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden',
        'border border-white/40 dark:border-white/10',
        'bg-gradient-to-br shadow-soft',
        'ring-1 ring-black/5 dark:ring-white/10',
        emojiToneClass(seed),
        sizes[size],
        radius[rounded],
        className
      )}
      title={name || product?.name_ar || product?.name || ''}
      aria-hidden={!name && !product?.name_ar}
    >
      {hasPhoto ? (
        <img
          src={photoUrl as string}
          alt={name || product?.name_ar || product?.name || ''}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          {/* soft gloss */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-black/[0.03] dark:from-white/10" />
          <span className="relative z-[1] select-none leading-none drop-shadow-sm">{emoji}</span>
        </>
      )}
    </div>
  );
}
