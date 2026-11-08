'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatVND } from '@/lib/format';

export interface DiagnosisResult {
  categoryId: string;
  categoryName: string;
  problemSummary: string;
  urgency: 'low' | 'medium' | 'high';
  cause: string;
  solution: string;
  estimatedPriceMin: number;
  estimatedPriceMax: number;
  currency: 'VND';
  estimatedDurationHours: number;
  requiredParts: string[];
  preventiveTip: string;
}

export default function AiDoctor({
  locale,
  initialNote = '',
  onApplyOrder,
}: {
  locale: string;
  initialNote?: string;
  onApplyOrder?: (result: DiagnosisResult, imageBase64: string) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [note, setNote] = useState(initialNote);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setError(t('이미지 파일만 등록할 수 있습니다.', 'Chỉ chấp nhận tệp hình ảnh.', 'Only image files are allowed.'));
      return;
    }

    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleDiagnose = async () => {
    if (!imageBase64) {
      setError(t('먼저 고장 부위 사진을 올려주세요.', 'Vui lòng chọn ảnh sự cố trước.', 'Please upload a photo of the defect first.'));
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          note: note.trim(),
          locale,
        }),
      });

      if (!res.ok) {
        throw new Error(t('진단 중 오류가 발생했습니다.', 'Lỗi khi chẩn đoán.', 'Error during diagnosis.'));
      }

      const data: DiagnosisResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleProceedOrder = () => {
    if (!result) return;

    if (onApplyOrder && imageBase64) {
      onApplyOrder(result, imageBase64);
      return;
    }

    // 주문 페이지로 이동하며 파라미터 전달
    const params = new URLSearchParams({
      category: result.categoryId,
      note: `[AI 진단] ${result.problemSummary}\n원인: ${result.cause}\n권장조치: ${result.solution}`,
      offeredPrice: String(Math.round((result.estimatedPriceMin + result.estimatedPriceMax) / 2)),
    });

    // 세션스토리지에 사진 임시 저장 (주문 폼에서 복원 가능)
    if (imageBase64) {
      try {
        sessionStorage.setItem('bestmario_ai_photo', imageBase64);
      } catch {
        // quota exceeded fallback
      }
    }

    router.push(`/${locale}/order/new?${params.toString()}`);
  };

  const formatVndToKrw = (vnd: number) => {
    // 100 VND 약 5.5원
    const krw = Math.round(vnd * 0.055);
    return `약 ${(krw / 10000).toFixed(1)}만원`;
  };

  return (
    <div className="space-y-4">
      {/* 사진 선택 & 메모 입력 카드 */}
      <div
        className="rounded-3xl border p-5 shadow-sm"
        style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-100 text-sm">
            🤖
          </span>
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
            {t('AI 사진 고장진단 & 즉시 견적기', 'AI Chẩn đoán sự cố qua ảnh', 'AI Visual Defect Diagnosis')}
          </h2>
        </div>

        <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t(
            '고장 난 부위(누수, 에어컨, 전등, 벽체 등)를 촬영해 올리면, AI가 원인을 파악하고 하노이 시세 기준 예상 견적을 즉시 산출합니다.',
            'Chụp ảnh vị trí hỏng (điều hòa, rò nước, điện, tường…), AI sẽ phân tích nguyên nhân và báo giá dự kiến theo giá thị trường Hà Nội.',
            'Snap a photo of the defect (leak, AC, wiring, wall). AI will identify the root cause and calculate expected repair costs in Hanoi.'
          )}
        </p>

        {/* 파일 업로드 드롭존 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileChange(e.target.files)}
          className="hidden"
        />

        {imagePreview ? (
          <div className="relative mb-3 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
            <img
              src={imagePreview}
              alt={t('고장 사진', 'Ảnh sự cố', 'Defect photo')}
              className="w-full max-h-64 object-cover"
            />
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-xs">
                <div className="relative w-16 h-16 mb-2">
                  <div className="absolute inset-0 rounded-full border-4 border-red-500/30 border-t-red-500 animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-xl">🔍</span>
                </div>
                <p className="text-xs font-bold animate-pulse">
                  {t('AI가 고장 원인과 시세를 분석 중입니다…', 'AI đang phân tích sự cố & giá thị trường…', 'AI is analyzing defect and market price…')}
                </p>
              </div>
            )}
            {!isAnalyzing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-2 right-2 rounded-xl bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-black/80"
              >
                🔄 {t('사진 다시 선택', 'Đổi ảnh', 'Change photo')}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed py-8 px-4 flex flex-col items-center justify-center gap-2 transition-colors hover:border-red-400"
            style={{ borderColor: 'var(--color-border, #d1d5db)', background: 'var(--color-bg, #f9fafb)' }}
          >
            <span className="text-3xl">📸</span>
            <div className="text-center">
              <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {t('고장 부위 사진 촬영 또는 업로드', 'Chụp ảnh hoặc tải lên ảnh sự cố', 'Take photo or upload defect image')}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {t('카메라 촬영 / 갤러리 선택 가능', 'Hỗ trợ chụp trực tiếp từ máy ảnh', 'Supports live camera capture or gallery')}
              </p>
            </div>
          </button>
        )}

        {/* 증상 메모 입력 (선택) */}
        <div className="mt-3">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              '추가 증상 입력 (예: 어제부터 물이 떨어져요, 찬바람이 안 나와요)',
              'Mô tả thêm (vd: từ hôm qua bắt đầu chảy nước, không mát…)',
              'Optional details (e.g., started leaking water yesterday, not cooling)'
            )}
            disabled={isAnalyzing}
            className="w-full rounded-xl border px-3 py-2.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg, #f7f7f8)',
              borderColor: 'var(--color-border, #ebebed)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {error && (
          <p className="mt-2 text-xs font-semibold" style={{ color: '#D32F2F' }}>
            ⚠️ {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleDiagnose}
          disabled={!imageBase64 || isAnalyzing}
          className="mt-4 w-full rounded-2xl py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {isAnalyzing
            ? t('⚡ 3초 만에 분석 중…', '⚡ Đang phân tích…', '⚡ Analyzing…')
            : t('🤖 AI 정밀 고장진단 & 견적 확인', '🤖 AI Chẩn đoán & Báo giá ngay', '🤖 Run AI Diagnosis & Estimate')}
        </button>
      </div>

      {/* 진단 결과 카드 */}
      {result && (
        <div
          className="rounded-3xl border p-5 shadow-sm space-y-4 animate-in fade-in duration-300"
          style={{ background: 'var(--color-surface, #fff)', borderColor: '#2E7D32' }}
        >
          {/* 상단 뱃지 & 요약 */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold bg-green-100 text-green-800">
                ✓ {t('AI 진단 완료', 'Đã chẩn đoán', 'Diagnosis Complete')}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  result.urgency === 'high'
                    ? 'bg-red-100 text-red-700'
                    : result.urgency === 'medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {result.urgency === 'high'
                  ? t('🚨 긴급 조치 권장', '🚨 Cần xử lý gấp', '🚨 Urgent')
                  : result.urgency === 'medium'
                  ? t('⚠️ 주의 필요', '⚠️ Cần lưu ý', '⚠️ Moderate')
                  : t('ℹ️ 일반 점검', 'ℹ️ Bình thường', 'ℹ️ Routine')}
              </span>
            </div>

            <h3 className="text-base font-black" style={{ color: 'var(--color-text)' }}>
              {result.problemSummary}
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('추천 분야', 'Lĩnh vực', 'Category')}: <b className="text-emerald-700">{result.categoryName}</b>
            </p>
          </div>

          {/* 예상 견적 박스 */}
          <div
            className="rounded-2xl p-4 border"
            style={{ background: '#F1F8E9', borderColor: '#C8E6C9' }}
          >
            <p className="text-[11px] font-bold text-emerald-800">
              💰 {t('하노이 현지 시세 기준 예상 견적', 'Báo giá dự kiến tại Hà Nội', 'Estimated Repair Cost (Hanoi)')}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-900">
                {formatVND(result.estimatedPriceMin)} ~ {formatVND(result.estimatedPriceMax)}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                ({formatVndToKrw(result.estimatedPriceMin)} ~ {formatVndToKrw(result.estimatedPriceMax)})
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-700">
              ⏱️ {t('예상 소요 시간', 'Thời gian dự kiến', 'Estimated duration')}: 약 {result.estimatedDurationHours}{t('시간', ' giờ', ' hours')}
            </p>
          </div>

          {/* 원인 및 해결책 */}
          <div className="space-y-2.5 text-xs">
            <div>
              <p className="font-extrabold" style={{ color: 'var(--color-text)' }}>
                🔍 {t('고장 원인 분석', 'Nguyên nhân', 'Root Cause')}
              </p>
              <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
                {result.cause}
              </p>
            </div>

            <div>
              <p className="font-extrabold" style={{ color: 'var(--color-text)' }}>
                🛠️ {t('권장 수리 공정', 'Giải pháp khắc phục', 'Recommended Solution')}
              </p>
              <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
                {result.solution}
              </p>
            </div>

            {result.requiredParts && result.requiredParts.length > 0 && (
              <div>
                <p className="font-extrabold" style={{ color: 'var(--color-text)' }}>
                  📦 {t('필요 자재 및 부품', 'Vật tư / Linh kiện cần thiết', 'Required Parts')}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.requiredParts.map((part, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px]"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {part}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.preventiveTip && (
              <p className="pt-2 border-t text-[11px] leading-relaxed" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}>
                💡 <b>Tip:</b> {result.preventiveTip}
              </p>
            )}
          </div>

          {/* 원클릭 기술자 연결 액션 버튼 */}
          <button
            type="button"
            onClick={handleProceedOrder}
            className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white shadow-md transition-transform active:scale-98"
            style={{ background: 'var(--color-primary)' }}
          >
            🚀 {t('이 견적으로 기술자 바로 부르기 →', 'Đặt thợ theo báo giá này →', 'Book Technician with This Quote →')}
          </button>
        </div>
      )}
    </div>
  );
}
