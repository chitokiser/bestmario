'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDateTime, formatVND } from '@/lib/format';
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

  const markPaid = async (s: Settlement) => {
    if (acting) return;
    const ref = window.prompt(
      t('기술자 계좌로 입금한 거래번호(또는 메모)를 입력해 주세요', 'Nhập mã giao dịch (hoặc ghi chú) đã chuyển cho kỹ thuật viên', 'Enter the transfer reference (or note) of the payout')
    );
    if (ref === null) return;
    setActing(s.id);
    setError(null);
    const { error: err } = await supabase.rpc('mark_settlement_paid', { p_id: s.id, p_ref: ref.trim() });
    if (err) setError(err.message);
    await load();
    setActing(null);
  };

  const pending = rows.filter((s) => s.payout_status === 'pending');
  const paid = rows.filter((s) => s.payout_status === 'paid').slice(0, 10);
  const nameOf = (uid: string) => users[uid]?.name || uid.slice(0, 8);

  const bankText = (uid: string) => {
    const b = profiles[uid];
    return b && b.bank_account ? `${b.bank_name} ${b.bank_account} (${b.bank_holder})` : null;
  };

  if (loading) return null;

  return (
    <section className="space-y-3" aria-label={t('기술자 정산 지급', 'Chi trả cho kỹ thuật viên', 'Technician payouts')}>
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
        💸 {t('기술자 정산 지급', 'Chi trả cho kỹ thuật viên', 'Technician payouts')} ({pending.length})
      </h2>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '플랫폼 계좌로 들어온 결제에서 수수료를 뺀 정산액을 기술자 계좌로 입금한 뒤 "지급 완료"로 기록하세요.',
          'Chuyển phần thanh toán sau khi trừ phí vào tài khoản kỹ thuật viên rồi ghi nhận "Đã chi trả".',
          'Deposit the payout (after the fee) to the technician, then record it as "Paid".'
        )}
      </p>
      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('지급할 정산이 없습니다.', 'Không có khoản nào cần chi trả.', 'Nothing to pay out.')}</p>
      ) : (
        pending.map((s) => {
          const bank = bankText(s.technician_uid);
          return (
            <article key={s.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{nameOf(s.technician_uid)}</p>
                <p className="text-base font-extrabold" style={{ color: 'var(--color-primary)' }}>{formatVND(s.net_amount)}</p>
              </div>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {t('총액', 'Tổng', 'Gross')} {formatVND(s.gross_amount)} · {t('수수료', 'Phí', 'Fee')} {(s.fee_rate * 100).toFixed(1)}% (-{formatVND(s.gross_amount - s.net_amount)}) · {formatDateTime(s.settled_at, locale)}
              </p>
              <p className="mt-1 text-xs" style={{ color: bank ? 'var(--color-text)' : '#D32F2F' }}>
                🏦 {bank ?? t('정산 계좌 미등록 — 기술자에게 등록을 요청하세요', 'Chưa đăng ký tài khoản', 'No payout account registered')}
              </p>
              <button
                onClick={() => void markPaid(s)}
                disabled={acting !== null || !bank}
                className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: '#388E3C' }}
              >
                {acting === s.id ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('입금 완료 기록', 'Ghi nhận đã chi trả', 'Record as paid')}
              </button>
            </article>
          );
        })
      )}

      {paid.length > 0 && (
        <details className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <summary className="cursor-pointer text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
            {t('최근 지급 완료', 'Đã chi trả gần đây', 'Recently paid')} ({paid.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {paid.map((s) => (
              <li key={s.id} className="text-xs" style={{ color: 'var(--color-text)' }}>
                <b>{nameOf(s.technician_uid)}</b> {formatVND(s.net_amount)} · {s.paid_at ? formatDateTime(s.paid_at, locale) : ''}
                <br />
                <span style={{ color: 'var(--color-text-muted)' }}>{s.payout_bank} · {t('거래번호', 'Mã GD', 'Ref')} {s.payout_ref}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
