'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { localizedName } from '@/lib/format';
import type { DbUser, ServiceCategory, TechnicianProfile, TechnicianStatus } from '@/types/supabase';

const STATUS_STYLE: Record<TechnicianStatus, { color: string; bg: string; ko: string; vi: string; en: string }> = {
  pending:   { color: '#FFA000', bg: '#FFF8E1', ko: '승인 대기', vi: 'Chờ duyệt',   en: 'Pending' },
  active:    { color: '#388E3C', bg: '#E8F5E9', ko: '활성',      vi: 'Hoạt động',   en: 'Active' },
  suspended: { color: '#D32F2F', bg: '#FFEBEE', ko: '정지',      vi: 'Tạm ngưng',   en: 'Suspended' },
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

  const load = useCallback(async () => {
    setLoading(true);
    const [profs, us, cats] = await Promise.all([
      supabase.from('technician_profiles').select('*').order('status'),
      supabase.from('users').select('*').in('role', ['technician', 'admin']),
      supabase.from('service_categories').select('*'),
    ]);

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

  const setStatus = async (uid: string, status: TechnicianStatus) => {
    if (acting) return;
    setActing(uid);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('technician_profiles')
        .update({ status })
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
                      disabled={acting !== null}
                      className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: '#388E3C' }}
                    >
                      {t('승인', 'Phê duyệt', 'Approve')}
                    </button>
                  )}
                  {p.status !== 'suspended' && (
                    <button
                      onClick={() => void setStatus(p.uid, 'suspended')}
                      disabled={acting !== null}
                      className="flex-1 rounded-xl border py-2.5 text-sm font-bold disabled:opacity-50"
                      style={{ borderColor: '#D32F2F', color: '#D32F2F' }}
                    >
                      {t('정지', 'Tạm ngưng', 'Suspend')}
                    </button>
                  )}
                  {p.status !== 'pending' && (
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
