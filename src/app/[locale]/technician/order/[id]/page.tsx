'use client';

import { use, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderContact from '@/components/OrderContact';
import PaymentStatus from '@/components/PaymentStatus';
import { useTechnicianOrders } from '@/hooks/useTechnicianOrders';
import { formatDateTime, formatVND } from '@/lib/format';

const MAX_PHOTOS = 10;

export default function TechnicianOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = use(params);
  const router = useRouter();
  const { myOrders, loading, startWork, completeWork, uploadPhotos } = useTechnicianOrders();

  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDone, setUploadDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const order = useMemo(() => myOrders.find((o) => o.id === id) ?? null, [myOrders, id]);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSelectFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || !order) return;
    setError(null);
    setUploadDone(false);

    const existing = order.photos_after.length;
    const room = MAX_PHOTOS - existing;
    if (room <= 0) {
      setError(t(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`, `Tối đa ${MAX_PHOTOS} ảnh.`, `Up to ${MAX_PHOTOS} photos.`));
      return;
    }

    const merged = [...selectedFiles, ...Array.from(files)].slice(0, room);
    setSelectedFiles(merged);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRegisterPhotos = async () => {
    if (!order || selectedFiles.length === 0) return;

    const existing = order.photos_after.length;
    const room = MAX_PHOTOS - existing;
    if (room <= 0) {
      setError(t(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`, `Tối đa ${MAX_PHOTOS} ảnh.`, `Up to ${MAX_PHOTOS} photos.`));
      return;
    }

    const picked = selectedFiles.slice(0, room);
    await run('upload', async () => {
      const urls = await uploadPhotos(order.id, picked);
      await completeWork(order.id, [...order.photos_after, ...urls]);
      setSelectedFiles([]);
      setUploadDone(true);
    });
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  if (!order) {
    return (
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: '#D32F2F' }}>
          {t('배정된 주문을 찾을 수 없습니다.', 'Không tìm thấy đơn được phân công.', 'Assigned order not found.')}
        </p>
        <button
          onClick={() => router.push(`/${locale}/technician`)}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {t('목록으로', 'Về danh sách', 'Back to list')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => router.push(`/${locale}/technician`)} className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
        ← {t('내 작업', 'Công việc', 'My jobs')}
      </button>

      {/* 주문 정보 */}
      <div className="rounded-2xl border p-5" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
            {t('작업 진행', 'Tiến hành công việc', 'Job progress')}
          </h1>
          <OrderStatusBadge status={order.status} locale={locale} />
        </div>
        <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>🕒 {formatDateTime(order.scheduled_at, locale)}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>📍 {order.address}</p>
        {order.note && (
          <p className="mt-2 pt-2 border-t text-xs whitespace-pre-line leading-relaxed" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-2, #5c5c6e)' }}>
            {order.note}
          </p>
        )}
      </div>

      {order.product_name && order.quantity !== null && order.unit_price !== null && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <p className="font-bold" style={{ color: 'var(--color-text)' }}>🛍️ {order.product_name}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {order.quantity}{order.unit_label} × {formatVND(order.unit_price)} = {formatVND(order.quantity * order.unit_price)}
          </p>
        </div>
      )}

      {order.status !== 'cancelled' && (
        <PaymentStatus
          orderId={order.id}
          locale={locale}
          audience="technician"
          showUnpaid={order.status !== 'completed'}
        />
      )}

      {order.status !== 'cancelled' && <OrderContact orderId={order.id} locale={locale} />}

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {/* 1단계: 작업 시작 */}
      {order.status === 'assigned' && (
        <section className="rounded-2xl border p-5" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-primary)' }}>
          <h2 className="text-sm font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
            1. {t('작업 시작', 'Bắt đầu', 'Start work')}
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {t('현장에 도착해 작업을 시작할 때 누르세요.', 'Nhấn khi bạn đã đến và bắt đầu làm.', 'Tap when you arrive and begin the work.')}
          </p>
          <button
            onClick={() => void run('start', () => startWork(order.id))}
            disabled={busy !== null}
            className="w-full rounded-xl py-3 text-sm font-extrabold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy === 'start' ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('작업 시작', 'Bắt đầu', 'Start work')}
          </button>
        </section>
      )}

      {/* 2단계: 사진 등록 + 완료 요청 */}
      {order.status === 'in_progress' && (
        <section className="rounded-2xl border p-5" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-primary)' }}>
          <h2 className="text-sm font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
            2. {t('작업 후 사진 등록', 'Tải ảnh sau khi làm', 'Upload photos')}
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              `사진을 등록하면 고객에게 완료 요청이 전달됩니다 (최대 ${MAX_PHOTOS}장).`,
              `Sau khi tải ảnh, yêu cầu hoàn thành sẽ được gửi cho khách (tối đa ${MAX_PHOTOS} ảnh).`,
              `Uploading photos sends the completion request to the customer (up to ${MAX_PHOTOS}).`
            )}
          </p>

          {order.photos_after.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {order.photos_after.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt={t('작업 후 사진', 'Ảnh sau khi làm', 'Photo after work')}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-square object-cover rounded-lg bg-gray-100"
                />
              ))}
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleSelectFiles(e.target.files)}
            disabled={busy !== null || order.photos_after.length >= MAX_PHOTOS}
            className="hidden"
          />

          {selectedFiles.length > 0 && (
            <div className="mb-3 space-y-1.5 rounded-xl border p-3" style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>
                {t(`선택된 사진 (${selectedFiles.length}장)`, `Ảnh đã chọn (${selectedFiles.length})`, `Selected photos (${selectedFiles.length})`)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedFiles.map((f, idx) => (
                  <span
                    key={`${f.name}-${idx}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]"
                    style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
                  >
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile(idx)}
                      disabled={busy !== null}
                      className="font-bold hover:opacity-75"
                      style={{ color: '#D32F2F' }}
                      aria-label={t('삭제', 'Xóa', 'Remove')}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy !== null || order.photos_after.length >= MAX_PHOTOS}
              className="flex-1 rounded-xl border py-3 text-sm font-extrabold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: 'var(--color-bg, #f7f7f8)',
                borderColor: 'var(--color-border, #ebebed)',
                color: 'var(--color-text)',
              }}
            >
              📷 {t('파일 선택', 'Chọn ảnh', 'Choose files')}
              {selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}
            </button>

            <button
              type="button"
              onClick={() => void handleRegisterPhotos()}
              disabled={busy !== null || selectedFiles.length === 0 || order.photos_after.length >= MAX_PHOTOS}
              className="flex-1 rounded-xl py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy === 'upload'
                ? t('등록 중…', 'Đang tải lên…', 'Uploading…')
                : t('등록하기', 'Đăng ký ảnh', 'Upload & Submit')}
            </button>
          </div>

          <p className="mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('등록된 사진', 'Ảnh đã đăng', 'Uploaded')}: {order.photos_after.length} / {MAX_PHOTOS}
          </p>

          {uploadDone && (
            <p className="mt-2 text-xs font-bold" style={{ color: '#2E7D32' }}>
              ✓ {t('사진이 등록되어 고객에게 완료 승인 요청이 전달되었습니다.', 'Đã đăng ảnh và gửi yêu cầu xác nhận hoàn thành cho khách.', 'Photos uploaded and completion request sent to the customer.')}
            </p>
          )}

          <p className="mt-4 pt-3 border-t text-[11px] leading-relaxed" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}>
            {t(
              '3. 고객이 완료를 승인하면 정산이 생성됩니다. 고객이 72시간 내 응답하지 않으면 자동 승인됩니다.',
              '3. Khi khách xác nhận, bản thanh toán sẽ được tạo. Nếu khách không phản hồi trong 72 giờ, đơn tự động hoàn thành.',
              '3. Once the customer approves, your settlement is created. If they do not respond within 72 hours, it is approved automatically.'
            )}
          </p>
        </section>
      )}

      {order.status === 'completed' && (
        <section className="rounded-2xl border p-5 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {t('완료된 작업입니다', 'Công việc đã hoàn thành', 'Job completed')}
          </p>
          <button
            onClick={() => router.push(`/${locale}/technician/settlements`)}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('정산 내역 보기', 'Xem thanh toán', 'View earnings')}
          </button>
        </section>
      )}
    </div>
  );
}
