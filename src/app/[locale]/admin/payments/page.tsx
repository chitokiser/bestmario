'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDateTime, formatVND } from '@/lib/format';
import AdminPayouts from '@/components/AdminPayouts';
import AdminBtGrants from '@/components/AdminBtGrants';
import type { Payment, PaymentStatus, ServiceSetting } from '@/types/supabase';

const STATUS_STYLE: Record<PaymentStatus, { color: string; bg: string; ko: string; vi: string; en: string }> = {
  held:      { color: '#FFA000', bg: '#FFF8E1', ko: '보관 중', vi: 'Đang giữ',  en: 'Held' },
  completed: { color: '#388E3C', bg: '#E8F5E9', ko: '정산 완료', vi: 'Hoàn tất',  en: 'Completed' },
  refunded:  { color: '#616161', bg: '#F5F5F5', ko: '환불',   vi: 'Đã hoàn',   en: 'Refunded' },
};

const METHOD_LABEL: Record<string, string> = {
  vietqr: '🏦 VietQR',
  momo: '📱 MoMo',
  bm: '💎 BM',
  cash: '💵 Cash',
};

export default function AdminPaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<ServiceSetting[]>([]);
  const [bmRate, setBmRate] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const load = useCallback(async () => {
    setLoading(true);

    const [pays, sets] = await Promise.all([
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('service_settings').select('*'),
    ]);

    const firstError = pays.error ?? sets.error;
    setError(firstError ? firstError.message : null);

    setPayments((pays.data ?? []) as Payment[]);

    const rows = (sets.data ?? []) as ServiceSetting[];
    setSettings(rows);
    setBmRate(rows.find((s) => s.key === 'bm_rate_vnd')?.value ?? '');
    setFeeRate(rows.find((s) => s.key === 'platform_fee_rate')?.value ?? '');
    setBankName(rows.find((s) => s.key === 'bank_name')?.value ?? '');
    setBankAccount(rows.find((s) => s.key === 'bank_account')?.value ?? '');
    setBankHolder(rows.find((s) => s.key === 'bank_holder')?.value ?? '');
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // 현금·이체 결제 수동 확인: held → completed.
  // 주문 완료 승인 시점의 트리거와 별개로, 입금이 확인된 건을 관리자가 직접 확정한다.
  const confirmPayment = async (id: string) => {
    if (acting) return;
    setActing(id);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('payments')
        .update({ status: 'completed' })
        .eq('id', id);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const refundPayment = async (id: string) => {
    if (acting) return;
    setActing(id);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('payments')
        .update({ status: 'refunded' })
        .eq('id', id);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const saveSettings = async () => {
    if (savingSettings) return;

    const rate = Number(bmRate);
    const fee = Number(feeRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setError(t('BM 환산율은 0보다 큰 숫자여야 합니다.', 'Tỷ giá BM phải lớn hơn 0.', 'The BM rate must be greater than 0.'));
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee >= 1) {
      setError(t('수수료율은 0 이상 1 미만이어야 합니다 (예: 0.100 = 10%).', 'Phí phải từ 0 đến dưới 1 (vd: 0.100 = 10%).', 'The fee rate must be between 0 and 1 (e.g. 0.100 = 10%).'));
      return;
    }

    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      const { error: err } = await supabase.from('service_settings').upsert(
        [
          { key: 'bm_rate_vnd', value: String(rate) },
          { key: 'platform_fee_rate', value: fee.toFixed(3) },
          { key: 'bank_name', value: bankName.trim() },
          { key: 'bank_account', value: bankAccount.trim() },
          { key: 'bank_holder', value: bankHolder.trim() },
        ],
        { onConflict: 'key' }
      );
      if (err) throw new Error(err.message);
      setMessage(t('저장했습니다.', 'Đã lưu.', 'Saved.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  const heldPayments = payments.filter((p) => p.status === 'held');

  return (
    <div className="space-y-5">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('결제 · 설정', 'Thanh toán · Cài đặt', 'Payments & settings')}
      </h1>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      {message && <p className="text-xs font-semibold" style={{ color: '#388E3C' }}>{message}</p>}

      {/* 운영 설정 */}
      <section className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {t('운영 설정', 'Cài đặt', 'Settings')}
        </h2>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>
            {t('BM 환산율 (1 BM = ? VND)', 'Tỷ giá BM (1 BM = ? VND)', 'BM rate (1 BM = ? VND)')}
          </label>
          <input
            type="number"
            min={1}
            value={bmRate}
            onChange={(e) => setBmRate(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>
            {t('플랫폼 수수료율 (0.100 = 10%)', 'Phí nền tảng (0.100 = 10%)', 'Platform fee rate (0.100 = 10%)')}
          </label>
          <input
            type="number"
            step="0.001"
            min={0}
            max={0.999}
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '여기서 바꾼 값은 이후 생성되는 정산에만 적용됩니다. 이미 만들어진 정산의 수수료율은 바뀌지 않습니다.',
              'Giá trị mới chỉ áp dụng cho các bản thanh toán tạo sau. Bản đã tạo không thay đổi.',
              'A new value applies only to settlements created afterwards; existing ones keep their rate.'
            )}
          </p>
        </div>

        <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
            🏦 {t('고객 입금 계좌 (플랫폼 지정)', 'Tài khoản nhận tiền của khách (nền tảng chỉ định)', 'Customer payment account (platform-designated)')}
          </p>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={40} placeholder={t('은행명', 'Tên ngân hàng', 'Bank name')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }} />
          <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} maxLength={40} inputMode="numeric" placeholder={t('계좌번호', 'Số tài khoản', 'Account number')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }} />
          <input value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} maxLength={60} placeholder={t('예금주', 'Chủ tài khoản', 'Account holder')} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }} />
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('결제 화면에서 고객에게 이 계좌가 안내됩니다. 현금은 이 계좌로만 받습니다.', 'Khách sẽ thấy tài khoản này ở màn hình thanh toán. Tiền chỉ nhận qua tài khoản này.', 'Customers see this account at checkout. Cash is accepted only through it.')}
          </p>
        </div>

        <button
          onClick={() => void saveSettings()}
          disabled={savingSettings}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {savingSettings ? t('저장 중…', 'Đang lưu…', 'Saving…') : t('설정 저장', 'Lưu cài đặt', 'Save settings')}
        </button>

        {settings.length === 0 && (
          <p className="text-[11px]" style={{ color: '#D32F2F' }}>
            {t(
              'service_settings 가 비어 있습니다. seed.sql 을 실행했는지 확인해 주세요.',
              'Bảng service_settings trống. Hãy kiểm tra đã chạy seed.sql chưa.',
              'service_settings is empty — check that seed.sql has been run.'
            )}
          </p>
        )}
      </section>

      {/* 입금 확인 대기 */}
      <section>
        <h2 className="text-sm font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('입금 확인 대기', 'Chờ xác nhận', 'Awaiting confirmation')} ({heldPayments.length})
        </h2>
        <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '현금은 모두 플랫폼 지정 계좌로 들어옵니다. 입금을 확인하면 확정해 주세요. 고객이 작업 완료를 승인하기 전에 확정해야 정산에 포함되며, 승인 시점에 보관 중인 결제는 정산 금액에서 빠집니다. 정산 후 수수료를 뺀 금액은 아래 「기술자 정산 지급」에서 기술자에게 입금하고 기록하세요.',
            'Mọi khoản tiền đều vào tài khoản do nền tảng chỉ định. Hãy xác nhận TRƯỚC khi khách xác nhận hoàn thành — phần còn ở trạng thái giữ sẽ không được tính vào thanh toán. Sau khi trừ phí, chuyển cho kỹ thuật viên ở mục «Chi trả cho kỹ thuật viên» bên dưới và ghi nhận.',
            'All cash arrives in the platform-designated account. Confirm each deposit BEFORE the customer approves completion — anything still held at that moment is excluded from the settlement. Pay the technician (net of the fee) under “Technician payouts” below and record it.'
          )}
        </p>
        <p className="text-[11px] mb-2 leading-relaxed font-semibold" style={{ color: '#D32F2F' }}>
          {t(
            '※ "환불 처리"는 Supabase 기록만 바꿉니다. BM 결제는 BestClub 포인트가 자동으로 복구되지 않으므로 별도로 환불해야 합니다.',
            '※ "Hoàn tiền" chỉ đổi bản ghi trong Supabase. Điểm BM của BestClub không tự hoàn lại — phải xử lý riêng.',
            '※ "Mark refunded" only changes the Supabase record. BM points in BestClub are not returned automatically and must be refunded separately.'
          )}
        </p>

        {payments.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('결제 내역이 없습니다.', 'Chưa có thanh toán.', 'No payments yet.')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {payments.map((p) => {
              const s = STATUS_STYLE[p.status];
              return (
                <article key={p.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        {METHOD_LABEL[p.method] ?? p.method} · {formatVND(p.amount)}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {formatDateTime(p.paid_at, locale)}
                      </p>
                      <p className="text-[11px] font-mono break-all" style={{ color: 'var(--color-text-muted)' }}>
                        order {p.order_id}
                      </p>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
                      {t(s.ko, s.vi, s.en)}
                    </span>
                  </div>

                  {p.status === 'held' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void confirmPayment(p.id)}
                        disabled={acting !== null}
                        className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: '#388E3C' }}
                      >
                        {t('입금 확인', 'Xác nhận', 'Confirm')}
                      </button>
                      <button
                        onClick={() => void refundPayment(p.id)}
                        disabled={acting !== null}
                        className="flex-1 rounded-xl border py-2.5 text-sm font-bold disabled:opacity-50"
                        style={{ borderColor: '#D32F2F', color: '#D32F2F' }}
                      >
                        {t('환불 처리', 'Hoàn tiền', 'Mark refunded')}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AdminPayouts locale={locale} />

      <AdminBtGrants locale={locale} />
    </div>
  );
}
