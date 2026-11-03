'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import type { DbUser, UserRole } from '@/types/supabase';

const ROLE_STYLE: Record<UserRole, { color: string; bg: string; ko: string; vi: string; en: string }> = {
  customer:   { color: '#455A64', bg: '#ECEFF1', ko: '고객',   vi: 'Khách hàng',    en: 'Customer' },
  technician: { color: '#1565C0', bg: '#E3F2FD', ko: '기술자', vi: 'Kỹ thuật viên', en: 'Technician' },
  admin:      { color: '#6A1B9A', bg: '#F3E5F5', ko: '관리자', vi: 'Quản trị',      en: 'Admin' },
};

type Filter = 'all' | UserRole;

export default function AdminMembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();

  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  // 토큰이 붙기 전(비로그인) 요청의 응답이 결과를 덮어쓰지 않도록 최신 요청만 반영한다
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (mine !== seq.current) return;
    setError(err ? err.message : null);
    setUsers((data ?? []) as DbUser[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: users.length, customer: 0, technician: 0, admin: 0 };
    for (const u of users) c[u.role] += 1;
    return c;
  }, [users]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (filter === 'all' || u.role === filter) &&
        (!q || u.name.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q))
    );
  }, [users, filter, query]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : 'ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: t('전체', 'Tất cả', 'All') },
    { key: 'customer', label: t('고객', 'Khách', 'Customers') },
    { key: 'technician', label: t('기술자', 'KTV', 'Technicians') },
    { key: 'admin', label: t('관리자', 'Quản trị', 'Admins') },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('회원 관리', 'Quản lý thành viên', 'Members')} ({counts.all})
      </h1>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('이름·연락처·ID 검색', 'Tìm tên, SĐT, ID', 'Search name, phone, ID')}
        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={filter === x.key}
            onClick={() => setFilter(x.key)}
            className="rounded-full border px-3 py-1 text-xs font-bold"
            style={
              filter === x.key
                ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                : { borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }
            }
          >
            {x.label} {counts[x.key]}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>
      ) : shown.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('해당하는 회원이 없습니다.', 'Không có thành viên.', 'No members found.')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((u) => {
            const r = ROLE_STYLE[u.role];
            return (
              <li
                key={u.uid}
                className="flex items-start gap-3 rounded-2xl border p-3"
                style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: 'var(--color-navy, #1A237E)' }}
                  aria-hidden
                >
                  {(u.name.trim().charAt(0) || '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {u.name || t('(이름 없음)', '(chưa có tên)', '(no name)')}
                    </p>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: r.color, background: r.bg }}>
                      {t(r.ko, r.vi, r.en)}
                    </span>
                  </div>
                  {u.phone && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>📞 {u.phone}</p>
                  )}
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {t('가입', 'Tham gia', 'Joined')} {fmtDate(u.created_at)} · {u.lang.toUpperCase()}
                  </p>
                  <p className="break-all font-mono text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{u.uid}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
