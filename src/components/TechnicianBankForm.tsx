'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';

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
        setBankName((data.bank_name as string) ?? '');
        setAccount((data.bank_account as string) ?? '');
        setHolder((data.bank_holder as string) ?? '');
        setSaved(Boolean(data.bank_account));
      });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  const save = async () => {
    if (!user || busy) return;
    if (!bankName.trim() || !account.trim() || !holder.trim()) {
      setError(t('은행명, 계좌번호, 예금주를 모두 입력해 주세요.', 'Hãy nhập đủ ngân hàng, số tài khoản và chủ tài khoản.', 'Enter the bank, account number and holder name.'));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from('technician_profiles')
      .update({ bank_name: bankName.trim(), bank_account: account.trim(), bank_holder: holder.trim() })
      .eq('uid', user.uid);
    if (err) setError(err.message);
    else {
      setSaved(true);
      setMessage(t('저장했습니다.', 'Đã lưu.', 'Saved.'));
    }
    setBusy(false);
  };

  return (
    <section
      className="space-y-3 rounded-2xl border p-4"
      style={{ background: 'var(--color-surface, #fff)', borderColor: saved ? 'var(--color-border, #ebebed)' : '#FFB74D' }}
    >
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
        🏦 {t('정산 입금 계좌', 'Tài khoản nhận thanh toán', 'Payout bank account')}
      </h2>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '고객이 플랫폼 계좌로 낸 금액에서 수수료를 뺀 정산액을 이 계좌로 입금해 드려요. 예금주는 본인 이름이어야 합니다.',
          'Số tiền sau khi trừ phí sẽ được chuyển vào tài khoản này. Chủ tài khoản phải là tên của bạn.',
          'Your payout (after the platform fee) is deposited to this account. The holder must be your own name.'
        )}
      </p>
      {!saved && (
        <p className="text-xs font-semibold" style={{ color: '#E65100' }}>
          {t('계좌를 등록해야 정산 입금을 받을 수 있어요.', 'Cần đăng ký tài khoản để nhận thanh toán.', 'Register an account to receive payouts.')}
        </p>
      )}
      <input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={40} placeholder={t('은행명', 'Tên ngân hàng', 'Bank name')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={FIELD} />
      <input value={account} onChange={(e) => setAccount(e.target.value)} maxLength={40} inputMode="numeric" placeholder={t('계좌번호', 'Số tài khoản', 'Account number')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={FIELD} />
      <input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={60} placeholder={t('예금주', 'Chủ tài khoản', 'Account holder')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={FIELD} />
      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}
      {message && <p className="text-xs font-semibold" style={{ color: '#2E7D32' }}>{message}</p>}
      <button
        onClick={() => void save()}
        disabled={busy}
        className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {busy ? t('저장 중…', 'Đang lưu…', 'Saving…') : t('계좌 저장', 'Lưu tài khoản', 'Save account')}
      </button>
    </section>
  );
}
