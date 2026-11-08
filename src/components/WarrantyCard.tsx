'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { BESTMARIO_ZALO_PHONE, getZaloDirectLink } from '@/lib/zaloDispatch';
import type { TechnicianPublic } from '@/hooks/useQuotations';

export interface WarrantyCardProps {
  orderId: string;
  categoryName: string;
  technician: TechnicianPublic | null;
  completedAt?: string;
  expiresAt: string;
  address: string;
  locale: string;
}

export default function WarrantyCard({
  orderId,
  categoryName,
  technician,
  completedAt,
  expiresAt,
  address,
  locale,
}: WarrantyCardProps) {
  const [copied, setCopied] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const warrantyCode = `BM-W-${orderId.slice(0, 8).toUpperCase()}`;

  // 만료일까지 남은 일수 계산
  const now = new Date().getTime();
  const expDate = new Date(expiresAt).getTime();
  const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
  const isActive = diffDays > 0;

  const verificationUrl = `https://bestmario.netlify.app/${locale}/orders/${orderId}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    verificationUrl
  )}`;

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: t('베스트마리오 30일 안심 무상 A/S 보증서', 'Bảo hành 30 ngày BestMario', 'BestMario 30-Day Warranty'),
        text: `[BestMario] ${categoryName} 30일 안심 보증서 (${warrantyCode})\n보증 만료일: ${formatDateTime(expiresAt, locale)}`,
        url: verificationUrl,
      }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const zaloUrl = getZaloDirectLink(BESTMARIO_ZALO_PHONE);

  return (
    <>
      <div
        className="rounded-3xl p-5 shadow-lg border relative overflow-hidden text-gray-900 transition-all"
        style={{
          background: 'linear-gradient(135deg, #FFFDF8 0%, #FFFFFF 50%, #FFF8E1 100%)',
          borderColor: '#FFD54F',
        }}
      >
        {/* 워터마크 배경 엠블럼 */}
        <div
          className="absolute right-0 bottom-0 pointer-events-none opacity-[0.06] select-none text-9xl -mr-6 -mb-6"
          aria-hidden
        >
          🛡️
        </div>

        {/* 상단 헤더 */}
        <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: '#FFE082' }}>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white text-xs font-black shadow-xs">
                🛡️
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                BESTMARIO QUALITY GUARANTEE
              </span>
            </div>
            <h2 className="text-base font-black text-gray-900 mt-1">
              {t('30일 안심 무상 A/S 보증서', 'Chứng nhận bảo hành 30 ngày', '30-Day Warranty Card')}
            </h2>
          </div>

          <div className="text-right">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wide uppercase ${
                isActive
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-300'
              }`}
            >
              {isActive
                ? `✓ ${t('보증 활성', 'Đang bảo hành', 'Active')} (D-${diffDays})`
                : t('보증 만료', 'Hết hạn bảo hành', 'Expired')}
            </span>
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{warrantyCode}</p>
          </div>
        </div>

        {/* 보증 세부 내용 & QR 코드 */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="space-y-1.5 text-xs min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="w-20 text-[11px] font-semibold text-gray-500 shrink-0">
                {t('시공 분야', 'Hạng mục', 'Service')}
              </span>
              <span className="font-bold text-gray-900 truncate">{categoryName}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="w-20 text-[11px] font-semibold text-gray-500 shrink-0">
                {t('담당 기술자', 'Thợ phụ trách', 'Technician')}
              </span>
              <span className="font-bold text-gray-900 truncate">
                {technician ? `${technician.name} (⭐ ${technician.rating.toFixed(1)})` : 'BestMario Verified Pro'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="w-20 text-[11px] font-semibold text-gray-500 shrink-0">
                {t('시공 주소', 'Địa chỉ', 'Location')}
              </span>
              <span className="text-gray-800 truncate">{address}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="w-20 text-[11px] font-semibold text-gray-500 shrink-0">
                {t('보증 만료일', 'Hạn bảo hành', 'Expires')}
              </span>
              <span className="font-extrabold text-amber-900">
                {formatDateTime(expiresAt, locale)}
              </span>
            </div>
          </div>

          {/* 위변조 검증 QR 코드 */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-18 h-18 rounded-xl bg-white border border-amber-200 p-1 shadow-xs">
              <img src={qrCodeUrl} alt="Warranty QR" className="w-full h-full object-contain" />
            </div>
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400 mt-1">
              SCAN TO VERIFY
            </span>
          </div>
        </div>

        {/* 보증 약관 설명 */}
        <div className="mt-4 rounded-2xl bg-amber-50/70 p-3 border border-amber-200/60 text-[11px] leading-relaxed text-amber-950">
          <p className="font-bold mb-0.5">
            {t('📜 베스트마리오 무상 A/S 보장 범위', '📜 Phạm vi bảo hành miễn phí', '📜 Warranty Coverage')}
          </p>
          <p className="text-[10px] text-amber-900/85">
            {t(
              '시공 완료 후 30일 이내에 동일한 증상이나 부품 결함이 발생할 경우, 100% 무상으로 기술자가 재방문하여 책임 보수해 드립니다.',
              'Nếu có lỗi phát sinh trong 30 ngày kể từ khi làm xong, thợ sẽ đến khắc phục 100% miễn phí.',
              'If the same defect occurs within 30 days, we guarantee 100% free revisit and repair.'
            )}
          </p>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 active:scale-95 transition-transform"
          >
            {copied ? `✓ ${t('링크 복사됨', 'Đã copy', 'Copied')}` : `📱 ${t('보증서 공유·저장', 'Chia sẻ bảo hành', 'Share Card')}`}
          </button>

          {isActive && (
            <button
              type="button"
              onClick={() => setShowClaimModal(true)}
              className="flex-1 rounded-xl py-2.5 text-xs font-extrabold text-white shadow-sm active:scale-95 transition-transform"
              style={{ background: 'var(--color-primary)' }}
            >
              🛠️ {t('무상 A/S 접수하기', 'Yêu cầu bảo hành', 'Claim Free A/S')}
            </button>
          )}
        </div>
      </div>

      {/* 무상 A/S 접수 안내 모달 */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl space-y-4"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>{t('무상 A/S 긴급 접수', 'Yêu cầu bảo hành', 'Claim Free A/S')}</span>
              </h3>
              <button
                onClick={() => setShowClaimModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {t(
                `보증번호 [${warrantyCode}]에 대해 무상 A/S를 접수합니다. 베스트마리오 전담 매니저가 즉시 기술자를 재배정합니다.`,
                `Tiếp nhận bảo hành mã [${warrantyCode}]. BestMario sẽ cử thợ đến kiểm tra lại ngay.`,
                `Claiming A/S for [${warrantyCode}]. BestMario coordinator will re-dispatch a technician immediately.`
              )}
            </p>

            <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold">✓ 무상 방문 및 수리 보장</p>
              <p className="text-[11px] text-amber-800">
                고객 지원 Zalo로 고장 사진을 보내주시면 가장 빠른 시간 내에 무료 재방문 일정을 잡아드립니다.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowClaimModal(false)}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold border border-gray-200 text-gray-600"
              >
                {t('취소', 'Hủy', 'Cancel')}
              </button>
              <a
                href={zaloUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowClaimModal(false)}
                className="flex-1 rounded-xl py-2.5 text-xs font-black text-white text-center shadow-md active:scale-95 transition-transform"
                style={{ background: 'var(--color-primary)' }}
              >
                {t('Zalo로 A/S 즉시 접수', 'Nhắn Zalo bảo hành', 'Submit via Zalo')}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
