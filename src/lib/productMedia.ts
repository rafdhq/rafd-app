import type { Product } from './types';

/** Category → expressive emoji */
export const CATEGORY_EMOJI: Record<string, string> = {
  بقالة: '🛒',
  ألبان: '🥛',
  مشروبات: '🥤',
  منظفات: '🧴',
  مخبوزات: '🍞',
  لحوم: '🥩',
  أسماك: '🐟',
  خضار: '🥬',
  فواكه: '🍎',
  مجمدات: '🧊',
  معلبات: '🥫',
  سناكس: '🍿',
  'عناية شخصية': '🧼',
  أطفال: '🍼',
  'حيوانات أليفة': '🐾',
  بهارات: '🌶️',
  'حبوب وبقول': '🌾',
  مكسرات: '🥜',
  'عسل وزيوت': '🍯',
  تمور: '🌴',
  معسلات: '💨',
  'فحم وشيش': '🔥',
  تبغ: '🚬',
  'أدوات منزلية': '🏠',
  بلاستيك: '📦',
  زجاجيات: '🫙',
  مطبخ: '🍳',
  'منسوجات منزلية': '🧺',
  خردوات: '🧰',
  'عدد يدوية': '🔧',
  'كهرباء منزلية': '🔌',
  سباكة: '🚰',
  دهانات: '🎨',
  'مواد بناء': '🧱',
  حدادة: '⚙️',
  'أجهزة كهربائية': '📺',
  إلكترونيات: '💻',
  'جوالات وإكسسوار': '📱',
  كمبيوتر: '🖥️',
  إضاءة: '💡',
  قرطاسية: '📎',
  كتب: '📚',
  ألعاب: '🧸',
  هدايا: '🎁',
  ملابس: '👕',
  أحذية: '👟',
  إكسسوارات: '💍',
  عطور: '🌸',
  صيدلية: '💊',
  بصريات: '👓',
  وجبات: '🍽️',
  'مشروبات ساخنة': '☕',
  'مشروبات باردة': '🧃',
  'حلويات مطعم': '🍰',
  مقبلات: '🥗',
  'مواد تشغيل مطعم': '🍴',
  'قطع غيار': '🚗',
  'زيوت سيارات': '🛢️',
  أعلاف: '🌱',
  'بذور وأسمدة': '🌿',
  خدمات: '🛠️',
  عام: '📦',
};

/** Curated emoji presets for product picker */
export const PRODUCT_EMOJI_PRESETS: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'cart', label: 'بقالة', emoji: '🛒' },
  { id: 'milk', label: 'حليب', emoji: '🥛' },
  { id: 'cheese', label: 'جبن', emoji: '🧀' },
  { id: 'egg', label: 'بيض', emoji: '🥚' },
  { id: 'bread', label: 'خبز', emoji: '🍞' },
  { id: 'rice', label: 'أرز', emoji: '🍚' },
  { id: 'soda', label: 'مشروب', emoji: '🥤' },
  { id: 'water', label: 'ماء', emoji: '💧' },
  { id: 'coffee', label: 'قهوة', emoji: '☕' },
  { id: 'tea', label: 'شاي', emoji: '🍵' },
  { id: 'veg', label: 'خضار', emoji: '🥬' },
  { id: 'tomato', label: 'طماطم', emoji: '🍅' },
  { id: 'fruit', label: 'فاكهة', emoji: '🍎' },
  { id: 'banana', label: 'موز', emoji: '🍌' },
  { id: 'meat', label: 'لحم', emoji: '🥩' },
  { id: 'chicken', label: 'دجاج', emoji: '🍗' },
  { id: 'fish', label: 'سمك', emoji: '🐟' },
  { id: 'clean', label: 'تنظيف', emoji: '🧴' },
  { id: 'soap', label: 'صابون', emoji: '🧼' },
  { id: 'tissue', label: 'مناديل', emoji: '🧻' },
  { id: 'snacks', label: 'سناكس', emoji: '🍿' },
  { id: 'chips', label: 'شيبس', emoji: '🥔' },
  { id: 'spices', label: 'بهارات', emoji: '🌶️' },
  { id: 'nuts', label: 'مكسرات', emoji: '🥜' },
  { id: 'dates', label: 'تمر', emoji: '🌴' },
  { id: 'honey', label: 'عسل', emoji: '🍯' },
  { id: 'oil', label: 'زيت', emoji: '🫒' },
  { id: 'sugar', label: 'سكر', emoji: '🧂' },
  { id: 'frozen', label: 'مجمد', emoji: '🧊' },
  { id: 'can', label: 'معلب', emoji: '🥫' },
  { id: 'home', label: 'منزلي', emoji: '🏠' },
  { id: 'kitchen', label: 'مطبخ', emoji: '🍳' },
  { id: 'tools', label: 'عدد', emoji: '🔧' },
  { id: 'bolt', label: 'كهرباء', emoji: '⚡' },
  { id: 'phone', label: 'جوال', emoji: '📱' },
  { id: 'laptop', label: 'لابتوب', emoji: '💻' },
  { id: 'meals', label: 'وجبة', emoji: '🍽️' },
  { id: 'dessert', label: 'حلوى', emoji: '🍰' },
  { id: 'pharmacy', label: 'دواء', emoji: '💊' },
  { id: 'clothes', label: 'ملابس', emoji: '👕' },
  { id: 'toys', label: 'ألعاب', emoji: '🧸' },
  { id: 'pen', label: 'قرطاسية', emoji: '✏️' },
  { id: 'gift', label: 'هدية', emoji: '🎁' },
  { id: 'car', label: 'سيارات', emoji: '🚗' },
  { id: 'service', label: 'خدمة', emoji: '🛠️' },
  { id: 'box', label: 'عام', emoji: '📦' },
];

const EMOJI_PREFIX = 'emoji:';

/** Soft modern gradients for emoji tiles */
const EMOJI_TONES = [
  'from-teal-500/15 via-cyan-400/10 to-emerald-500/15',
  'from-amber-500/15 via-orange-400/10 to-yellow-500/15',
  'from-sky-500/15 via-blue-400/10 to-indigo-500/15',
  'from-rose-500/15 via-pink-400/10 to-fuchsia-500/15',
  'from-violet-500/15 via-purple-400/10 to-indigo-500/15',
  'from-lime-500/15 via-green-400/10 to-teal-500/15',
];

export function categoryEmoji(category?: string | null) {
  return CATEGORY_EMOJI[category || ''] || CATEGORY_EMOJI['عام'] || '📦';
}

export function categoryIconSrc(category?: string | null) {
  // Back-compat: treat as emoji token
  return `${EMOJI_PREFIX}${categoryEmoji(category)}`;
}

export function toEmojiToken(emoji: string) {
  const e = (emoji || '📦').trim();
  if (e.startsWith(EMOJI_PREFIX)) return e;
  return `${EMOJI_PREFIX}${e}`;
}

export function extractEmoji(value?: string | null, fallback = '📦') {
  if (!value) return fallback;
  const v = String(value).trim();
  if (v.startsWith(EMOJI_PREFIX)) return v.slice(EMOJI_PREFIX.length) || fallback;
  // pure emoji / short glyph (not a path or URL)
  if (!v.includes('/') && !v.startsWith('http') && !v.includes('.') && v.length <= 8) return v;
  // legacy photo / svg path → no emoji embedded
  return '';
}

/** Always prefer emoji — ignore legacy photo paths */
export function resolveProductEmoji(
  product?: Pick<Product, 'image_url' | 'category' | 'name_ar' | 'name'> | null
) {
  if (product?.image_url) {
    const fromValue = extractEmoji(product.image_url, '');
    if (fromValue) return fromValue;
  }
  return categoryEmoji(product?.category);
}

/** @deprecated use resolveProductEmoji — kept for older imports */
export function resolveProductMedia(
  product?: Pick<Product, 'image_url' | 'category' | 'name_ar' | 'name'> | null
) {
  return toEmojiToken(resolveProductEmoji(product));
}

export function isPresetIconUrl(url?: string | null) {
  if (!url) return false;
  return url.startsWith(EMOJI_PREFIX) || url.startsWith('/icons/categories/') || (!url.includes('/') && !url.startsWith('http'));
}

export function isEmojiToken(url?: string | null) {
  if (!url) return true;
  return url.startsWith(EMOJI_PREFIX) || (!url.includes('/') && !url.startsWith('http'));
}

export function emojiToneClass(seed?: string | null) {
  const s = seed || 'x';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash + s.charCodeAt(i) * (i + 1)) % EMOJI_TONES.length;
  return EMOJI_TONES[hash];
}

/** Back-compat aliases for picker */
export const PRODUCT_ICON_PRESETS = PRODUCT_EMOJI_PRESETS.map((p) => ({
  id: p.id,
  label: p.label,
  src: toEmojiToken(p.emoji),
  emoji: p.emoji,
}));

export async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uploadProductImage(file: File, tenantId?: number | null) {
  const fileBase64 = await fileToBase64(file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileBase64,
      contentType: file.type || 'image/png',
      folder: `products/${tenantId || 'shared'}`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'فشل رفع الصورة');
  }
  const data = await res.json();
  return data.url as string;
}
