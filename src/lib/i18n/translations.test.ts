import { describe, expect, it } from 'vitest';
import { translate } from './translations';

describe('i18n', () => {
  it('switches labels by locale', () => {
    expect(translate('dashboard', 'ar')).toContain('لوحة');
    expect(translate('dashboard', 'en')).toBe('Dashboard');
    expect(translate('aiAssistant', 'en')).toBe('AI Assistant');
  });
});
