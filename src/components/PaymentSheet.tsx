'use client';

import { useEffect, useMemo, useState } from 'react';
import { callPayServiceJobEscrow } from '@/lib/firebase';
import { useAuthState } from '@/hooks/useAuthState';
import { useSupabase } from '@/hooks/useSupabase';
import { formatVND } from '@/lib/format';
import type { PaymentMethod } from '@/types/supabase';

const MERCHANT_ID = process.env.NEXT_PUBLIC_BESTMARIO_MERCHANT_ID || undefined;

/** 잔액 부족 시 BM 과 함께 쓸 보충 수단 */
type RemainMethod = Exclude<PaymentMethod, 'bm'>;

const METHODS: { id: PaymentMethod; icon: string; ko: string; vi: string; en: string }[] = [
  { id: 'vietqr', icon: '🏦', ko: '은행 이체(VietQR)', vi: 'Chuyển khoản (VietQR)', en: 'Bank transfer (VietQR)' },
  { id: 'momo',   icon: '📱', ko: 'MoMo',              vi: 'MoMo',                  en: 'MoMo' },
  { id: 'bm',     icon: '💎', ko: 'BM 포인트',          vi: 'Điểm BM',               en: 'BM points' },
  { id: 'cash',   icon: '💵', ko: '현장 현금',          vi: 'Tiền mặt tại nhà',      en: 'Cash on site' },
];

function L(locale: string, ko: string, vi: string, en: string) {
  if (locale === 'vi') return vi;
  if (locale === 'en') return en;
  return ko;
}

export default function PaymentSheet({
  orderId,
  amount,
  locale = 'vi',
  onSuccess,
}: {
  orderId: string;
  /** 주문의 확정 금액(VND). DB 에서 읽은 값이어야 한다 — 사용자 입력 금지 */
  amount: number;
  locale?: string;
  onSuccess: () => void;
}) {
  const supabase = useSupabase();
  const { user, wallets } = useAuthState();

  const [method, setMethod] = useState<PaymentMethod>('vietqr');
  const [remainMethod, setRemainMethod] = useState<RemainMethod>('vietqr');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [critical, setCritical] = useState<string | null>(null);
  const [bmRateVnd, setBmRateVnd] = useState<number | null>(null);

  // 헤더의 💎 BM 칩과 같은 값. pointBalance(⭐ Point)와 다른 지갑이다.
  const bmBalanceVnd = wallets?.pointBalanceVnd ?? 0;
  const bmPortion = Math.min(bmBalanceVnd, amount);
  const bmRemain = amount - bmPortion;
  const needsMixed = method === 'bm' && bmRemain > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('service_settings')
        .select('value')
        .eq('key', 'bm_rate_vnd')
        .maybeSingle();
      if (!cancelled && data?.value) setBmRateVnd(Number(data.value));
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const insertPayment = useMemo(
    () => async (m: PaymentMethod, amt: number) => {
      const { error: err } = await supabase.from('payments').insert({
        order_id: orderId,
        amount: amt,
        method: m,
        status: 'held',
        idempotency_key: `${orderId}:${m}`,
      });
      if (err) throw new Error(err.message);
    },
    [supabase, orderId]
  );

  const handlePay = async () => {
    if (processing) return;
    setError(null);
    setCritical(null);

    if (!user) {
      setError(L(locale, '로그인이 필요합니다.', 'Cần đăng nhập.', 'Login required.'));
      return;
    }
    if (amount <= 0) {
      setError(L(locale, '주문 금액이 확정되지 않았습니다.', 'Số tiền đơn hàng chưa được xác định.', 'Order amount is not set yet.'));
      return;
    }

    setProcessing(true);
    try {
      if (method === 'bm') {
        if (bmPortion <= 0) {
          setError(L(locale, 'BM 잔액이 없습니다. 다른 수단을 선택해 주세요.', 'Không có số dư BM. Hãy chọn phương thức khác.', 'No BM balance. Choose another method.'));
          return;
        }
        if (!MERCHANT_ID) {
          setError(L(locale, '가맹점 설정이 누락되었습니다. 관리자에게 문의해 주세요.', 'Thiếu cấu hình cửa hàng. Vui lòng liên hệ quản trị.', 'Merchant config missing. Please contact the admin.'));
          return;
        }

        // 1) BM 차감 (Firebase) — 반드시 먼저. 실패 시 payments 레코드를 만들지 않는다.
        await callPayServiceJobEscrow(MERCHANT_ID, orderId, bmPortion);

        // 2) 차감 성공 후에만 Supabase 결제 기록
        try {
          await insertPayment('bm', bmPortion);
        } catch (e) {
          // 환불 엔드포인트가 없으므로 자동 복구가 불가능하다 — 사용자에게 명확히 알린다
          setCritical(
            L(
              locale,
              `BM ${formatVND(bmPortion)}은 차감되었지만 결제 기록 저장에 실패했습니다. 주문번호 ${orderId} 와 함께 고객센터에 문의해 주세요. (${e instanceof Error ? e.message : String(e)})`,
              `Đã trừ ${formatVND(bmPortion)} BM nhưng lưu bản ghi thanh toán thất bại. Vui lòng liên hệ CSKH kèm mã đơn ${orderId}.`,
              `${formatVND(bmPortion)} in BM was deducted but the payment record failed to save. Please contact support with order ${orderId}.`
            )
          );
          return;
        }

        // 3) 혼합 결제 잔액
        if (bmRemain > 0) {
          await insertPayment(remainMethod, bmRemain);
        }
      } else {
        await insertPayment(method, amount);
      }

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  };

  const methodNotice = (() => {
    switch (method) {
      case 'cash':
        return L(
          locale,
          '작업 완료 후 현장에서 현금으로 결제합니다. 관리자 입금 확인 후 처리됩니다.',
          'Thanh toán tiền mặt tại nhà sau khi hoàn thành. Xử lý sau khi quản trị xác nhận.',
          'Pay cash on site after the work. Processed after admin confirmation.'
        );
      case 'vietqr':
        return L(
          locale,
          '은행 계좌로 이체한 뒤 관리자가 입금을 확인하면 기술자가 배정됩니다. (자동 입금 확인 연동은 준비 중)',
          'Chuyển khoản ngân hàng; kỹ thuật viên được phân công sau khi quản trị xác nhận. (Đối soát tự động đang chuẩn bị)',
          'Transfer to the bank account; a technician is assigned once the admin confirms. (Automatic reconciliation is not live yet.)'
        );
      case 'momo':
        return L(
          locale,
          'MoMo 송금 후 관리자가 확인하면 기술자가 배정됩니다. (MoMo API 자동 연동은 준비 중)',
          'Sau khi gửi MoMo, kỹ thuật viên được phân công khi quản trị xác nhận. (API MoMo đang chuẩn bị)',
          'After sending via MoMo, a technician is assigned once the admin confirms. (MoMo API is not live yet.)'
        );
      case 'bm':
        return L(
          locale,
          'BestClub BM 포인트로 결제합니다. 결제 금액은 작업 완료 승인까지 에스크로로 보관됩니다.',
          'Thanh toán bằng điểm BM của BestClub. Tiền được giữ ký quỹ đến khi bạn xác nhận hoàn thành.',
          'Pay with BestClub BM points. The amount is held in escrow until you approve completion.'
        );
    }
  })();

  return (
    <div className="space-y-4">
      {/* 금액 */}
      <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--color-primary-bg, #FFEBEE)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>
          {L(locale, '결제 금액', 'Số tiền thanh toán', 'Amount due')}
        </p>
        <p className="text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
          {formatVND(amount)}
        </p>
      </div>

      {/* 수단 탭 */}
      <div className="grid grid-cols-2 gap-2">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => { setMethod(m.id); setError(null); }}
            className="rounded-xl border px-3 py-3 text-xs font-bold text-left transition-all"
            style={
              method === m.id
                ? { background: 'var(--color-primary-bg, #FFEBEE)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-2)' }
            }
          >
            <span className="mr-1">{m.icon}</span>
            {L(locale, m.ko, m.vi, m.en)}
          </button>
        ))}
      </div>

      {/* BM 잔액 + 혼합 결제 */}
      {method === 'bm' && (
        <div className="rounded-xl border p-4 space-y-2" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="flex items-baseline justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>
              {L(locale, 'BM 잔액', 'Số dư BM', 'BM balance')}
            </span>
            <span className="font-bold" style={{ color: 'var(--color-text)' }}>{formatVND(bmBalanceVnd)}</span>
          </div>
          {bmRateVnd ? (
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              1 BM = {formatVND(bmRateVnd)}
            </p>
          ) : null}

          {needsMixed && (
            <>
              <div className="flex items-baseline justify-between text-xs pt-2 border-t" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {L(locale, 'BM 사용', 'Dùng BM', 'BM applied')}
                </span>
                <span className="font-bold" style={{ color: 'var(--color-primary)' }}>-{formatVND(bmPortion)}</span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {L(locale, '추가 결제 필요', 'Cần thanh toán thêm', 'Remaining to pay')}
                </span>
                <span className="font-bold" style={{ color: 'var(--color-text)' }}>{formatVND(bmRemain)}</span>
              </div>

              <label className="block text-[11px] font-semibold uppercase tracking-wide pt-2" style={{ color: 'var(--color-text-muted)' }}>
                {L(locale, '잔액 결제 수단', 'Phương thức cho phần còn lại', 'Method for the remainder')}
              </label>
              <select
                value={remainMethod}
                onChange={(e) => setRemainMethod(e.target.value as RemainMethod)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
              >
                {METHODS.filter((m) => m.id !== 'bm').map((m) => (
                  <option key={m.id} value={m.id}>{L(locale, m.ko, m.vi, m.en)}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {methodNotice}
      </p>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      {critical && (
        <div className="rounded-xl border p-3" style={{ background: '#FFEBEE', borderColor: '#D32F2F' }}>
          <p className="text-xs font-bold leading-relaxed" style={{ color: '#B71C1C' }}>⚠️ {critical}</p>
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={processing || amount <= 0}
        className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {processing
          ? L(locale, '결제 처리 중…', 'Đang xử lý…', 'Processing…')
          : `${formatVND(amount)} ${L(locale, '결제하기', 'Thanh toán', 'Pay')}`}
      </button>
    </div>
  );
}
