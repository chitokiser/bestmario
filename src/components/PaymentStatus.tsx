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
  showUnpaid = false,
}: {
  orderId: string;
  locale: string;
  audience: 'customer' | 'technician';
  showUnpaid?: boolean;
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
    const timer = setInterval(() => void load(), 15000);
    const channel = supabase
      .channel(`payment-status-${orderId}-${audience}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${orderId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      alive = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, orderId, audience]);

  if (rows === null) return null;

  if (rows.length === 0) {
    if (!showUnpaid) return null;
    return (
      <section
        className="rounded-2xl border px-4 py-3"
        style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)' }}
      >
        <p className="text-xs font-extrabold" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
          💳 {t('고객 플랫폼 입금 대기 중', 'Đang chờ khách thanh toán vào nền tảng', 'Awaiting customer deposit to platform')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '아직 고객의 플랫폼 입금이 확인되지 않았습니다. 고객이 입금하고 관리자가 입금 확인을 완료하면 아래에 「플랫폼 입금 확인 완료 (정산 보장)」 메시지가 표시됩니다.',
            'Chưa xác nhận khoản thanh toán của khách vào nền tảng. Khi khách chuyển khoản và quản trị viên xác nhận, thông báo «Đã xác nhận thanh toán (Đảm bảo quyết toán)» sẽ hiển thị.',
            "The customer's deposit to the platform has not been confirmed yet. Once the customer pays and an admin confirms it, a “Deposit confirmed (Payout guaranteed)” notice will appear.",
          )}
        </p>
      </section>
    );
  }

  const confirmed = rows.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const waiting = rows.filter((p) => p.status === 'held').reduce((s, p) => s + p.amount, 0);
  const ok = confirmed > 0 && waiting === 0;

  return (
    <section
      className="rounded-2xl border px-4 py-3"
      style={{
        background: ok ? '#E8F5E9' : '#FFF8E1',
        borderColor: ok ? '#2E7D32' : '#EF6C00',
      }}
    >
      <p className="text-sm font-extrabold" style={{ color: ok ? '#1B5E20' : '#E65100' }}>
        {ok
          ? audience === 'technician'
            ? `🛡️ ${t('플랫폼 입금 확인 완료 (정산 보장)', 'Đã xác nhận tiền vào nền tảng (Đảm bảo quyết toán)', 'Platform deposit confirmed (Payout guaranteed)')} · ${formatVND(confirmed)}`
            : `✓ ${t('입금 확인 완료', 'Đã xác nhận thanh toán', 'Deposit confirmed')} · ${formatVND(confirmed)}`
          : `⏳ ${t('고객 입금 접수 · 관리자 확인 대기', 'Khách đã báo chuyển khoản · Chờ quản trị xác nhận', 'Deposit reported · Awaiting admin confirmation')} · ${formatVND(waiting)}`}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: ok ? '#1B5E20' : '#5c5c6e' }}>
        {audience === 'technician'
          ? ok
            ? t(
                '고객이 베스트마리오 플랫폼에 입금을 완료했고 관리자가 입금을 최종 확인했습니다. 작업 완료 시 수수료를 제외한 정산금을 확실하게 지급받으실 수 있으니 안심하고 작업하세요.',
                'Khách đã thanh toán vào nền tảng BestMario và quản trị viên đã xác nhận. Khi hoàn thành công việc, bạn chắc chắn nhận được tiền quyết toán (sau khi trừ phí) — hãy yên tâm làm việc.',
                "The customer has paid into BestMario's platform account and an admin confirmed the deposit. Your payout (minus the platform fee) is guaranteed upon job completion — you can work with confidence.",
              )
            : t(
                '고객이 플랫폼 계좌로 입금했다고 알렸습니다. 관리자가 실제 입금을 확인하면 즉시 「플랫폼 입금 확인 완료 (정산 보장)」 상태로 바뀌며 알림을 보내 드립니다.',
                'Khách báo đã chuyển tiền vào tài khoản nền tảng. Khi quản trị viên xác nhận, trạng thái sẽ đổi sang «Đã xác nhận tiền vào nền tảng (Đảm bảo quyết toán)» và gửi thông báo cho bạn.',
                'The customer reported transferring to the platform account. Once an admin verifies the deposit, this will change to “Platform deposit confirmed (Payout guaranteed)” and you will be notified.',
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
