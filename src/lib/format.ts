export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount) + '₫';
}

export function formatDateTime(iso: string, locale: string): string {
  const tag = locale === 'ko' ? 'ko-KR' : locale === 'en' ? 'en-US' : 'vi-VN';
  return new Intl.DateTimeFormat(tag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** 카테고리·상품의 locale 별 이름 선택 (name_en 이 없는 테이블은 name_ko 로 폴백) */
export function localizedName(
  row: { name_ko: string; name_vi: string; name_en?: string },
  locale: string
): string {
  if (locale === 'vi') return row.name_vi;
  if (locale === 'en') return row.name_en ?? row.name_ko;
  return row.name_ko;
}
