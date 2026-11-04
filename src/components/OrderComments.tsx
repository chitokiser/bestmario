'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatDateTime } from '@/lib/format';

interface Comment {
  id: string;
  author_role: 'customer' | 'technician';
  display_name: string;
  content: string;
  image_path: string | null;
  created_at: string;
  mine: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
const POLL_MS = 15000;

/**
 * 기술자 배정 전 문의 스레드. 견적서를 쓰기엔 자료가 부족할 때 기술자가 고객에게 묻고,
 * 고객이 글·사진(도면, 현장 사진)으로 답한다. 배정된 뒤에는 채팅으로 넘어간다.
 */
export default function OrderComments({
  orderId,
  locale,
  role,
}: {
  orderId: string;
  locale: string;
  role: 'customer' | 'technician';
}) {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const t = (ko: string, vi: string, en: string) => (locale === 'vi' ? vi : locale === 'en' ? en : ko);

  const [items, setItems] = useState<Comment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const { data, error: err } = await supabase.rpc('list_order_comments', { p_order_id: orderId });
    if (my !== seq.current) return; // 더 늦게 시작한 요청의 결과를 덮어쓰지 않는다
    if (err) {
      setError(err.message);
      setLoaded(true);
      return;
    }
    const rows = (data ?? []) as Comment[];
    setItems(rows);
    setLoaded(true);

    // 비공개 버킷이라 사진은 잠깐 유효한 주소를 받아서 보여 준다
    const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('comment-files').createSignedUrls(paths, 3600);
      if (my !== seq.current) return;
      const next: Record<string, string> = {};
      for (const s of signed ?? []) if (s.path && s.signedUrl) next[s.path] = s.signedUrl;
      setUrls((prev) => ({ ...prev, ...next }));
    }
  }, [supabase, orderId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError(t('사진(이미지) 파일만 올릴 수 있어요.', 'Chỉ có thể tải lên ảnh.', 'Only image files can be uploaded.'));
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(t('사진은 5MB 이하만 올릴 수 있어요.', 'Ảnh tối đa 5MB.', 'Images must be 5 MB or smaller.'));
      return;
    }
    setFile(f);
  };

  const send = async () => {
    if (busy || !user || (!text.trim() && !file)) return;
    setBusy(true);
    setError(null);
    try {
      let path: string | null = null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
        path = `${user.uid}/${orderId.slice(0, 8)}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('comment-files').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
      }
      const { error: err } = await supabase.rpc('post_order_comment', {
        p_order_id: orderId,
        p_content: text.trim(),
        p_image: path,
      });
      if (err) throw new Error(err.message);
      setText('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // 기술자가 자주 묻는 질문 — 누르면 입력칸에 들어간다
  const chips = [
    t('시공할 면적은 몇 ㎡인가요?', 'Diện tích thi công là bao nhiêu m²?', 'What is the area (m²)?'),
    t('구체적으로 어떤 공사를 원하시나요?', 'Cụ thể bạn muốn thi công hạng mục nào?', 'What exactly do you need done?'),
    t('배선 설계도(도면)는 있으신가요?', 'Bạn có bản vẽ thiết kế đi dây không?', 'Do you have a wiring plan/drawing?'),
    t('현장 사진을 올려 주실 수 있나요?', 'Bạn có thể gửi ảnh hiện trạng không?', 'Can you upload site photos?'),
  ];

  const field = {
    background: 'var(--color-bg, #f7f7f8)',
    borderColor: 'var(--color-border, #ebebed)',
    color: 'var(--color-text)',
  } as const;

  return (
    <section className="space-y-3 rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
      <div>
        <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
          💬 {t('견적 전 문의', 'Hỏi đáp trước khi báo giá', 'Questions before quoting')}
        </h2>
        <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {role === 'technician'
            ? t(
                '견적에 필요한 자료가 부족하면 고객에게 물어보세요. 같은 요청을 본 다른 기술자에게도 이 대화가 보여요. 연락처는 배정 후에 열립니다.',
                'Nếu thiếu thông tin để báo giá, hãy hỏi khách. Các kỹ thuật viên khác cùng thấy cuộc trao đổi này. Liên hệ chỉ mở sau khi được phân công.',
                'Ask the customer if you need more details to quote. Other technicians on this request can see the thread. Contact details open after assignment.',
              )
            : t(
                '기술자가 견적을 내기 위해 질문할 수 있어요. 글이나 사진(도면·현장)으로 답해 주세요. 내 이름과 연락처는 공개되지 않아요.',
                'Kỹ thuật viên có thể hỏi để báo giá. Hãy trả lời bằng chữ hoặc ảnh (bản vẽ, hiện trạng). Tên và liên hệ của bạn không bị công khai.',
                'Technicians may ask questions to quote. Reply with text or photos (drawings, the site). Your name and contact stay private.',
              )}
        </p>
      </div>

      {!loaded ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl p-3 text-center text-xs" style={{ background: 'var(--color-bg, #f7f7f8)', color: 'var(--color-text-muted)' }}>
          {t('아직 문의가 없어요.', 'Chưa có câu hỏi nào.', 'No questions yet.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => {
            const fromCustomer = c.author_role === 'customer';
            const who = fromCustomer
              ? t('고객', 'Khách hàng', 'Customer')
              : c.display_name || t('기술자', 'Kỹ thuật viên', 'Technician');
            return (
              <li key={c.id} className={`flex flex-col ${c.mine ? 'items-end' : 'items-start'}`}>
                <span className="mb-0.5 text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  {fromCustomer ? '🙋' : '🛠️'} {who} · {formatDateTime(c.created_at, locale)}
                </span>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
                  style={{
                    background: c.mine ? 'var(--color-primary)' : 'var(--color-bg, #f7f7f8)',
                    color: c.mine ? '#fff' : 'var(--color-text)',
                  }}
                >
                  {c.content && <p className="whitespace-pre-wrap break-words">{c.content}</p>}
                  {c.image_path &&
                    (urls[c.image_path] ? (
                      <a href={urls[c.image_path]} target="_blank" rel="noopener noreferrer">
                        <img
                          src={urls[c.image_path]}
                          alt={t('첨부 사진', 'Ảnh đính kèm', 'Attached photo')}
                          loading="lazy"
                          decoding="async"
                          className={`max-h-56 rounded-lg object-cover ${c.content ? 'mt-2' : ''}`}
                        />
                      </a>
                    ) : (
                      <span className="text-xs opacity-70">🖼️ …</span>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setText((prev) => (prev ? `${prev}\n${c}` : c))}
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
          >
            {c}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={
          role === 'technician'
            ? t('고객에게 질문하기', 'Đặt câu hỏi cho khách', 'Ask the customer')
            : t('답변 입력', 'Nhập câu trả lời', 'Write a reply')
        }
        className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={field}
      />

      {preview && (
        <div className="flex items-center gap-2">
          <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = '';
            }}
            className="text-xs font-semibold"
            style={{ color: '#D32F2F' }}
          >
            {t('사진 빼기', 'Bỏ ảnh', 'Remove photo')}
          </button>
        </div>
      )}

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}

      <div className="flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-xl border px-3 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
        >
          📎 {t('사진·도면', 'Ảnh/bản vẽ', 'Photo/drawing')}
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || (!text.trim() && !file)}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? t('보내는 중…', 'Đang gửi…', 'Sending…') : t('보내기', 'Gửi', 'Send')}
        </button>
      </div>
    </section>
  );
}
