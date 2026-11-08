'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDateTime, formatVND } from '@/lib/format';
import { findBankByKeyword, getVietQrUrl } from '@/lib/vietnamBanks';
import type { DbUser, Settlement, TechnicianProfile } from '@/types/supabase';

/**
 * 기술자 정산 지급. 고객이 플랫폼 계좌로 낸 돈에서 수수료를 뺀 금액(net_amount)을
 * 운영자가 기술자 계좌로 입금한 뒤, 거래번호와 함께 '지급 완료'로 기록한다.
 */
export default function AdminPayouts({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [rows, setRows] = useState<Settlement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TechnicianProfile>>({});
  const [users, setUsers] = useState<Record<string, DbUser>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 모달 상태
  const [targetSettlement, setTargetSettlement] = useState<Settlement | null>(null);
  const [payoutRef, setPayoutRef] = useState('');

  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const { data, error: err } = await supabase
      .from('settlements')
      .select('*')
      .order('settled_at', { ascending: false })
      .limit(100);
    if (mine !== seq.current) return;
    const list = (data ?? []) as Settlement[];
    const uids = [...new Set(list.map((s) => s.technician_uid))];
    const [p, u] = uids.length
      ? await Promise.all([
          supabase.from('technician_profiles').select('*').in('uid', uids),
          supabase.from('users').select('*').in('uid', uids),
        ])
      : [{ data: [] }, { data: [] }];
    if (mine !== seq.current) return;
    setRows(list);
    setProfiles(Object.fromEntries(((p.data ?? []) as TechnicianProfile[]).map((x) => [x.uid, x])));
    setUsers(Object.fromEntries(((u.data ?? []) as DbUser[]).map((x) => [x.uid, x])));
    setError(err ? err.message : null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenPayModal = (s: Settlement) => {
    setTargetSettlement(s);
    setPayoutRef(`VietQR_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  };

  const confirmPayout = async () => {
    if (!targetSettlement || acting) return;
    setActing(targetSettlement.id);
    setError(null);
    try {
      const ref = payoutRef.trim() || `VietQR_${Date.now()}`;
      const { error: err } = await supabase.rpc('mark_settlement_paid', {
        p_id: targetSettlement.id,
        p_ref: ref,
      });
      if (err) throw new Error(err.message);
      setTargetSettlement(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const pending = rows.filter((s) => s.payout_status === 'pending');
  const paid = rows.filter((s) => s.payout_status === 'paid').slice(0, 15);
  const nameOf = (uid: string) => users[uid]?.name || uid.slice(0, 8);

  const totalPendingAmount = pending.reduce((sum, s) => sum + s.net_amount, 0);
  const totalPaidAmount = paid.reduce((sum, s) => sum + s.net_amount, 0);

  if (loading) return null;

  return (
    <section className="space-y-4" aria-label={t('기술자 정산 지급', 'Chi trả cho kỹ thuật viên', 'Technician payouts')}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
            <span>💸</span>
            <span>{t('기술자 정산 인출 관리 (VietQR 즉시 송금)', 'Quản lý chi trả VietQR', 'Technician Payouts (VietQR)')}</span>
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {t(
              '기술자 인출 요청 시 VietQR 코드를 모바일 뱅킹 앱으로 스캔하면 3초 만에 송금할 수 있습니다.',
              'Quét mã VietQR bằng app ngân hàng để chuyển khoản cho thợ trong 3 giây.',
              'Scan VietQR with any mobile banking app to send payouts in 3 seconds.'
            )}
          </p>
        </div>
      </div>

      {/* 요약 현황 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5">
          <p className="text-[11px] font-bold text-amber-800">⏳ {t('송금 대기 건수', 'Đang chờ chi trả', 'Pending Payouts')}</p>
          <p className="text-xl font-black text-amber-950 mt-1">{formatVND(totalPendingAmount)}</p>
          <p className="text-[10px] text-amber-700 mt-0.5">{pending.length}건 대기 중</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5">
          <p className="text-[11px] font-bold text-emerald-800">✓ {t('지급 완료 총액', 'Đã hoàn tất chi trả', 'Total Completed')}</p>
          <p className="text-xl font-black text-emerald-950 mt-1">{formatVND(totalPaidAmount)}</p>
          <p className="text-[10px] text-emerald-700 mt-0.5">{paid.length}건 처리됨</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* 대기 목록 */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
          {t('송금 대기 목록', 'Danh sách chờ chuyển', 'Pending Transfers')} ({pending.length})
        </h3>

        {pending.length === 0 ? (
          <div className="rounded-2xl border p-6 text-center text-xs text-gray-400 bg-white" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
            ✓ {t('지급할 대기 건이 없습니다.', 'Không có khoản nào cần chi trả.', 'No pending payouts.')}
          </div>
        ) : (
          pending.map((s) => {
            const profile = profiles[s.technician_uid];
            const hasBank = Boolean(profile?.bank_account?.trim());
            const bankMatch = profile ? findBankByKeyword(profile.bank_name) : undefined;
            const bankCode = bankMatch?.code || 'VCB';
            const qrUrl = hasBank
              ? getVietQrUrl(bankCode, profile.bank_account, s.net_amount, `BM_${s.id.slice(0, 8)}`)
              : '';

            return (
              <article
                key={s.id}
                className="rounded-3xl border p-4 shadow-sm space-y-3"
                style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-gray-900">{nameOf(s.technician_uid)}</span>
                    <p className="text-[10px] font-mono text-gray-400">
                      주문 ID: {s.order_id?.slice(0, 8)} · {formatDateTime(s.settled_at, locale)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-emerald-700">
                      {formatVND(s.net_amount)}
                    </span>
                    <p className="text-[10px] text-gray-400">
                      매출 {formatVND(s.gross_amount)} (수수료 {(s.fee_rate * 100).toFixed(0)}%)
                    </p>
                  </div>
                </div>

                {/* 계좌 및 VietQR 카드 */}
                {hasBank ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {qrUrl && (
                        <div className="w-16 h-16 rounded-xl bg-white border border-emerald-200 p-0.5 shrink-0 shadow-xs">
                          <img src={qrUrl} alt="VietQR" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900">
                            {profile.bank_name}
                          </span>
                          <span className="text-xs font-mono font-bold text-emerald-950 truncate">
                            {profile.bank_account}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-gray-700 mt-0.5 truncate">
                          예금주: {profile.bank_holder}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {t('스마트폰 은행 앱으로 QR 스캔 시 1초 만에 자동 입력됩니다.', 'Quét mã bằng app ngân hàng để chuyển nhanh.', 'Scan with mobile banking app.')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(profile.bank_account, `acc_${s.id}`)}
                        className="rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-gray-700 shadow-xs hover:bg-gray-50 active:scale-95"
                      >
                        {copiedKey === `acc_${s.id}` ? '✓ 복사됨' : '계좌 복사'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(String(s.net_amount), `amt_${s.id}`)}
                        className="rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-gray-700 shadow-xs hover:bg-gray-50 active:scale-95"
                      >
                        {copiedKey === `amt_${s.id}` ? '✓ 복사됨' : '금액 복사'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-red-50 p-2.5 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{t('기술자가 정산 계좌를 아직 등록하지 않았습니다.', 'Kỹ thuật viên chưa đăng ký tài khoản.', 'No payout account registered.')}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenPayModal(s)}
                  disabled={!hasBank || acting !== null}
                  className="w-full rounded-2xl py-2.5 text-xs font-black text-white shadow-sm transition-transform active:scale-98 disabled:opacity-40"
                  style={{ background: '#2E7D32' }}
                >
                  {acting === s.id
                    ? t('처리 중…', 'Đang xử lý…', 'Processing…')
                    : t('✅ 송금 확인 및 지급 완료 처리', 'Xác nhận đã chuyển tiền', 'Confirm Payout & Mark Paid')}
                </button>
              </article>
            );
          })
        )}
      </div>

      {/* 완료 목록 */}
      {paid.length > 0 && (
        <details className="rounded-3xl border p-4" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <summary className="cursor-pointer text-xs font-bold text-gray-500">
            {t('최근 지급 완료 내역', 'Lịch sử chi trả gần đây', 'Recently Completed Payouts')} ({paid.length})
          </summary>
          <div className="mt-3 divide-y" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
            {paid.map((s) => (
              <div key={s.id} className="py-2.5 flex items-baseline justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900">{nameOf(s.technician_uid)}</span>
                  <p className="text-[10px] text-gray-400">
                    {s.paid_at ? formatDateTime(s.paid_at, locale) : ''} · {s.payout_bank}
                    {s.payout_ref ? ` · [${s.payout_ref}]` : ''}
                  </p>
                </div>
                <span className="font-mono font-bold text-gray-600">{formatVND(s.net_amount)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 송금 승인 모달 */}
      {targetSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl space-y-4"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900">
                {t('정산 송금 완료 승인', 'Xác nhận chi trả', 'Confirm Payout')}
              </h3>
              <button onClick={() => setTargetSettlement(null)} className="text-gray-400 text-lg font-bold">
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">기술자:</span>
                <span className="font-bold text-gray-900">{nameOf(targetSettlement.technician_uid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">송금 정산액:</span>
                <span className="font-extrabold text-emerald-700 text-sm">{formatVND(targetSettlement.net_amount)}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">
                {t('은행 송금 거래번호 또는 메모 (선택)', 'Mã giao dịch / Ghi chú', 'Transfer Reference / Note')}
              </label>
              <input
                value={payoutRef}
                onChange={(e) => setPayoutRef(e.target.value)}
                placeholder="예: VietQR_20261108"
                className="w-full rounded-xl border px-3 py-2 text-xs font-mono outline-none"
                style={{
                  background: 'var(--color-bg, #f7f7f8)',
                  borderColor: 'var(--color-border, #ebebed)',
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTargetSettlement(null)}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold border border-gray-200 text-gray-600"
              >
                {t('취소', 'Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmPayout}
                disabled={acting !== null}
                className="flex-1 rounded-xl py-2.5 text-xs font-black text-white shadow-md active:scale-95 disabled:opacity-50"
                style={{ background: '#2E7D32' }}
              >
                {acting !== null ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('지급 완료 확정', 'Xác nhận', 'Confirm Paid')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
