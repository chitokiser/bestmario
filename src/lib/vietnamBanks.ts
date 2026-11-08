export interface VietnamBank {
  code: string;
  shortName: string;
  fullName: string;
  bin: string;
}

export const VIETNAM_BANKS: VietnamBank[] = [
  { code: 'VCB', shortName: 'Vietcombank', fullName: 'Ngân hàng Ngoại thương Việt Nam', bin: '970436' },
  { code: 'MB', shortName: 'MBBank', fullName: 'Ngân hàng Quân đội', bin: '970422' },
  { code: 'TCB', shortName: 'Techcombank', fullName: 'Ngân hàng Kỹ thương Việt Nam', bin: '970407' },
  { code: 'ICB', shortName: 'VietinBank', fullName: 'Ngân hàng Công thương Việt Nam', bin: '970415' },
  { code: 'BIDV', shortName: 'BIDV', fullName: 'Ngân hàng Đầu tư và Phát triển VN', bin: '970418' },
  { code: 'ACB', shortName: 'ACB', fullName: 'Ngân hàng Á Châu', bin: '970416' },
  { code: 'VPB', shortName: 'VPBank', fullName: 'Ngân hàng Việt Nam Thịnh vượng', bin: '970432' },
  { code: 'TPB', shortName: 'TPBank', fullName: 'Ngân hàng Tiên Phong', bin: '970423' },
  { code: 'STB', shortName: 'Sacombank', fullName: 'Ngân hàng Sài Gòn Thương Tín', bin: '970403' },
  { code: 'VBA', shortName: 'Agribank', fullName: 'Ngân hàng Nông nghiệp & PTNT', bin: '970405' },
  { code: 'HDB', shortName: 'HDBank', fullName: 'Ngân hàng Phát triển TP.HCM', bin: '970437' },
  { code: 'MSB', shortName: 'MSB', fullName: 'Ngân hàng Hàng Hải Việt Nam', bin: '970426' },
  { code: 'SHB', shortName: 'SHB', fullName: 'Ngân hàng Sài Gòn - Hà Nội', bin: '970443' },
  { code: 'OCB', shortName: 'OCB', fullName: 'Ngân hàng Phương Đông', bin: '970448' },
  { code: 'VIB', shortName: 'VIB', fullName: 'Ngân hàng Quốc tế', bin: '970441' },
  { code: 'SHBVN', shortName: 'Shinhan Bank', fullName: 'Ngân hàng Shinhan Việt Nam', bin: '970424' },
];

export function getVietQrUrl(bankCode: string, accountNo: string, amount?: number, memo?: string): string {
  const cleanAccount = accountNo.replace(/[^0-9a-zA-Z]/g, '');
  const cleanBank = bankCode.trim().toUpperCase();
  if (!cleanAccount || !cleanBank) return '';
  const url = `https://img.vietqr.io/image/${cleanBank}-${cleanAccount}-compact2.png`;
  const params = new URLSearchParams();
  if (amount && amount > 0) params.set('amount', String(Math.round(amount)));
  if (memo) params.set('addInfo', memo.slice(0, 50));
  const q = params.toString();
  return q ? `${url}?${q}` : url;
}

export function findBankByKeyword(text: string): VietnamBank | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().trim();
  return VIETNAM_BANKS.find(
    (b) =>
      b.code.toLowerCase() === t ||
      b.shortName.toLowerCase() === t ||
      b.fullName.toLowerCase().includes(t) ||
      t.includes(b.code.toLowerCase()) ||
      t.includes(b.shortName.toLowerCase())
  );
}
