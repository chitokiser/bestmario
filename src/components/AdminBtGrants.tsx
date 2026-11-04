'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { callMerchantSendBtDirect } from '@/lib/firebase';
import { formatVND } from '@/lib/format';
import type { BtGrant, DbUser, Payment, ServiceOrder } from '@/types/supabase';

interface Row {
  order: ServiceOrder;
  paid: number;
  customer: DbUser | undefined;
  grant: BtGrant | undefined;
}

/**
 * 운영자가 가진 BT 를 고객에게 보낸다. BestClub 의 merchantSendBtDirect 를 그대로 호출하므로
 * 이 화면은 가맹점 주인 계정으로 로그인했을 때만 동작한다. BT 수량은 금액 / 가맹점 btPerVnd.
 * 주문당 1번만 보낼 수 있고(bt_grants.order_id unique), 결과는 이력으로 남긴다.
 */
export default function AdminBtGrants({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    // 입금이 확인된(completed) 비BM 결제가 있는 주문만 대상으로 한다
    const { data: pays } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'completed')
      .neq('method', 'bm');
    const payList = (pays ?? []) as Payment[];
    const orderIds = [...new Set(payList.map((p) => p.order_id))];
    if (orderIds.length === 0) {
      if (mine === seq.current) {
        setRows([]);
        setLoading(false);
      }
      return;
    }
    const [{ data: orders }, { data: grants }] = await Promise.all([
      supabase.from('service_orders').select('*').in('id', orderIds),
      supabase.from('bt_grants').select('*').in('order_id', orderIds),
    ]);
    const orderList = (orders ?? []) as ServiceOrder[];
    const uids = [...new Set(orderList.map((o) => o.customer_uid))];
    const { data: users } = await supabase.from('users').select('*').in('uid', uids);
    if (mine !== seq.current) return;

    const userMap = new Map(((users ?? []) as DbUser[]).map((u) => [u.uid, u]));
    const grantMap = new Map(((grants ?? []) as BtGrant[]).map((g) => [g.order_id, g]));
    setRows(
      orderList
        .map((order) => ({
          order,
          paid: payList.filter((p) => p.order_id === order.id).reduce((s, p) => s + p.amount, 0),
          customer: userMap.get(order.customer_uid),
          grant: grantMap.get(order.id),
        }))
        .sort((a, b) => b.order.created_at.localeCompare(a.order.created_at))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (r: Row) => {
    if (acting || !user) return;
    setError(null);
    setMessage(null);

    let email = r.customer?.email ?? '';
    if (!email) {
      const input = window.prompt(
        t('이 고객의 이메일이 아직 저장되지 않았습니다. BestClub 가입 이메일을 입력해 주세요', 'Chưa có email của khách. Nhập email đã đăng ký BestClub', 'This customer has no email saved. Enter their BestClub email')
      );
      if (!input?.trim()) return;
      email = input.trim();
    }
    if (!window.confirm(t(`${email} 님에게 ${formatVND(r.paid)} 기준으로 BT를 보냅니다. 진행할까요?`, `Gửi BT cho ${email} theo ${formatVND(r.paid)}?`, `Send BT to ${email} based on ${formatVND(r.paid)}?`))) return;

    setActing(r.order.id);
    // 같은 주문에 두 번 보내지 않도록 먼저 기록(unique)한다. 실패한 기록은 다시 시도할 수 있다.
    const base = { order_id: r.order.id, customer_uid: r.order.customer_uid, amount_vnd: r.paid, created_by: user.uid };
    const { error: insErr } = r.grant
      ? await supabase.from('bt_grants').update({ status: 'pending', error: '', amount_vnd: r.paid, updated_at: new Date().toISOString() }).eq('id', r.grant.id).eq('status', 'failed')
      : await supabase.from('bt_grants').insert({ ...base, status: 'pending' });
    if (insErr) {
      setError(insErr.message);
      setActing(null);
      return;
    }

    try {
      const res = await callMerchantSendBtDirect(email, r.paid);
      await supabase
        .from('bt_grants')
        .update({ status: 'sent', bt_issued: res.data.btIssued, error: '', updated_at: new Date().toISOString() })
        .eq('order_id', r.order.id);
      setMessage(t(`BT ${res.data.btIssued}개를 보냈습니다.`, `Đã gửi ${res.data.btIssued} BT.`, `Sent ${res.data.btIssued} BT.`));
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      await supabase
        .from('bt_grants')
        .update({ status: 'failed', error: msg.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('order_id', r.order.id);
      setError(msg);
    }
    await load();
    setActing(null);
  };

  if (loading) return null;

  return (
    <section className="space-y-3" aria-label={t('BT 지급', 'Tặng BT', 'BT rewards')}>
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
        🎟️ {t('BT 지급', 'Tặng BT', 'BT rewards')}
      </h2>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '입금이 확인된 주문의 고객에게 운영자가 보유한 BT를 보냅니다. 주문당 1번만 보낼 수 있어요. 가맹점 주인 계정으로 로그인해야 동작합니다.',
          'Gửi BT của quản trị cho khách có đơn đã xác nhận thanh toán. Mỗi đơn chỉ gửi một lần. Cần đăng nhập bằng tài khoản chủ cửa hàng.',
          'Send your BT to customers with a confirmed payment. One grant per order. Requires the merchant-owner login.'
        )}
      </p>
      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}
      {message && <p className="text-xs font-semibold" style={{ color: '#2E7D32' }}>{message}</p>}

      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('대상 주문이 없습니다.', 'Không có đơn phù hợp.', 'No eligible orders.')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const sent = r.grant?.status === 'sent';
            return (
              <li key={r.order.id} className="rounded-2xl border p-3" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{r.customer?.name || r.order.customer_uid.slice(0, 8)}</p>
                  <p className="text-sm font-extrabold" style={{ color: 'var(--color-primary)' }}>{formatVND(r.paid)}</p>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  #{r.order.id.slice(0, 8)} · {r.customer?.email || t('이메일 미저장', 'chưa có email', 'no email')}
                </p>
                {sent ? (
                  <p className="mt-1 text-xs font-bold" style={{ color: '#2E7D32' }}>✓ {t('BT 지급 완료', 'Đã tặng BT', 'BT sent')} ({r.grant?.bt_issued} BT)</p>
                ) : (
                  <>
                    {r.grant?.status === 'failed' && (
                      <p className="mt-1 text-[11px]" style={{ color: '#D32F2F' }}>{t('이전 시도 실패', 'Lần trước thất bại', 'Last attempt failed')}: {r.grant.error}</p>
                    )}
                    <button
                      onClick={() => void send(r)}
                      disabled={acting !== null || r.grant?.status === 'pending'}
                      className="mt-2 w-full rounded-xl py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: 'var(--color-navy, #1A237E)' }}
                    >
                      {acting === r.order.id ? t('보내는 중…', 'Đang gửi…', 'Sending…') : t('BT 보내기', 'Gửi BT', 'Send BT')}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
