// 새 주문 → 해당 분야를 선택한 승인(active) 기술자에게 웹 푸시.
// DB 트리거(notify_new_order)가 호출한다. 공유 비밀 헤더로만 접근을 허용한다.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MSG = {
  fixed: {
    ko: (cat: string) => ({ title: `새 요청 · ${cat}`, body: '고객 요청이 들어왔어요. 먼저 수락하면 배정됩니다.' }),
    vi: (cat: string) => ({ title: `Yêu cầu mới · ${cat}`, body: 'Có yêu cầu mới. Nhận đơn trước để được phân công.' }),
    en: (cat: string) => ({ title: `New request · ${cat}`, body: 'A customer request is in. Accept first to get assigned.' }),
  },
  bid: {
    ko: (cat: string) => ({ title: `견적 요청 · ${cat}`, body: '내 분야 요청이 들어왔어요. 입찰·견적에 참여해 보세요.' }),
    vi: (cat: string) => ({ title: `Yêu cầu báo giá · ${cat}`, body: 'Có yêu cầu thuộc lĩnh vực của bạn. Hãy tham gia báo giá.' }),
    en: (cat: string) => ({ title: `Quote request · ${cat}`, body: 'A request in your field is open. Join the bidding.' }),
  },
} as const;

type Lang = 'ko' | 'vi' | 'en';
const lang = (l: string | null): Lang => (l === 'ko' || l === 'en' ? l : 'vi');

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return new Response('bad request', { status: 400 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: order } = await sb
    .from('service_orders')
    .select('id, category_id, order_type, status, technician_uid')
    .eq('id', order_id)
    .maybeSingle();
  if (!order || order.status !== 'pending' || order.technician_uid) {
    return Response.json({ sent: 0, reason: 'not open' });
  }

  const { data: category } = await sb
    .from('service_categories')
    .select('name_ko, name_vi, name_en')
    .eq('id', order.category_id)
    .maybeSingle();

  // 이 분야를 고른 승인 기술자
  const { data: techs } = await sb
    .from('technician_profiles')
    .select('uid')
    .eq('status', 'active')
    .contains('skills', [order.category_id]);
  const uids = (techs ?? []).map((t) => t.uid as string);
  if (uids.length === 0) return Response.json({ sent: 0, reason: 'no technicians' });

  const [{ data: subs }, { data: users }] = await Promise.all([
    sb.from('push_subscriptions').select('id, uid, endpoint, p256dh, auth').in('uid', uids),
    sb.from('users').select('uid, lang').in('uid', uids),
  ]);
  const langOf = new Map((users ?? []).map((u) => [u.uid as string, lang(u.lang as string)]));

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@bestmario.netlify.app',
    Deno.env.get('VAPID_PUBLIC')!,
    Deno.env.get('VAPID_PRIVATE')!,
  );

  const kind = order.order_type === 'fixed' ? 'fixed' : 'bid';
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    (subs ?? []).map(async (s) => {
      const l = langOf.get(s.uid as string) ?? 'vi';
      const catName = category ? (category[`name_${l}` as 'name_ko'] as string) : '';
      const payload = JSON.stringify({
        ...MSG[kind][l](catName),
        url: `/${l}/technician`,
        tag: `order-${order.id}`,
      });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id as string); // 해지된 구독 정리
      }
    }),
  );

  if (dead.length) await sb.from('push_subscriptions').delete().in('id', dead);
  return Response.json({ sent, cleaned: dead.length });
});
