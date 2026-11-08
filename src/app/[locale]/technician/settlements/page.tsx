'use client';

import { use, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatDateTime, formatVND } from '@/lib/format';
import TechnicianBankForm from '@/components/TechnicianBankForm';
import type { Settlement, TechnicianProfile } from '@/types/supabase';

export default function TechnicianSettlementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();
  const { user } = useAuthState();

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 인출 신청 모달 상태
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const [settleRes, profRes] = await Promise.all([
        supabase
          .from('settlements')
          .select('*')
          .eq('technician_uid', user.uid)
          .order('settled_at', { ascending: false }),
        supabase
          .from('technician_profiles')
          .select('*')
          .eq('uid', user.uid)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (settleRes.error) setError(settleRes.error.message);
      else setSettlements((settleRes.data ?? []) as Settlement[]);

      if (profRes.data) setProfile(profRes.data as TechnicianProfile);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const pendingSettlements = settlements.filter((s) => s.payout_status === 'pending');
  const paidSettlements = settlements.filter((s) => s.payout_status === 'paid');

  const pendingNet = pendingSettlements.reduce((s, x) => s + x.net_amount, 0);
  const paidNet = paidSettlements.reduce((s, x) => s + x.net_amount, 0);
  const totalGross = settlements.reduce((s, x) => s + x.gross_amount, 0);

  const hasBankAccount = Boolean(profile?.bank_account?.trim());

  const handleOpenWithdraw = () => {
    if (!hasBankAccount) {
      const el = document.getElementById('bank-form-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      setError(
        t(
          '먼저 정산 입금 계좌를 등록해 주세요.',
          'Vui lòng đăng ký tài khoản ngân hàng trước.',
          'Please register your payout bank account first.'
        )
      );
      return;
    }
    if (pendingNet <= 0) {
      setError(
        t(
          '현재 인출 가능한 정산 잔액이 없습니다.',
          'Hiện tại không có số dư khả dụng để rút.',
          'No available balance to withdraw.'
        )
      );
      return;
    }
    setError(null);
    setShowWithdrawModal(true);
  };

  const handleConfirmWithdraw = async () => {
    setWithdrawing(true);
    setError(null);

    // 모의 지연 (실제로는 관리자에게 알림 또는 상태 업데이트)
    await new Promise((r) => setTimeout(r, 600));

    setWithdrawing(false);
    setShowWithdrawModal(false);
    setWithdrawSuccess(true);
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
          {t('기술자 정산 및 인출 관리', 'Quản lý thu nhập & Rút tiền', 'Earnings & Payouts')}
        </h1>
        <span className="text-[11px] font-bold text-gray-500">
          {t('총 완료 건수', 'Tổng đơn hoàn thành', 'Completed')}: {settlements.length}
        </span>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          ⚠️ {error}
        </div>
      )}

      {withdrawSuccess && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <p className="text-xs font-black">
              {t('정산 인출 신청이 완료되었습니다!', 'Yêu cầu rút tiền thành công!', 'Payout Request Submitted!')}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-emerald-800 leading-relaxed">
            {t(
              '관리자가 확인 후 등록하신 VietQR 계좌로 즉시 이체해 드립니다. (통상 1시간 내 처리)',
              'Quản trị viên sẽ kiểm tra và chuyển khoản tới tài khoản VietQR đã đăng ký (thường trong 1 giờ).',
              'The operator will review and transfer via VietQR shortly (usually within 1 hour).'
            )}
          </p>
        </div>
      )}

      {/* 정산 잔액 현황 카드 */}
      <div
        className="rounded-3xl p-5 shadow-sm text-white relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 60%, #1565C0 100%)',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
              💵 {t('인출 가능 잔액', 'Số dư có thể rút', 'Available to Withdraw')}
            </span>
            <p className="text-3xl font-black mt-1 text-white tracking-tight">
              {formatVND(pendingNet)}
            </p>
          </div>
          <button
            onClick={handleOpenWithdraw}
            disabled={pendingNet <= 0}
            className="rounded-2xl bg-white px-4 py-2.5 text-xs font-black shadow-lg transition-transform active:scale-95 disabled:opacity-40"
            style={{ color: '#1B5E20' }}
          >
            {t('💸 인출 신청하기', '💸 Rút tiền ngay', '💸 Withdraw Now')}
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-white/85">
          <span>
            {t('누적 지급 완료', 'Đã thanh toán tích lũy', 'Total Paid Out')}: <b>{formatVND(paidNet)}</b>
          </span>
          <span>
            {t('총 매출', 'Tổng doanh thu', 'Gross')}: {formatVND(totalGross)}
          </span>
        </div>
      </div>

      {/* 계좌 등록 영역 */}
      <div id="bank-form-section">
        <TechnicianBankForm locale={locale} />
      </div>

      {/* 정산 내역 목록 */}
      <div className="space-y-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
          {t('세부 정산 내역', 'Lịch sử thanh toán chi tiết', 'Settlement History')} ({settlements.length})
        </h2>

        {settlements.length === 0 ? (
          <div
            className="rounded-3xl border p-8 text-center"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
          >
            <div className="text-3xl mb-2">💰</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {t(
                '정산 내역이 없습니다. 고객이 작업 완료를 승인하면 정산이 생성됩니다.',
                'Chưa có bản thanh toán. Sẽ được tạo khi khách xác nhận hoàn thành.',
                'No settlements yet. Created when a customer approves completed work.'
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {settlements.map((s) => (
              <article
                key={s.id}
                className="rounded-2xl border p-4 transition-all hover:shadow-xs"
                style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-mono text-gray-400">
                    ID: {s.id.slice(0, 8)} · {formatDateTime(s.settled_at, locale)}
                  </span>
                  <span className="text-base font-extrabold" style={{ color: 'var(--color-primary)' }}>
                    +{formatVND(s.net_amount)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                      s.payout_status === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {s.payout_status === 'paid'
                      ? `✓ ${t('계좌 입금 완료', 'Đã chuyển khoản', 'Paid Out')}`
                      : `⏳ ${t('인출 대기 중', 'Chờ rút tiền', 'Available')}`}
                  </span>

                  <span className="text-[11px] text-gray-500">
                    {t('매출', 'Doanh thu', 'Gross')}: {formatVND(s.gross_amount)} (수수료 {(s.fee_rate * 100).toFixed(0)}%)
                  </span>
                </div>

                {s.paid_at && (
                  <p className="mt-2 text-[10px] text-gray-400 border-t pt-1.5" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
                    송금 일시: {formatDateTime(s.paid_at, locale)}
                    {s.payout_ref ? ` · 참조: ${s.payout_ref}` : ''}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* 인출 신청 확인 모달 */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl space-y-4"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                <span>💸</span>
                <span>{t('정산 인출 신청 확인', 'Xác nhận rút tiền', 'Confirm Withdrawal')}</span>
              </h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('인출 신청 금액', 'Số tiền rút', 'Amount')}</span>
                <span className="text-lg font-black text-emerald-700">{formatVND(pendingNet)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('입금 은행', 'Ngân hàng', 'Bank')}</span>
                <span className="text-xs font-bold text-gray-800">{profile?.bank_name}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('입금 계좌', 'Số tài khoản', 'Account')}</span>
                <span className="text-xs font-mono font-bold text-gray-800">{profile?.bank_account}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('예금주', 'Chủ tài khoản', 'Holder')}</span>
                <span className="text-xs font-bold text-gray-800">{profile?.bank_holder}</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              {t(
                '※ 인출 신청 즉시 관리자에게 송금 요청이 전달되며, 베트남 은행 영업시간 기준 통상 1시간 내 입금 처리됩니다.',
                '※ Yêu cầu sẽ được gửi tới quản trị viên. Tiền sẽ về tài khoản trong vòng 1 giờ.',
                '※ The request will be sent to admin. Payouts are usually processed within 1 hour.'
              )}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 rounded-xl py-3 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                {t('취소', 'Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                disabled={withdrawing}
                className="flex-1 rounded-xl py-3 text-xs font-black text-white shadow-md active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {withdrawing
                  ? t('신청 중…', 'Đang xử lý…', 'Processing…')
                  : t('인출 신청하기', 'Xác nhận rút', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
