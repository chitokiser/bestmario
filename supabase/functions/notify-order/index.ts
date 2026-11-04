// 주문 이벤트 → 웹 푸시.
//   (kind 없음) 새 주문      → 그 분야를 고른 승인(active) 기술자
//   assigned    기술자 수락  → 주문한 고객
//   quote       새 견적 도착 → 주문한 고객
//   message     새 채팅      → 보낸 사람의 상대방
//   direct      상품 주문    → 상품을 올린 기술자
//   payment     입금 확인    → 고객(입금 확인됨)·배정된 기술자(작업 진행 가능)
//   comment     배정 전 문의 → 기술자가 쓰면 고객, 고객이 쓰면 앞서 질문한 기술자들
// DB 트리거가 호출한다. 공유 비밀 헤더로만 접근을 허용한다.
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
  // 고객이 가격을 제시한 주문: 금액을 보여 주고 먼저 수락하면 그 가격으로 배정된다
  offer: {
    ko: (cat: string, price: string) => ({ title: `제시가 요청 · ${cat}`, body: `고객 제시가 ${price}. 먼저 수락하면 배정됩니다.` }),
    vi: (cat: string, price: string) => ({ title: `Khách đề xuất giá · ${cat}`, body: `Giá đề xuất ${price}. Nhận đơn trước để được phân công.` }),
    en: (cat: string, price: string) => ({ title: `Price offer · ${cat}`, body: `Customer offers ${price}. Accept first to get assigned.` }),
  },
} as const;

// 고객에게 가는 알림
const CUSTOMER = {
  assigned: {
    ko: (cat: string) => ({ title: `기술자 배정 완료 · ${cat}`, body: '기술자가 요청을 수락했어요. 주문 상세에서 확인해 보세요.' }),
    vi: (cat: string) => ({ title: `Đã có kỹ thuật viên · ${cat}`, body: 'Kỹ thuật viên đã nhận đơn của bạn. Xem chi tiết đơn hàng.' }),
    en: (cat: string) => ({ title: `Technician assigned · ${cat}`, body: 'A technician accepted your request. Check the order details.' }),
  },
  quote: {
    ko: (cat: string, price: string) => ({ title: `새 견적 도착 · ${cat}`, body: `견적 ${price}이(가) 도착했어요. 비교하고 선택해 보세요.` }),
    vi: (cat: string, price: string) => ({ title: `Có báo giá mới · ${cat}`, body: `Báo giá ${price}. Hãy so sánh và chọn.` }),
    en: (cat: string, price: string) => ({ title: `New quote · ${cat}`, body: `A quote of ${price} arrived. Compare and choose.` }),
  },
} as const;

type Lang = 'ko' | 'vi' | 'en';
const lang = (l: string | null): Lang => (l === 'ko' || l === 'en' ? l : 'vi');
const won = (n: number | null | undefined) => (n ? `${Number(n).toLocaleString('vi-VN')}₫` : '');

type Built = { title: string; body: string; url: string };

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  const { order_id, kind: eventKind, quotation_id, message_id, comment_id, payment_id } = await req.json().catch(() => ({}));
  if (!order_id) return new Response('bad request', { status: 400 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: order } = await sb
    .from('service_orders')
    .select('id, category_id, order_type, status, customer_uid, technician_uid, offered_price, product_name, quantity, unit_price, unit_label')
    .eq('id', order_id)
    .maybeSingle();
  if (!order) return Response.json({ sent: 0, reason: 'no order' });

  const { data: category } = await sb
    .from('service_categories')
    .select('name_ko, name_vi, name_en')
    .eq('id', order.category_id)
    .maybeSingle();

  // 받는 사람(uid)과 알림 내용을 이벤트별로 정한다
  let uids: string[] = [];
  let build: (l: Lang, cat: string, uid: string) => Built;

  if (eventKind === 'assigned') {
    uids = [order.customer_uid as string];
    build = (l, cat) => ({ ...CUSTOMER.assigned[l](cat), url: `/${l}/orders/${order.id}` });
  } else if (eventKind === 'quote') {
    const { data: quote } = await sb.from('quotations').select('price').eq('id', quotation_id).maybeSingle();
    uids = [order.customer_uid as string];
    const price = won(quote?.price as number | undefined);
    build = (l, cat) => ({ ...CUSTOMER.quote[l](cat, price), url: `/${l}/orders/${order.id}` });
  } else if (eventKind === 'direct') {
    // 기술자가 올린 상품에 주문이 들어옴 → 그 기술자에게
    if (!order.technician_uid) return Response.json({ sent: 0, reason: 'no recipient' });
    uids = [order.technician_uid as string];
    const total = won(Number(order.quantity) * Number(order.unit_price));
    const amount = `${order.quantity}${order.unit_label ?? ''} · ${total}`;
    const name = (order.product_name as string) ?? '';
    build = (l) => ({
      title: l === 'ko' ? `상품 주문 · ${name}` : l === 'en' ? `Product order · ${name}` : `Đơn hàng sản phẩm · ${name}`,
      body: l === 'ko' ? `${amount} 주문이 들어왔어요. 확인해 보세요.` : l === 'en' ? `New order ${amount}. Check it out.` : `Có đơn mới ${amount}. Hãy xem chi tiết.`,
      url: `/${l}/technician/order/${order.id}`,
    });
  } else if (eventKind === 'payment') {
    // 관리자가 입금을 확인함 → 고객에게는 확인 안내, 배정된 기술자에게는 작업 진행 안내
    const { data: pay } = await sb.from('payments').select('amount').eq('id', payment_id).maybeSingle();
    const amount = won(pay?.amount as number | undefined);
    uids = [order.customer_uid as string, ...(order.technician_uid ? [order.technician_uid as string] : [])];
    build = (l, cat, uid) => {
      const toCustomer = uid === order.customer_uid;
      if (toCustomer) {
        return {
          title: l === 'ko' ? `입금 확인 완료 · ${cat}` : l === 'en' ? `Deposit confirmed · ${cat}` : `Đã xác nhận thanh toán · ${cat}`,
          body: l === 'ko' ? `${amount} 입금이 베스트마리오 플랫폼 관리계좌에서 확인됐어요. 완료 승인 시 수수료를 제외하고 기술자에게 정산됩니다.`
            : l === 'en' ? `${amount} confirmed in the BestMario platform account. The technician is paid minus the fee once you approve completion.`
            : `${amount} đã được xác nhận trong tài khoản quản lý của BestMario. Sau khi bạn xác nhận hoàn thành, kỹ thuật viên được quyết toán sau khi trừ phí.`,
          url: `/${l}/orders/${order.id}`,
        };
      }
      return {
        title: l === 'ko' ? `고객 입금 확인 · ${cat}` : l === 'en' ? `Customer deposit confirmed · ${cat}` : `Đã xác nhận khách thanh toán · ${cat}`,
        body: l === 'ko' ? `${amount}이(가) 플랫폼 관리계좌에 입금됐어요. 안심하고 작업을 진행하세요. 완료되면 수수료를 제외하고 정산됩니다.`
          : l === 'en' ? `${amount} is in the platform account. Go ahead with the work; it is settled minus the fee on completion.`
          : `${amount} đã vào tài khoản quản lý. Hãy yên tâm thi công; khi hoàn thành sẽ quyết toán sau khi trừ phí.`,
        url: `/${l}/technician/order/${order.id}`,
      };
    };
  } else if (eventKind === 'comment') {
    // 배정 전 문의 댓글: 기술자가 쓰면 고객에게, 고객이 쓰면 앞서 질문한 기술자들에게
    const { data: cm } = await sb
      .from('order_comments')
      .select('author_uid, content, image_path')
      .eq('id', comment_id)
      .maybeSingle();
    if (!cm) return Response.json({ sent: 0, reason: 'no comment' });
    const fromCustomer = cm.author_uid === order.customer_uid;
    if (fromCustomer) {
      const { data: prev } = await sb.from('order_comments').select('author_uid').eq('order_id', order.id);
      uids = [...new Set((prev ?? []).map((r) => r.author_uid as string))].filter((u) => u !== order.customer_uid);
    } else {
      uids = [order.customer_uid as string];
    }
    if (uids.length === 0) return Response.json({ sent: 0, reason: 'no recipients' });
    const preview = String(cm.content || '').slice(0, 80) || (cm.image_path ? '📷' : '');
    build = (l, cat) => ({
      title:
        l === 'ko' ? `${fromCustomer ? '고객 답변' : '기술자 문의'} · ${cat}`
        : l === 'en' ? `${fromCustomer ? 'Customer reply' : 'Technician question'} · ${cat}`
        : `${fromCustomer ? 'Khách trả lời' : 'Kỹ thuật viên hỏi'} · ${cat}`,
      body: preview,
      url: fromCustomer ? `/${l}/technician/quotes` : `/${l}/orders/${order.id}`,
    });
  } else if (eventKind === 'message') {
    // 새 채팅 메시지 → 보낸 사람의 상대방
    const { data: msg } = await sb
      .from('messages')
      .select('sender_uid, content')
      .eq('id', message_id)
      .maybeSingle();
    if (!msg) return Response.json({ sent: 0, reason: 'no message' });
    const toCustomer = msg.sender_uid !== order.customer_uid;
    const recipient = toCustomer ? (order.customer_uid as string) : (order.technician_uid as string | null);
    if (!recipient) return Response.json({ sent: 0, reason: 'no recipient' });
    uids = [recipient];
    const { data: sender } = await sb.from('users').select('name').eq('uid', msg.sender_uid).maybeSingle();
    const preview = String(msg.content).slice(0, 80);
    build = (l, cat) => ({
      title: `${(sender?.name as string) || cat} 💬`,
      body: preview,
      url: toCustomer ? `/${l}/orders/${order.id}` : `/${l}/technician/order/${order.id}`,
    });
  } else {
    // 새 주문 → 이 분야를 고른 승인 기술자
    if (order.status !== 'pending' || order.technician_uid) {
      return Response.json({ sent: 0, reason: 'not open' });
    }
    const { data: techs } = await sb
      .from('technician_profiles')
      .select('uid')
      .eq('status', 'active')
      .contains('skills', [order.category_id]);
    uids = (techs ?? []).map((t) => t.uid as string);
    const kind = order.order_type === 'fixed' ? 'fixed' : order.order_type === 'customer_bid' ? 'offer' : 'bid';
    const price = won(order.offered_price as number | null);
    build = (l, cat) => ({
      ...(kind === 'offer' ? MSG.offer[l](cat, price) : MSG[kind][l](cat)),
      url: `/${l}/technician`,
    });
  }
  if (uids.length === 0) return Response.json({ sent: 0, reason: 'no recipients' });

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

  let sent = 0;
  const dead: string[] = [];
  // 같은 주문의 같은 이벤트끼리만 교체되도록 tag 에 이벤트 종류를 넣는다
  const tag = `${eventKind ?? 'new'}-${order.id}${quotation_id ? `-${quotation_id}` : ''}${message_id ? `-${message_id}` : ''}${comment_id ? `-${comment_id}` : ''}${payment_id ? `-${payment_id}` : ''}`;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      const l = langOf.get(s.uid as string) ?? 'vi';
      const catName = category ? (category[`name_${l}` as 'name_ko'] as string) : '';
      const payload = JSON.stringify({ ...build(l, catName, s.uid as string), tag });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'high' }, // 절전 중인 기기도 바로 깨워서 전달
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
