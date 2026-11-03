'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { telUrl, zaloUrl } from '@/lib/contact';
import type { Message } from '@/types/supabase';

interface Contact {
  name: string;
  phone: string;
  role: string;
}

const CARD = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;

/**
 * 용역이 성사된(기술자가 배정된) 주문의 연락 수단: 잘로·전화·자체 채팅.
 * 연락처와 채팅 권한은 DB(order_contact, guard_message)가 당사자만 허용한다.
 */
export default function OrderContact({ orderId, locale }: { orderId: string; locale: string }) {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const uid = user?.uid;

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [contact, setContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void supabase.rpc('order_contact', { p_order_id: orderId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setContactError(error.message);
      else setContact(((data ?? [])[0] ?? null) as Contact | null);
    });
    return () => {
      alive = false;
    };
  }, [supabase, uid, orderId]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages((data ?? []) as Message[]);
  }, [supabase, orderId]);

  // 실시간 수신. 구독이 끊겨도 놓치지 않도록 느슨한 주기 조회를 함께 둔다.
  useEffect(() => {
    if (!uid) return;
    void loadMessages();
    const channel = supabase
      .channel(`chat-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, () => {
        void loadMessages();
      })
      .subscribe();
    const timer = window.setInterval(() => void loadMessages(), 20000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, uid, orderId, loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending || !uid) return;
    setSending(true);
    setSendError(null);
    const { error } = await supabase.from('messages').insert({ order_id: orderId, sender_uid: uid, content });
    if (error) setSendError(error.message);
    else {
      setText('');
      await loadMessages();
    }
    setSending(false);
  };

  const zalo = contact?.phone ? zaloUrl(contact.phone) : null;
  const tel = contact?.phone ? telUrl(contact.phone) : null;
  const otherLabel = contact?.role === 'technician' ? t('기술자', 'Kỹ thuật viên', 'Technician') : t('고객', 'Khách hàng', 'Customer');

  const BTN = 'flex-1 rounded-xl py-2.5 text-center text-sm font-bold';

  return (
    <section className="space-y-3 rounded-2xl border p-4" style={CARD} aria-label={t('연락하기', 'Liên hệ', 'Contact')}>
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
        💬 {t('연락하기', 'Liên hệ', 'Contact')}
      </h2>

      {contactError ? (
        <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{contactError}</p>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {otherLabel}{contact?.name ? ` · ${contact.name}` : ''}
          </p>
          <div className="flex gap-2">
            {zalo ? (
              <a href={zalo} target="_blank" rel="noopener noreferrer" className={BTN} style={{ background: '#0068FF', color: '#fff' }}>
                Zalo
              </a>
            ) : null}
            {tel ? (
              <a href={tel} className={BTN} style={{ border: '1px solid var(--color-border, #ebebed)', color: 'var(--color-text)' }}>
                📞 {t('전화', 'Gọi', 'Call')}
              </a>
            ) : null}
          </div>
          {!zalo && (
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {t('상대방이 연락처를 등록하지 않았어요. 아래 채팅을 이용해 주세요.', 'Đối phương chưa có số điện thoại. Hãy dùng chat bên dưới.', 'No phone number on file. Use the chat below.')}
            </p>
          )}
        </>
      )}

      <div
        ref={listRef}
        className="max-h-72 space-y-2 overflow-y-auto rounded-xl p-3"
        style={{ background: 'var(--color-bg, #f7f7f8)' }}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="py-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('아직 대화가 없습니다. 먼저 인사를 건네 보세요.', 'Chưa có tin nhắn. Hãy chào trước.', 'No messages yet. Say hello first.')}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_uid === uid;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
                  style={mine ? { background: 'var(--color-primary)', color: '#fff' } : { background: 'var(--color-surface, #fff)', color: 'var(--color-text)' }}
                >
                  {m.content}
                  <div className="mt-0.5 text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send();
          }}
          maxLength={2000}
          placeholder={t('메시지를 입력하세요', 'Nhập tin nhắn', 'Type a message')}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
        />
        <button
          onClick={() => void send()}
          disabled={sending || text.trim() === ''}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {t('보내기', 'Gửi', 'Send')}
        </button>
      </div>
      {sendError && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{sendError}</p>}
    </section>
  );
}
