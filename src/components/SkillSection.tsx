'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { localizedName } from '@/lib/format';
import type { ServiceCategory, SkillRequest } from '@/types/supabase';

const CARD = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;
const FIELD = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;

const REQ_STYLE = {
  pending:  { color: '#E65100', bg: '#FFF3E0', ko: '승인 대기', vi: 'Chờ duyệt', en: 'Pending' },
  approved: { color: '#2E7D32', bg: '#E8F5E9', ko: '승인',      vi: 'Đã duyệt',  en: 'Approved' },
  rejected: { color: '#C62828', bg: '#FFEBEE', ko: '반려',      vi: 'Từ chối',   en: 'Rejected' },
} as const;

/**
 * 내 기술 분야(승인된 것)와 분야 추가 신청. 분야는 직접 바꿀 수 없고 관리자 승인 후 추가된다.
 * 승인 여부는 DB(request_skill / decide_skill_request)가 판단한다.
 */
export default function SkillSection({
  uid,
  locale,
  categories,
  skills,
  canRequest,
}: {
  uid: string;
  locale: string;
  categories: ServiceCategory[];
  skills: string[];
  canRequest: boolean;
}) {
  const supabase = useSupabase();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [requests, setRequests] = useState<SkillRequest[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const catOf = (id: string) => categories.find((c) => c.id === id);
  const label = (id: string) => {
    const c = catOf(id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('skill_requests')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (data ?? []) as SkillRequest[];
    setRequests(rows);
    return rows;
  }, [supabase, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingIds = requests.filter((r) => r.status === 'pending').map((r) => r.category_id);
  const addable = categories.filter((c) => !skills.includes(c.id) && !pendingIds.includes(c.id));

  const submit = async () => {
    if (!categoryId || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc('request_skill', { p_category: categoryId, p_note: note.trim() });
    if (err) {
      setError(err.message);
    } else {
      setMessage(t('신청했습니다. 관리자가 확인하면 분야가 추가됩니다.', 'Đã gửi. Lĩnh vực sẽ được thêm sau khi quản trị duyệt.', 'Requested. The skill is added once an admin approves.'));
      setCategoryId('');
      setNote('');
      await load();
    }
    setBusy(false);
  };

  return (
    <section className="space-y-4 rounded-2xl border p-4" style={CARD}>
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {t('내 기술 분야', 'Lĩnh vực của tôi', 'My skills')} ({skills.length})
        </h2>
        {skills.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('등록된 분야가 없습니다.', 'Chưa có lĩnh vực.', 'No skills yet.')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {skills.map((id) => (
              <span
                key={id}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'var(--color-primary-bg, #FFEBEE)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                ✓ {label(id)}
              </span>
            ))}
          </div>
        )}
      </div>

      {canRequest ? (
        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
            {t('분야 추가 신청', 'Đăng ký thêm lĩnh vực', 'Request another skill')}
          </h3>
          {addable.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('추가로 신청할 수 있는 분야가 없습니다.', 'Không còn lĩnh vực nào để đăng ký.', 'No more skills to request.')}
            </p>
          ) : (
            <>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              >
                <option value="">{t('-- 분야 선택 --', '-- Chọn lĩnh vực --', '-- Select skill --')}</option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {localizedName(c, locale)}</option>
                ))}
              </select>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={t('이 분야 경력·자격을 적어 주세요 (승인 심사에 참고됩니다)', 'Nêu kinh nghiệm, chứng chỉ trong lĩnh vực này (để xét duyệt)', 'Describe your experience or certificates in this field (used for review)')}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              />
              <button
                onClick={submit}
                disabled={!categoryId || busy}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {busy ? t('신청 중…', 'Đang gửi…', 'Sending…') : t('신청하기', 'Gửi đăng ký', 'Request')}
              </button>
            </>
          )}
          {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}
          {message && <p className="text-xs font-semibold" style={{ color: '#2E7D32' }}>{message}</p>}
        </div>
      ) : (
        <p className="border-t pt-3 text-[11px]" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}>
          {t('기술자 승인이 끝나면 분야를 추가로 신청할 수 있습니다.', 'Sau khi được duyệt bạn có thể đăng ký thêm lĩnh vực.', 'You can request more skills once your technician account is approved.')}
        </p>
      )}

      {requests.length > 0 && (
        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <h3 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
            {t('신청 내역', 'Lịch sử đăng ký', 'Request history')}
          </h3>
          <ul className="space-y-2">
            {requests.map((r) => {
              const s = REQ_STYLE[r.status];
              return (
                <li key={r.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{label(r.category_id)}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: s.color, background: s.bg }}>
                      {t(s.ko, s.vi, s.en)}
                    </span>
                  </div>
                  {r.status === 'rejected' && r.reject_reason && (
                    <p className="mt-1 text-[11px]" style={{ color: s.color }}>
                      {t('사유', 'Lý do', 'Reason')}: {r.reject_reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
