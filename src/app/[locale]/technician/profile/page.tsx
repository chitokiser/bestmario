'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import SkillSection from '@/components/SkillSection';
import type { ServiceCategory, TechnicianProfile } from '@/types/supabase';

const DOC_KINDS = [
  { key: 'id_card',           ko: '신분증',         vi: 'CMND/CCCD',            en: 'ID card' },
  { key: 'business_license',  ko: '사업자등록증',   vi: 'Giấy phép kinh doanh', en: 'Business licence' },
  { key: 'certificate',       ko: '기술 자격증',    vi: 'Chứng chỉ nghề',       en: 'Trade certificate' },
];

const STATUS_LABEL = {
  pending:   { ko: '승인 대기', vi: 'Chờ phê duyệt', en: 'Pending' },
  active:    { ko: '승인 완료', vi: 'Đã phê duyệt',  en: 'Active' },
  suspended: { ko: '정지',      vi: 'Tạm ngưng',     en: 'Suspended' },
  rejected:  { ko: '반려',      vi: 'Từ chối',       en: 'Rejected' },
} as const;

export default function TechnicianProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();
  const { user } = useAuthState();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const [cats, prof, me] = await Promise.all([
      supabase.from('service_categories').select('*').order('id'),
      supabase.from('technician_profiles').select('*').eq('uid', user.uid).maybeSingle(),
      supabase.from('users').select('name, phone').eq('uid', user.uid).maybeSingle(),
    ]);

    setCategories((cats.data ?? []) as ServiceCategory[]);

    const p = (prof.data ?? null) as TechnicianProfile | null;
    setProfile(p);
    setSkills(p?.skills ?? []);
    setName((me.data?.name as string) ?? '');
    setPhone((me.data?.phone as string) ?? '');
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (saving || !user) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // upsert 를 쓰면 안 된다: Postgres 는 충돌 해결 전에 INSERT 정책의
      // WITH CHECK(status='pending') 를 제안 행에 적용하므로, 이미 승인된
      // (status='active') 기술자의 저장이 RLS 오류로 거부된다.
      // status 는 관리자만 바꿀 수 있으니 클라이언트가 보내지도 않는다.
      // 분야(skills)는 직접 바꿀 수 없다 — 분야 추가 신청과 관리자 승인으로만 늘어난다
      if (!profile) {
        const { error: profErr } = await supabase
          .from('technician_profiles')
          .insert({ uid: user.uid, status: 'pending', skills: [] });
        if (profErr) throw new Error(profErr.message);
      }

      const { error: userErr } = await supabase
        .from('users')
        .update({ name: name.trim(), phone: phone.trim() })
        .eq('uid', user.uid);
      if (userErr) throw new Error(userErr.message);

      setMessage(t('저장했습니다.', 'Đã lưu.', 'Saved.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // documents 버킷은 비공개다. 경로 첫 세그먼트가 본인 uid 여야 정책을 통과한다.
  const handleUpload = async (kind: string, file: File | undefined) => {
    if (!file || !user || uploadingKind) return;

    setUploadingKind(kind);
    setError(null);
    setMessage(null);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.uid}/${kind}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const documents = { ...(profile?.documents ?? {}), [kind]: path };

      const { error: profErr } = profile
        ? await supabase.from('technician_profiles').update({ documents }).eq('uid', user.uid)
        : await supabase
            .from('technician_profiles')
            .insert({ uid: user.uid, status: 'pending', skills: [], documents });
      if (profErr) throw new Error(profErr.message);

      setMessage(t('서류를 등록했습니다.', 'Đã tải giấy tờ.', 'Document uploaded.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingKind(null);
      const input = fileInputs.current[kind];
      if (input) input.value = '';
    }
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  const status = profile?.status ?? 'pending';

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
          {t('기술자 프로필', 'Hồ sơ kỹ thuật viên', 'Technician profile')}
        </h1>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={
            status === 'active'
              ? { color: '#388E3C', background: '#E8F5E9' }
              : status === 'suspended'
                ? { color: '#D32F2F', background: '#FFEBEE' }
                : status === 'rejected'
                  ? { color: '#6D4C41', background: '#EFEBE9' }
                : { color: '#FFA000', background: '#FFF8E1' }
          }
        >
          {t(STATUS_LABEL[status].ko, STATUS_LABEL[status].vi, STATUS_LABEL[status].en)}
        </span>
      </div>

      {profile && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          ⭐ {profile.rating.toFixed(1)} ({profile.rating_count})
        </p>
      )}

      {/* 기본 정보 */}
      <section className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {t('이름', 'Họ tên', 'Name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {t('연락처', 'Số điện thoại', 'Phone')}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={locale === 'ko' ? '010-0000-0000' : '0123 456 789'}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
          />
        </div>
      </section>

      {/* 기술 분야: 승인된 분야 + 추가 신청 */}
      {user && (
        <SkillSection
          uid={user.uid}
          locale={locale}
          categories={categories}
          skills={skills}
          canRequest={status === 'active'}
        />
      )}

      {/* 서류 */}
      <section className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {t('서류 등록', 'Giấy tờ', 'Documents')}
        </h2>
        {DOC_KINDS.map((d) => {
          const uploaded = profile?.documents?.[d.key];
          return (
            <div key={d.key}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t(d.ko, d.vi, d.en)}
                </span>
                {uploaded && (
                  <span className="text-[11px] font-bold" style={{ color: '#388E3C' }}>
                    ✓ {t('등록됨', 'Đã tải', 'Uploaded')}
                  </span>
                )}
              </div>
              <input
                ref={(el) => { fileInputs.current[d.key] = el; }}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => void handleUpload(d.key, e.target.files?.[0])}
                disabled={uploadingKind !== null}
                className="w-full text-xs"
              />
              {uploadingKind === d.key && (
                <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {t('업로드 중…', 'Đang tải lên…', 'Uploading…')}
                </p>
              )}
            </div>
          );
        })}
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '등록한 서류는 관리자만 열람할 수 있습니다.',
            'Chỉ quản trị viên có thể xem giấy tờ đã tải.',
            'Uploaded documents are visible to admins only.'
          )}
        </p>
      </section>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      {message && <p className="text-xs font-semibold" style={{ color: '#388E3C' }}>{message}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {saving ? t('저장 중…', 'Đang lưu…', 'Saving…') : t('저장', 'Lưu', 'Save')}
      </button>
    </div>
  );
}
