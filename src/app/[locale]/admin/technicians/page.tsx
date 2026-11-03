'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { localizedName } from '@/lib/format';
import type { DbUser, ServiceCategory, TechnicianProfile, TechnicianStatus } from '@/types/supabase';

const STATUS_STYLE: Record<TechnicianStatus, { color: string; bg: string; ko: string; vi: string; en: string }> = {
  pending:   { color: '#FFA000', bg: '#FFF8E1', ko: '승인 대기', vi: 'Chờ duyệt',   en: 'Pending' },
  active:    { color: '#388E3C', bg: '#E8F5E9', ko: '활성',      vi: 'Hoạt động',   en: 'Active' },
  suspended: { color: '#D32F2F', bg: '#FFEBEE', ko: '정지',      vi: 'Tạm ngưng',   en: 'Suspended' },
  rejected:  { color: '#6D4C41', bg: '#EFEBE9', ko: '반려',      vi: 'Từ chối',     en: 'Rejected' },
};

export default function AdminTechniciansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();

  const [profiles, setProfiles] = useState<TechnicianProfile[]>([]);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  // 토큰이 붙기 전(비로그인) 요청의 응답이 나중에 도착해 결과를 덮어쓰지 않도록 최신 요청만 반영한다
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    const [profs, us, cats] = await Promise.all([
      supabase.from('technician_profiles').select('*').order('status'),
      supabase.from('users').select('*').in('role', ['technician', 'admin']),
      supabase.from('service_categories').select('*'),
    ]);

    if (mine !== seq.current) return;

    const firstError = profs.error ?? us.error ?? cats.error;
    if (firstError) setError(firstError.message);
    else setError(null);

    setProfiles((profs.data ?? []) as TechnicianProfile[]);
    setUsers((us.data ?? []) as DbUser[]);
    setCategories((cats.data ?? []) as ServiceCategory[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (uid: string, status: TechnicianStatus, rejectReason?: string) => {
    if (acting) return;
    setActing(uid);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('technician_profiles')
        .update(rejectReason === undefined ? { status } : { status, reject_reason: rejectReason })
        .eq('uid', uid);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  // documents 버킷은 비공개 — 열람 시 서명 URL 을 발급한다 (1시간)
  const openDocument = async (path: string) => {
    if (docUrls[path]) {
      window.open(docUrls[path], '_blank', 'noopener');
      return;
    }
    const { data, error: err } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
    if (err || !data?.signedUrl) {
      setError(err?.message ?? t('서류 링크 발급 실패', 'Không tạo được liên kết', 'Could not create document link'));
      return;
    }
    setDocUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const reject = (uid: string) => {
    const reason = window.prompt(
      t('반려 사유를 입력해 주세요 (신청자에게 표시됩니다)', 'Nhập lý do từ chối (hiển thị cho người nộp đơn)', 'Enter the rejection reason (shown to the applicant)')
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError(t('반려 사유를 입력해야 합니다', 'Cần nhập lý do từ chối', 'A reason is required'));
      return;
    }
    void setStatus(uid, 'rejected', reason.trim());
  };

  const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.name || uid.slice(0, 10);
  const phoneOf = (uid: string) => users.find((u) => u.uid === uid)?.phone || '';
  const skillLabel = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('기술자 관리', 'Quản lý kỹ thuật viên', 'Technicians')} ({profiles.length})
      </h1>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {profiles.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('등록된 기술자가 없습니다.', 'Chưa có kỹ thuật viên.', 'No technicians yet.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((p) => {
            const s = STATUS_STYLE[p.status];
            const docs = Object.entries(p.documents ?? {});
            const complete = Boolean(p.documents?.photo && p.documents?.id_card && p.submitted_at);

            return (
              <article key={p.uid} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{nameOf(p.uid)}</p>
                    <p className="text-[11px] font-mono break-all" style={{ color: 'var(--color-text-muted)' }}>{p.uid}</p>
                    {phoneOf(p.uid) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>📞 {phoneOf(p.uid)}</p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      ⭐ {p.rating.toFixed(1)} ({p.rating_count})
                    </p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
                    {t(s.ko, s.vi, s.en)}
                  </span>
                </div>

                {(p.experience_years !== null || p.career || p.bio) && (
                  <dl className="mt-3 space-y-1.5 text-xs" style={{ color: 'var(--color-text)' }}>
                    {p.experience_years !== null && (
                      <div>
                        <dt className="inline font-bold">{t('경력', 'Kinh nghiệm', 'Experience')}: </dt>
                        <dd className="inline">{p.experience_years}{t('년', ' năm', ' yrs')}</dd>
                      </div>
                    )}
                    {p.career && (
                      <div>
                        <dt className="font-bold">{t('경력 내용', 'Chi tiết kinh nghiệm', 'Career')}</dt>
                        <dd className="whitespace-pre-wrap" style={{ color: 'var(--color-text-muted)' }}>{p.career}</dd>
                      </div>
                    )}
                    {p.bio && (
                      <div>
                        <dt className="font-bold">{t('자기소개', 'Giới thiệu', 'Bio')}</dt>
                        <dd className="whitespace-pre-wrap" style={{ color: 'var(--color-text-muted)' }}>{p.bio}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {p.status === 'rejected' && p.reject_reason && (
                  <p className="mt-2 text-xs font-semibold" style={{ color: '#6D4C41' }}>
                    {t('반려 사유', 'Lý do từ chối', 'Reason')}: {p.reject_reason}
                  </p>
                )}

                {p.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.skills.map((id) => (
                      <span key={id} className="rounded-lg px-2 py-1 text-[11px]" style={{ background: 'var(--color-bg, #f7f7f8)', color: 'var(--color-text-2, #5c5c6e)' }}>
                        {skillLabel(id)}
                      </span>
                    ))}
                  </div>
                )}

                {docs.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {docs.map(([kind, path]) => (
                      <button
                        key={kind}
                        onClick={() => void openDocument(path)}
                        className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-primary)' }}
                      >
                        📄 {kind}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px]" style={{ color: '#D32F2F' }}>
                    {t('등록된 서류가 없습니다', 'Chưa có giấy tờ', 'No documents uploaded')}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  {p.status !== 'active' && (
                    <button
                      onClick={() => void setStatus(p.uid, 'active')}
                      disabled={acting !== null || !complete}
                      title={complete ? undefined : t('사진·신분증이 있어야 승인할 수 있습니다', 'Cần ảnh và giấy tờ tùy thân', 'Photo and ID card are required')}
                      className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: '#388E3C' }}
                    >
                      {t('승인', 'Phê duyệt', 'Approve')}
                    </button>
                  )}
                  {p.status === 'pending' && (
                    <button
                      onClick={() => reject(p.uid)}
                      disabled={acting !== null}
                      className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                      style={{ borderColor: '#6D4C41', color: '#6D4C41' }}
                    >
                      {t('반려', 'Từ chối', 'Reject')}
                    </button>
                  )}
                  {p.status !== 'suspended' && p.status !== 'rejected' && (
                    <button
                      onClick={() => void setStatus(p.uid, 'suspended')}
                      disabled={acting !== null}
                      className="flex-1 rounded-xl border py-2.5 text-sm font-bold disabled:opacity-50"
                      style={{ borderColor: '#D32F2F', color: '#D32F2F' }}
                    >
                      {t('정지', 'Tạm ngưng', 'Suspend')}
                    </button>
                  )}
                  {p.status !== 'pending' && p.status !== 'rejected' && (
                    <button
                      onClick={() => void setStatus(p.uid, 'pending')}
                      disabled={acting !== null}
                      className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                      style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
                    >
                      {t('대기로', 'Chờ duyệt', 'Pending')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
