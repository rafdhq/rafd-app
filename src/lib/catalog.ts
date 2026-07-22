/** Comprehensive retail / F&B / specialty store catalog for RAFD */

export interface CatalogCategory {
  id: string;
  label: string;
  labelEn: string;
  /** Sold by weight (price per kg, POS entry in grams) */
  byWeight?: boolean;
  /** Default sell unit label */
  defaultUnit?: string;
}

export interface BusinessType {
  id: string;
  label: string;
  labelEn: string;
  description: string;
  /** Default category ids enabled for this activity */
  defaultCategories: string[];
}

/** Master category dictionary — any store can enable any of these */
export const ALL_CATEGORIES: CatalogCategory[] = [
  // Grocery / supermarket
  { id: 'بقالة', label: 'بقالة', labelEn: 'Grocery', defaultUnit: 'حبة' },
  { id: 'ألبان', label: 'ألبان وأجبان', labelEn: 'Dairy', defaultUnit: 'حبة' },
  { id: 'مشروبات', label: 'مشروبات', labelEn: 'Beverages', defaultUnit: 'حبة' },
  { id: 'منظفات', label: 'منظفات', labelEn: 'Cleaning', defaultUnit: 'حبة' },
  { id: 'مخبوزات', label: 'مخبوزات', labelEn: 'Bakery', defaultUnit: 'حبة' },
  { id: 'لحوم', label: 'لحوم ودواجن', labelEn: 'Meat', byWeight: true, defaultUnit: 'كجم' },
  { id: 'أسماك', label: 'أسماك ومأكولات بحرية', labelEn: 'Seafood', byWeight: true, defaultUnit: 'كجم' },
  { id: 'خضار', label: 'خضار', labelEn: 'Vegetables', byWeight: true, defaultUnit: 'كجم' },
  { id: 'فواكه', label: 'فواكه', labelEn: 'Fruits', byWeight: true, defaultUnit: 'كجم' },
  { id: 'مجمدات', label: 'مجمدات', labelEn: 'Frozen', defaultUnit: 'حبة' },
  { id: 'معلبات', label: 'معلبات', labelEn: 'Canned', defaultUnit: 'حبة' },
  { id: 'سناكس', label: 'سناكس وحلويات', labelEn: 'Snacks', defaultUnit: 'حبة' },
  { id: 'عناية شخصية', label: 'عناية شخصية', labelEn: 'Personal care', defaultUnit: 'حبة' },
  { id: 'أطفال', label: 'مستلزمات أطفال', labelEn: 'Baby', defaultUnit: 'حبة' },
  { id: 'حيوانات أليفة', label: 'حيوانات أليفة', labelEn: 'Pets', defaultUnit: 'حبة' },

  // Spices / specialty food
  { id: 'بهارات', label: 'بهارات', labelEn: 'Spices', byWeight: true, defaultUnit: 'كجم' },
  { id: 'حبوب وبقول', label: 'حبوب وبقول', labelEn: 'Grains & legumes', byWeight: true, defaultUnit: 'كجم' },
  { id: 'مكسرات', label: 'مكسرات وفواكه مجففة', labelEn: 'Nuts', byWeight: true, defaultUnit: 'كجم' },
  { id: 'عسل وزيوت', label: 'عسل وزيوت طبيعية', labelEn: 'Honey & oils', defaultUnit: 'حبة' },
  { id: 'تمور', label: 'تمور', labelEn: 'Dates', byWeight: true, defaultUnit: 'كجم' },

  // Shisha / tobacco specialty
  { id: 'معسلات', label: 'معسلات', labelEn: 'Molasses', defaultUnit: 'حبة' },
  { id: 'فحم وشيش', label: 'فحم وشيش ولوازم', labelEn: 'Shisha supplies', defaultUnit: 'حبة' },
  { id: 'تبغ', label: 'تبغ وسجائر', labelEn: 'Tobacco', defaultUnit: 'حبة' },

  // Household / plastics / hardware
  { id: 'أدوات منزلية', label: 'أدوات منزلية', labelEn: 'Housewares', defaultUnit: 'حبة' },
  { id: 'بلاستيك', label: 'مواد بلاستيكية', labelEn: 'Plastics', defaultUnit: 'حبة' },
  { id: 'زجاجيات', label: 'زجاجيات وخزف', labelEn: 'Glassware', defaultUnit: 'حبة' },
  { id: 'مطبخ', label: 'أدوات مطبخ', labelEn: 'Kitchenware', defaultUnit: 'حبة' },
  { id: 'منسوجات منزلية', label: 'منسوجات ومفروشات', labelEn: 'Home textiles', defaultUnit: 'حبة' },
  { id: 'خردوات', label: 'خردوات', labelEn: 'Hardware smallwares', defaultUnit: 'حبة' },
  { id: 'عدد يدوية', label: 'عدد وأدوات يدوية', labelEn: 'Hand tools', defaultUnit: 'حبة' },
  { id: 'كهرباء منزلية', label: 'مستلزمات كهرباء', labelEn: 'Electrical supplies', defaultUnit: 'حبة' },
  { id: 'سباكة', label: 'سباكة وصحي', labelEn: 'Plumbing', defaultUnit: 'حبة' },
  { id: 'دهانات', label: 'دهانات ومواد لاصقة', labelEn: 'Paints', defaultUnit: 'حبة' },
  { id: 'مواد بناء', label: 'مواد بناء', labelEn: 'Building materials', defaultUnit: 'حبة' },
  { id: 'حدادة', label: 'حديد ومعادن', labelEn: 'Metalwork', byWeight: true, defaultUnit: 'كجم' },

  // Electronics / appliances
  { id: 'أجهزة كهربائية', label: 'أجهزة كهربائية', labelEn: 'Appliances', defaultUnit: 'حبة' },
  { id: 'إلكترونيات', label: 'إلكترونيات', labelEn: 'Electronics', defaultUnit: 'حبة' },
  { id: 'جوالات وإكسسوار', label: 'جوالات وإكسسوارات', labelEn: 'Phones & accessories', defaultUnit: 'حبة' },
  { id: 'كمبيوتر', label: 'حواسيب وملحقات', labelEn: 'Computers', defaultUnit: 'حبة' },
  { id: 'إضاءة', label: 'إضاءة', labelEn: 'Lighting', defaultUnit: 'حبة' },

  // Bookstore / stationery / gifts
  { id: 'قرطاسية', label: 'قرطاسية', labelEn: 'Stationery', defaultUnit: 'حبة' },
  { id: 'كتب', label: 'كتب ومجلات', labelEn: 'Books', defaultUnit: 'حبة' },
  { id: 'ألعاب', label: 'ألعاب', labelEn: 'Toys', defaultUnit: 'حبة' },
  { id: 'هدايا', label: 'هدايا وتحف', labelEn: 'Gifts', defaultUnit: 'حبة' },

  // Fashion / beauty
  { id: 'ملابس', label: 'ملابس', labelEn: 'Apparel', defaultUnit: 'حبة' },
  { id: 'أحذية', label: 'أحذية', labelEn: 'Footwear', defaultUnit: 'حبة' },
  { id: 'إكسسوارات', label: 'إكسسوارات وحقائب', labelEn: 'Accessories', defaultUnit: 'حبة' },
  { id: 'عطور', label: 'عطور ومستحضرات', labelEn: 'Perfumes', defaultUnit: 'حبة' },

  // Pharmacy / optics (light retail)
  { id: 'صيدلية', label: 'مستحضرات صيدلانية', labelEn: 'Pharmacy OTC', defaultUnit: 'حبة' },
  { id: 'بصريات', label: 'بصريات', labelEn: 'Optics', defaultUnit: 'حبة' },

  // Restaurant / cafeteria / cafe
  { id: 'وجبات', label: 'وجبات جاهزة', labelEn: 'Meals', defaultUnit: 'طبق' },
  { id: 'مشروبات ساخنة', label: 'مشروبات ساخنة', labelEn: 'Hot drinks', defaultUnit: 'كوب' },
  { id: 'مشروبات باردة', label: 'مشروبات باردة', labelEn: 'Cold drinks', defaultUnit: 'كوب' },
  { id: 'حلويات مطعم', label: 'حلويات ومخبوزات المطعم', labelEn: 'Desserts', defaultUnit: 'حبة' },
  { id: 'مقبلات', label: 'مقبلات وسلطات', labelEn: 'Appetizers', defaultUnit: 'طبق' },
  { id: 'مواد تشغيل مطعم', label: 'مواد تشغيل (مطعم)', labelEn: 'Restaurant supplies', defaultUnit: 'حبة' },

  // Auto / services retail
  { id: 'قطع غيار', label: 'قطع غيار سيارات', labelEn: 'Auto parts', defaultUnit: 'حبة' },
  { id: 'زيوت سيارات', label: 'زيوت ومواد سيارات', labelEn: 'Auto fluids', defaultUnit: 'حبة' },

  // Agriculture
  { id: 'أعلاف', label: 'أعلاف', labelEn: 'Feed', byWeight: true, defaultUnit: 'كجم' },
  { id: 'بذور وأسمدة', label: 'بذور وأسمدة', labelEn: 'Seeds & fertilizer', defaultUnit: 'حبة' },

  // Generic
  { id: 'خدمات', label: 'خدمات', labelEn: 'Services', defaultUnit: 'خدمة' },
  { id: 'عام', label: 'عام / أخرى', labelEn: 'General', defaultUnit: 'حبة' },
];

export const BUSINESS_TYPES: BusinessType[] = [
  {
    id: 'grocery',
    label: 'بقالة / سوبرماركت',
    labelEn: 'Grocery / Supermarket',
    description: 'مواد غذائية، مشروبات، منظفات، ألبان...',
    defaultCategories: [
      'بقالة', 'ألبان', 'مشروبات', 'منظفات', 'مخبوزات', 'لحوم', 'خضار', 'فواكه',
      'مجمدات', 'معلبات', 'سناكس', 'عناية شخصية', 'أطفال', 'تمور', 'عام',
    ],
  },
  {
    id: 'hypermarket',
    label: 'هايبرماركت',
    labelEn: 'Hypermarket',
    description: 'تشكيلة واسعة: غذائي + منزلي + أجهزة',
    defaultCategories: [
      'بقالة', 'ألبان', 'مشروبات', 'منظفات', 'مخبوزات', 'لحوم', 'أسماك', 'خضار', 'فواكه',
      'مجمدات', 'معلبات', 'سناكس', 'عناية شخصية', 'أدوات منزلية', 'بلاستيك', 'مطبخ',
      'أجهزة كهربائية', 'إلكترونيات', 'قرطاسية', 'ألعاب', 'ملابس', 'عام',
    ],
  },
  {
    id: 'spices',
    label: 'بهارات وعطارة',
    labelEn: 'Spices & herbs',
    description: 'بهارات، حبوب، مكسرات، عسل...',
    defaultCategories: ['بهارات', 'حبوب وبقول', 'مكسرات', 'عسل وزيوت', 'تمور', 'أعلاف', 'عام'],
  },
  {
    id: 'shisha',
    label: 'شيش ومعسلات',
    labelEn: 'Shisha & molasses',
    description: 'معسل، فحم، لوازم شيش، تبغ',
    defaultCategories: ['معسلات', 'فحم وشيش', 'تبغ', 'مشروبات', 'سناكس', 'عام'],
  },
  {
    id: 'housewares',
    label: 'أدوات منزلية وبلاستيك',
    labelEn: 'Housewares & plastics',
    description: 'منزلية، مطبخ، بلاستيك، زجاجيات',
    defaultCategories: ['أدوات منزلية', 'بلاستيك', 'زجاجيات', 'مطبخ', 'منسوجات منزلية', 'خردوات', 'إضاءة', 'عام'],
  },
  {
    id: 'hardware',
    label: 'خردوات وعدد',
    labelEn: 'Hardware store',
    description: 'عدد يدوية، كهرباء، سباكة، دهانات',
    defaultCategories: ['خردوات', 'عدد يدوية', 'كهرباء منزلية', 'سباكة', 'دهانات', 'إضاءة', 'بلاستيك', 'عام'],
  },
  {
    id: 'building',
    label: 'مواد بناء',
    labelEn: 'Building materials',
    description: 'بناء، حديد، دهانات، سباكة',
    defaultCategories: ['مواد بناء', 'حدادة', 'دهانات', 'سباكة', 'كهرباء منزلية', 'عدد يدوية', 'عام'],
  },
  {
    id: 'electronics',
    label: 'أجهزة وإلكترونيات',
    labelEn: 'Electronics & appliances',
    description: 'أجهزة، جوالات، حواسيب، إضاءة',
    defaultCategories: ['أجهزة كهربائية', 'إلكترونيات', 'جوالات وإكسسوار', 'كمبيوتر', 'إضاءة', 'عام'],
  },
  {
    id: 'bookstore',
    label: 'مكتبة وقرطاسية',
    labelEn: 'Bookstore & stationery',
    description: 'كتب، قرطاسية، ألعاب، هدايا',
    defaultCategories: ['قرطاسية', 'كتب', 'ألعاب', 'هدايا', 'إلكترونيات', 'عام'],
  },
  {
    id: 'fashion',
    label: 'ملابس وإكسسوار',
    labelEn: 'Fashion',
    description: 'ملابس، أحذية، عطور',
    defaultCategories: ['ملابس', 'أحذية', 'إكسسوارات', 'عطور', 'عناية شخصية', 'عام'],
  },
  {
    id: 'restaurant',
    label: 'مطعم',
    labelEn: 'Restaurant',
    description: 'وجبات، مقبلات، مشروبات، حلويات',
    defaultCategories: ['وجبات', 'مقبلات', 'مشروبات ساخنة', 'مشروبات باردة', 'حلويات مطعم', 'مواد تشغيل مطعم', 'عام'],
  },
  {
    id: 'cafe',
    label: 'كافتيريا / مقهى',
    labelEn: 'Cafe / Cafeteria',
    description: 'مشروبات، سناكس، حلويات خفيفة',
    defaultCategories: ['مشروبات ساخنة', 'مشروبات باردة', 'سناكس', 'حلويات مطعم', 'مخبوزات', 'مواد تشغيل مطعم', 'عام'],
  },
  {
    id: 'auto',
    label: 'قطع غيار سيارات',
    labelEn: 'Auto parts',
    description: 'قطع غيار وزيوت',
    defaultCategories: ['قطع غيار', 'زيوت سيارات', 'عدد يدوية', 'عام'],
  },
  {
    id: 'pharmacy',
    label: 'صيدلية / تجميل',
    labelEn: 'Pharmacy / beauty',
    description: 'مستحضرات وعناية',
    defaultCategories: ['صيدلية', 'عناية شخصية', 'عطور', 'أطفال', 'عام'],
  },
  {
    id: 'mixed',
    label: 'متجر متنوع / مخصص',
    labelEn: 'Mixed / Custom',
    description: 'اختر الفئات يدوياً أو وسّعها من الخيارات المتقدمة',
    defaultCategories: ['عام', 'بقالة', 'أدوات منزلية', 'خدمات'],
  },
];

export function getCategoryMeta(idOrLabel: string): CatalogCategory | undefined {
  const key = (idOrLabel || '').trim();
  return ALL_CATEGORIES.find((c) => c.id === key || c.label === key);
}

export function isWeightCategory(idOrLabel: string): boolean {
  return !!getCategoryMeta(idOrLabel)?.byWeight;
}

export function getBusinessType(id?: string | null): BusinessType {
  return BUSINESS_TYPES.find((b) => b.id === id) || BUSINESS_TYPES[0];
}

export function defaultCategoriesForBusiness(businessTypeId?: string | null): string[] {
  return [...getBusinessType(businessTypeId).defaultCategories];
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(/[,|\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function resolveTenantCategories(tenant?: {
  business_type?: string | null;
  enabled_categories?: unknown;
  custom_categories?: unknown;
} | null): string[] {
  const enabled = parseJsonArray(tenant?.enabled_categories);
  const custom = parseJsonArray(tenant?.custom_categories);
  const base =
    enabled.length > 0 ? enabled : defaultCategoriesForBusiness(tenant?.business_type || 'grocery');
  const merged = [...base];
  for (const c of custom) {
    if (!merged.includes(c)) merged.push(c);
  }
  if (!merged.includes('عام')) merged.push('عام');
  return merged;
}

export function categorySelectOptions(
  enabled: string[],
  opts?: { includeAllMaster?: boolean; custom?: string[] }
) {
  const list = opts?.includeAllMaster
    ? ALL_CATEGORIES.map((c) => c.id)
    : [...enabled, ...(opts?.custom || [])];
  const unique = Array.from(new Set(list.filter(Boolean)));
  return unique.map((id) => {
    const meta = getCategoryMeta(id);
    return {
      value: id,
      label: meta
        ? `${meta.label}${meta.byWeight ? ' · بالوزن' : ''}`
        : id,
    };
  });
}
