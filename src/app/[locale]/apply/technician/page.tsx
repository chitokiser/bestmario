'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { localizedName } from '@/lib/format';
import type { ServiceCategory, TechnicianProfile } from '@/types/supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const CARD = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;
const INPUT = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;
const LABEL = 'block text-xs font-semibold uppercase tracking-wide mb-1.5';

type DocKey = 'photo' | 'id_card' | 'business_license';

export default function ApplyTechnicianPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, role, roleLoading, authLoading } = useAuthState();

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [existing, setExisting] = useState<TechnicianProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [years, setYears] = useState('');
  const [career, setCareer] = useState('');
  const [bio, setBio] = useState('');
  const [files, setFiles] = useState<Partial<Record<DocKey, File>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const [cats, prof, me] = await Promise.all([
      supabase.from('service_categories').select('*').order('id'),
      supabase.from('technician_profiles').select('*').eq('uid', user.uid).maybeSingle(),
      supabase.from('users').select('phone').eq('uid', user.uid).maybeSingle(),
    ]);
    setCategories((cats.data ?? []) as ServiceCategory[]);
    const p = (prof.data ?? null) as TechnicianProfile | null;
    setExisting(p);
    setPhone((me.data?.phone as string) ?? '');
    // 반려된 신청서는 이전 내용을 채워 두고 고쳐서 다시 낸다 (파일은 새로 올려야 한다)
    if (p) {
      setSkills(p.skills ?? []);
      setYears(p.experience_years === null ? '' : String(p.experience_years));
      setCareer(p.career ?? '');
      setBio(p.bio ?? '');
    }
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSkill = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const pickFile = (key: DocKey, file: File | undefined) => {
    setError(null);
    if (!file) {
      setFiles((prev) => ({ ...prev, [key]: undefined }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError(t('이미지 파일만 올릴 수 있습니다.', 'Chỉ được tải ảnh.', 'Only image files are allowed.'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('파일은 5MB 이하여야 합니다.', 'Tệp phải nhỏ hơn 5MB.', 'File must be 5MB or smaller.'));
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async () => {
    if (submitting || !user) return;
    setError(null);

    const n = Number(years);
    if (!phone.trim()) return setError(t('연락처를 입력해 주세요.', 'Hãy nhập số điện thoại.', 'Enter your phone number.'));
    if (skills.length === 0) return setError(t('기술분야를 1개 이상 선택해 주세요.', 'Chọn ít nhất 1 lĩnh vực.', 'Select at least one skill.'));
    if (years === '' || !Number.isInteger(n) || n < 0 || n > 60)
      return setError(t('경력 연수는 0~60 사이 숫자로 입력해 주세요.', 'Số năm kinh nghiệm từ 0 đến 60.', 'Experience must be 0–60 years.'));
    if (!career.trim()) return setError(t('경력 내용을 입력해 주세요.', 'Hãy nhập chi tiết kinh nghiệm.', 'Describe your experience.'));
    if (!bio.trim()) return setError(t('자기소개를 입력해 주세요.', 'Hãy nhập giới thiệu bản thân.', 'Enter a short bio.'));
    if (!files.photo) return setError(t('프로필 사진을 올려 주세요.', 'Hãy tải ảnh đại diện.', 'Upload a profile photo.'));
    if (!files.id_card) return setError(t('신분증 사진을 올려 주세요.', 'Hãy tải ảnh giấy tờ tùy thân.', 'Upload your ID card.'));

    setSubmitting(true);
    try {
      // documents 버킷은 비공개이고 경로 첫 세그먼트가 본인 uid 여야 정책을 통과한다
      const documents: Partial<Record<DocKey, string>> = {};
      for (const key of ['photo', 'id_card', 'business_license'] as DocKey[]) {
        const file = files[key];
        if (!file) continue;
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${user.uid}/${key}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        documents[key] = path;
      }

      const { error: rpcErr } = await supabase.rpc('submit_technician_application', {
        p_phone: phone.trim(),
        p_skills: skills,
        p_experience_years: n,
        p_career: career.trim(),
        p_bio: bio.trim(),
        p_documents: documents,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      router.push(`/${locale}/technician`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  );

  if (authLoading || roleLoading || loading) {
    return shell(<p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>);
  }

  if (!user) {
    return shell(
      <div className="rounded-2xl border p-6 text-center" style={CARD}>
        <div className="mb-3 text-4xl">🔒</div>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{t('로그인이 필요합니다', 'Cần đăng nhập', 'Login required')}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('상단의 로그인 버튼으로 로그인한 뒤 다시 열어 주세요.', 'Đăng nhập ở menu trên rồi thử lại.', 'Log in from the top menu and try again.')}
        </p>
      </div>
    );
  }

  if (role === 'admin') {
    return shell(
      <p className="text-sm" style={{ color: 'var(--color-text)' }}>
        {t('관리자 계정은 기술자로 신청할 수 없습니다.', 'Tài khoản quản trị không thể đăng ký kỹ thuật viên.', 'Admin accounts cannot apply as technicians.')}
      </p>
    );
  }

  const status = existing?.status;
  if (status === 'active' || status === 'suspended' || (status === 'pending' && existing?.submitted_at)) {
    return shell(
      <div className="rounded-2xl border p-6 text-center" style={CARD}>
        <div className="mb-3 text-4xl">{status === 'pending' ? '⏳' : status === 'active' ? '✅' : '⛔'}</div>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {status === 'pending'
            ? t('이미 신청서를 제출했습니다', 'Bạn đã gửi đơn', 'Application already submitted')
            : status === 'active'
              ? t('이미 등록된 기술자입니다', 'Bạn đã là kỹ thuật viên', 'You are already a technician')
              : t('계정이 정지되었습니다', 'Tài khoản bị tạm ngưng', 'Account suspended')}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {status === 'pending' && t('관리자 승인 후 활동할 수 있습니다.', 'Bạn có thể hoạt động sau khi được duyệt.', 'You can start after admin approval.')}
        </p>
        <button
          onClick={() => router.push(`/${locale}/technician`)}
          className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {t('기술자 화면으로', 'Đến trang kỹ thuật viên', 'Go to technician area')}
        </button>
      </div>
    );
  }

  const fileRow = (key: DocKey, ko: string, vi: string, en: string, required: boolean) => (
    <div>
      <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
        {t(ko, vi, en)} {required ? <span style={{ color: '#D32F2F' }}>*</span> : <span>({t('선택', 'tùy chọn', 'optional')})</span>}
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => pickFile(key, e.target.files?.[0])}
        className="w-full rounded-xl border px-3 py-2 text-xs"
        style={INPUT}
      />
      {files[key] && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          ✓ {files[key]!.name} ({Math.ceil(files[key]!.size / 1024)}KB)
        </p>
      )}
    </div>
  );

  return shell(
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
          {t('기술자 등록 신청', 'Đăng ký kỹ thuật viên', 'Technician application')}
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '아래 내용을 모두 제출하면 관리자가 확인한 뒤 승인합니다. 승인 후에 주문을 받을 수 있습니다.',
            'Gửi đầy đủ thông tin bên dưới; quản trị sẽ xem xét và phê duyệt. Sau khi duyệt bạn có thể nhận đơn.',
            'Submit everything below; an admin reviews and approves. You can take orders once approved.'
          )}
        </p>
      </div>

      {status === 'rejected' && (
        <div className="rounded-2xl border p-4" style={{ background: '#EFEBE9', borderColor: '#D7CCC8' }}>
          <p className="text-xs font-bold" style={{ color: '#6D4C41' }}>
            {t('이전 신청이 반려되었습니다', 'Đơn trước bị từ chối', 'Your previous application was rejected')}
          </p>
          <p className="mt-1 text-xs" style={{ color: '#6D4C41' }}>
            {t('사유', 'Lý do', 'Reason')}: {existing?.reject_reason || '-'}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: '#6D4C41' }}>
            {t('내용을 고치고 사진·신분증을 다시 올려 제출해 주세요.', 'Hãy sửa nội dung và tải lại ảnh, giấy tờ.', 'Fix the details and re-upload your photo and ID.')}
          </p>
        </div>
      )}

      <section className="space-y-3 rounded-2xl border p-4" style={CARD}>
        <div>
          <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
            {t('연락처', 'Số điện thoại', 'Phone')} <span style={{ color: '#D32F2F' }}>*</span>
          </label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={INPUT} />
        </div>
        <div>
          <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
            {t('경력 연수', 'Số năm kinh nghiệm', 'Years of experience')} <span style={{ color: '#D32F2F' }}>*</span>
          </label>
          <input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={INPUT} />
        </div>
      </section>

      <section className="rounded-2xl border p-4" style={CARD}>
        <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
          {t('기술 분야', 'Lĩnh vực', 'Skills')} ({skills.length}) <span style={{ color: '#D32F2F' }}>*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = skills.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleSkill(c.id)}
                aria-pressed={on}
                className="rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={on
                  ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                  : { ...INPUT }}
              >
                {c.icon} {localizedName(c, locale)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border p-4" style={CARD}>
        <div>
          <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
            {t('경력 내용', 'Chi tiết kinh nghiệm', 'Career details')} <span style={{ color: '#D32F2F' }}>*</span>
          </label>
          <textarea
            value={career}
            onChange={(e) => setCareer(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={t('예) 2019~2023 ○○설비 에어컨 설치·수리', 'VD: 2019–2023 lắp đặt, sửa điều hòa tại ...', 'e.g. 2019–2023 AC installation & repair at ...')}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
            {t('자기소개', 'Giới thiệu bản thân', 'About you')} <span style={{ color: '#D32F2F' }}>*</span>
          </label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={INPUT} />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border p-4" style={CARD}>
        {fileRow('photo', '프로필 사진', 'Ảnh đại diện', 'Profile photo', true)}
        {fileRow('id_card', '신분증', 'CMND/CCCD', 'ID card', true)}
        {fileRow('business_license', '사업자등록증', 'Giấy phép kinh doanh', 'Business licence', false)}
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '서류는 비공개로 저장되며 본인과 관리자만 볼 수 있습니다. 이미지 파일, 5MB 이하.',
            'Giấy tờ được lưu riêng tư, chỉ bạn và quản trị xem được. Ảnh, tối đa 5MB.',
            'Documents are stored privately; only you and admins can view them. Images, max 5MB.'
          )}
        </p>
      </section>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {submitting ? t('제출 중…', 'Đang gửi…', 'Submitting…') : t('신청서 제출', 'Gửi đơn', 'Submit application')}
      </button>
    </div>
  );
}
