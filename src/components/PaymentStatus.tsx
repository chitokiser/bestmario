'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { formatVND } from '@/lib/format';
import type { Payment } from '@/types/supabase';

/**
 * 입금 진행 상태 카드. 고객이 플랫폼 관리계좌로 입금하면 관리자가 확인하고,
 * 확인되면 "입금 확인됨"으로 바뀐다. 기술자에게는 안심하고 작업해도 된다는 안내를 보여 준다.
 */
export default function PaymentStatus({
  orderId,
  locale,
  audience,
}: {
  orderId: string;
  locale: string;
  audience: 'customer' | 'technician';
}) {
  const supabase = useSupabase();
  const t = (ko: string, vi: string, en: string) => (locale === 'vi' ? vi : locale === 'en' ? en : ko);
  const [rows, setRows] = useState<Payment[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('payments').select('*').eq('order_id', orderId);
      if (alive) setRows(((data ?? []) as Payment[]).filter((p) => p.status !== 'refunded'));
    };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [supabase, orderId]);

  if (!rows || rows.length === 0) return null;

  const confirmed = rows.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const waiting = rows.filter((p) => p.status === 'held').reduce((s, p) => s + p.amount, 0);
  const ok = confirmed > 0 && waiting === 0;

  return (
    <section
      className="rounded-2xl border px-4 py-3"
      style={{ background: 'var(--color-surface, #fff)', borderColor: ok ? '#2E7D32' : 'var(--color-border, #ebebed)' }}
    >
      <p className="text-sm font-extrabold" style={{ color: ok ? '#2E7D32' : '#E65100' }}>
        {ok
          ? `✓ ${t('입금 확인 완료', 'Đã xác nhận thanh toán', 'Deposit confirmed')} · ${formatVND(confirmed)}`
          : `⏳ ${t('입금 확인 대기', 'Chờ xác nhận thanh toán', 'Awaiting deposit confirmation')} · ${formatVND(waiting)}`}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {audience === 'technician'
          ? ok
            ? t(
                '고객 입금이 베스트마리오 플랫폼 관리계좌에서 확인됐어요. 안심하고 작업을 진행하세요. 완료되면 수수료를 제외한 금액이 정산됩니다.',
                'Khoản tiền của khách đã được xác nhận trong tài khoản quản lý của BestMario. Hãy yên tâm thi công. Khi hoàn thành, số tiền sau khi trừ phí sẽ được quyết toán.',
                "The customer's deposit is confirmed in BestMario's platform account. Go ahead with the work; the amount minus the fee is settled on completion.",
              )
            : t(
                '고객이 입금했다고 알렸어요. 관리자가 플랫폼 계좌 입금을 확인하면 알려 드립니다.',
                'Khách báo đã chuyển tiền. Chúng tôi sẽ báo khi quản trị viên xác nhận.',
                'The customer reported paying. You will be notified once an admin confirms it.',
              )
          : ok
            ? t(
                '입금이 베스트마리오 플랫폼 관리계좌에서 확인됐어요. 작업 완료를 승인하면 수수료를 제외하고 기술자에게 정산됩니다.',
                'Khoản tiền đã được xác nhận trong tài khoản quản lý của BestMario. Khi bạn xác nhận hoàn thành, tiền sẽ được quyết toán cho kỹ thuật viên sau khi trừ phí.',
                'Your deposit is confirmed in the BestMario platform account. When you approve completion, the technician is paid minus the fee.',
              )
            : t(
                '관리자가 플랫폼 관리계좌 입금을 확인하는 중이에요. 확인되면 알림을 보내 드립니다.',
                'Quản trị viên đang kiểm tra khoản chuyển vào tài khoản quản lý. Bạn sẽ nhận thông báo khi xác nhận.',
                'An admin is checking the deposit in the platform account. You will be notified when confirmed.',
              )}
      </p>
    </section>
  );
}
