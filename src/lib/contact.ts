/** 숫자만 남긴 국제형 번호. 베트남 국내 형식(0으로 시작)은 84 로 바꾼다. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1).replace(/\D/g, '');
  const d = digits.replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return `84${d.slice(1)}`;
  return d;
}

/** 잘로 채팅 링크. 번호가 비어 있으면 null. */
export function zaloUrl(phone: string): string | null {
  const n = normalizePhone(phone);
  return n.length >= 8 ? `https://zalo.me/${n}` : null;
}

export function telUrl(phone: string): string | null {
  const n = normalizePhone(phone);
  return n.length >= 8 ? `tel:+${n}` : null;
}
