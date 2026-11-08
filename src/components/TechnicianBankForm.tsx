'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { VIETNAM_BANKS, getVietQrUrl, findBankByKeyword } from '@/lib/vietnamBanks';

const FIELD = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;

/** 기술자 정산 입금 계좌. 플랫폼이 수수료를 뺀 금액을 이 계좌로 입금한다. */
export default function TechnicianBankForm({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [bankCode, setBankCode] = useState('VCB');
  const [bankName, setBankName] = useState('');
  const [account, setAccount] = useState('');
  const [holder, setHolder] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void supabase
      .from('technician_profiles')
      .select('bank_name, bank_account, bank_holder')
      .eq('uid', user.uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const bName = (data.bank_name as string) ?? '';
        setBankName(bName);
        setAccount((data.bank_account as string) ?? '');
        setHolder((data.bank_holder as string) ?? '');
        setSaved(Boolean(data.bank_account));

        // 은행 코드가 있으면 복원
        const found = findBankByKeyword(bName);
        if (found) {
          setBankCode(found.code);
        }
      });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  const handleBankSelect = (code: string) => {
    setBankCode(code);
    const bank = VIETNAM_BANKS.find((b) => b.code === code);
    if (bank) {
      setBankName(`${bank.code} - ${bank.shortName}`);
    }
  };

  const save = async () => {
    if (!user || busy) return;
    const finalBankName = bankName.trim() || bankCode;
    if (!finalBankName || !account.trim() || !holder.trim()) {
      setError(
        t(
          '은행, 계좌번호, 예금주를 모두 입력해 주세요.',
          'Hãy nhập đủ ngân hàng, số tài khoản và chủ tài khoản.',
          'Enter the bank, account number and holder name.'
        )
      );
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from('technician_profiles')
      .update({
        bank_name: finalBankName,
        bank_account: account.trim(),
        bank_holder: holder.trim().toUpperCase(),
      })
      .eq('uid', user.uid);

    if (err) setError(err.message);
    else {
      setSaved(true);
      setMessage(t('정산 입금 계좌를 성공적으로 저장했습니다.', 'Đã lưu tài khoản nhận thanh toán.', 'Payout account saved successfully.'));
    }
    setBusy(false);
  };

  const qrUrl = account.trim() ? getVietQrUrl(bankCode, account.trim(), undefined, 'BESTMARIO') : '';

  return (
    <section
      className="space-y-4 rounded-3xl border p-5 shadow-sm"
      style={{
        background: 'var(--color-surface, #fff)',
        borderColor: saved ? 'var(--color-border, #ebebed)' : '#FFB74D',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
          <span>🏦</span>
          <span>{t('정산 입금 계좌 (VietQR 연동)', 'Tài khoản nhận thanh toán (VietQR)', 'Payout Bank Account (VietQR)')}</span>
        </h2>
        {saved && (
          <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5">
            ✓ {t('계좌 등록됨', 'Đã liên kết', 'Registered')}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '작업 완료 후 정산금을 입금받을 베스트마리오 전용 계좌입니다. 베트남 표준 VietQR로 연동되어 관리자가 즉시 송금합니다.',
          'Tài khoản nhận tiền thanh toán sau khi hoàn thành công việc. Kết nối chuẩn VietQR giúp nhận tiền trong 3 giây.',
          'Your bank account for receiving payouts. Linked with Vietnam standard VietQR for instant transfers.'
        )}
      </p>

      {!saved && (
        <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{t('계좌를 등록해야 정산 인출을 신청할 수 있습니다.', 'Cần đăng ký tài khoản để rút tiền.', 'Register an account to withdraw earnings.')}</span>
        </div>
      )}

      {/* 은행 선택 드롭다운 */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide mb-1 text-gray-500">
          {t('베트남 은행 선택', 'Ngân hàng', 'Bank')}
        </label>
        <select
          value={bankCode}
          onChange={(e) => handleBankSelect(e.target.value)}
          className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
          style={FIELD}
        >
          {VIETNAM_BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} · {b.shortName} ({b.fullName})
            </option>
          ))}
        </select>
      </div>

      {/* 계좌번호 */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide mb-1 text-gray-500">
          {t('계좌번호 (숫자만)', 'Số tài khoản', 'Account Number')}
        </label>
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          maxLength={40}
          inputMode="numeric"
          placeholder={t('계좌번호 입력', 'Nhập số tài khoản', 'Enter account number')}
          className="w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-none"
          style={FIELD}
        />
      </div>

      {/* 예금주 */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide mb-1 text-gray-500">
          {t('예금주 (본인 실명, 영문 대문자)', 'Tên chủ tài khoản (In hoa)', 'Account Holder (Uppercase)')}
        </label>
        <input
          value={holder}
          onChange={(e) => setHolder(e.target.value.toUpperCase())}
          maxLength={60}
          placeholder="NGUYEN VAN A"
          className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold uppercase outline-none"
          style={FIELD}
        />
      </div>

      {/* VietQR 미리보기 카드 */}
      {qrUrl && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-white border border-emerald-200 p-1 flex items-center justify-center shrink-0 shadow-xs">
            <img src={qrUrl} alt="VietQR" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900">
                VietQR 247
              </span>
              <span className="text-xs font-bold text-emerald-950 truncate">{bankCode} · {account}</span>
            </div>
            <p className="text-[11px] text-emerald-800 font-semibold mt-0.5 truncate">
              {holder || t('예금주를 입력하세요', 'Chưa nhập tên chủ TK', 'Enter holder name')}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {t('관리자가 모바일 뱅킹 앱으로 1초 만에 스캔 입금합니다.', 'Quản trị viên quét mã để chuyển khoản tức thì.', 'Scannable by any Vietnam banking app.')}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">
          ⚠️ {error}
        </p>
      )}
      {message && (
        <p className="text-xs font-semibold" style={{ color: '#2E7D32' }}>
          ✓ {message}
        </p>
      )}

      <button
        onClick={() => void save()}
        disabled={busy}
        className="w-full rounded-2xl py-3 text-sm font-extrabold text-white shadow-sm transition-transform active:scale-98 disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {busy ? t('저장 중…', 'Đang lưu…', 'Saving…') : t('계좌 정보 저장하기', 'Lưu thông tin tài khoản', 'Save Account Details')}
      </button>
    </section>
  );
}
