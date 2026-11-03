import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ko', 'en', 'vi'],
  defaultLocale: 'vi',
  localePrefix: 'as-needed',
});
