import { normalizePhone } from './contact';

export interface ZaloOrderInfo {
  orderId: string;
  categoryName: string;
  address: string;
  price?: number;
  note?: string;
  scheduledAt?: string;
  technicianName?: string;
  customerPhone?: string;
  technicianPhone?: string;
}

/** 베스트마리오 고객지원 공식 잘로 번호 */
export const BESTMARIO_ZALO_PHONE = '0904000123'; // 베스트마리오 하노이 고객센터

/** 잘로 1:1 대화 링크 */
export function getZaloDirectLink(phone: string): string {
  const clean = normalizePhone(phone);
  return clean.length >= 8 ? `https://zalo.me/${clean}` : `https://zalo.me/${BESTMARIO_ZALO_PHONE}`;
}

/** 새 일감 등록 시 기술자에게 전달할 잘로 메시지 서식 */
export function buildZaloNewOrderText(info: ZaloOrderInfo, locale: string = 'vi'): string {
  const isVi = locale === 'vi';
  const isEn = locale === 'en';

  const title = isVi
    ? '⚡ [BestMario] CÓ ĐƠN HÀNG MỚI CẦN THỢ'
    : isEn
    ? '⚡ [BestMario] NEW JOB REQUEST'
    : '⚡ [베스트마리오] 새로운 일감이 등록되었습니다';

  const category = isVi ? 'Lĩnh vực' : isEn ? 'Category' : '서비스 분야';
  const addr = isVi ? 'Địa chỉ' : isEn ? 'Address' : '방문 주소';
  const estPrice = isVi ? 'Dự kiến' : isEn ? 'Estimate' : '예상 견적';
  const viewOrder = isVi ? 'Xem đơn & Nhận việc ngay tại' : isEn ? 'View & Accept Job at' : '일감 확인 및 수락하기';

  const priceStr = info.price ? `${new Intl.NumberFormat('vi-VN').format(info.price)}₫` : (isVi ? 'Thỏa thuận' : '협의');
  const orderUrl = `https://bestmario.netlify.app/${locale}/technician/order/${info.orderId}`;

  return `${title}\n\n• ${category}: ${info.categoryName}\n• ${addr}: ${info.address}\n• ${estPrice}: ${priceStr}${info.note ? `\n• Ghi chú: ${info.note}` : ''}\n\n👉 ${viewOrder}:\n${orderUrl}`;
}

/** 기술자가 출동할 때 고객에게 전달할 잘로 메시지 서식 */
export function buildZaloDispatchNoticeText(info: ZaloOrderInfo, etaMinutes: number = 20, locale: string = 'vi'): string {
  const isVi = locale === 'vi';
  const isEn = locale === 'en';

  const title = isVi
    ? `🚗 [BestMario] KỸ THUẬT VIÊN ĐANG ĐẾN (${etaMinutes} PHÚT)`
    : isEn
    ? `🚗 [BestMario] TECHNICIAN ON THE WAY (${etaMinutes} MINS)`
    : `🚗 [베스트마리오] 기술자 출동 중 (약 ${etaMinutes}분 내 도착)`;

  const tech = isVi ? 'Thợ phụ trách' : isEn ? 'Technician' : '담당 기술자';
  const detail = isVi
    ? `Kỹ thuật viên ${info.technicianName || 'BestMario'} đang trên đường tới địa chỉ của bạn. Vui lòng giữ máy.`
    : isEn
    ? `Technician ${info.technicianName || 'BestMario'} is on the way to your address. Please keep your phone reachable.`
    : `${info.technicianName || '베스트마리오'} 기술자님이 고객님 댁으로 출발했습니다. 현장 도착 시 연락드리겠습니다.`;

  const orderUrl = `https://bestmario.netlify.app/${locale}/orders/${info.orderId}`;

  return `${title}\n\n${detail}\n\n• ${tech}: ${info.technicianName || 'BestMario Pro'}\n• Điểm đến: ${info.address}\n\n👉 Theo dõi đơn hàng:\n${orderUrl}`;
}

/** 잘로 앱으로 메시지 전송 URL 생성 (클립보드 복사 후 잘로 대화창 열기 보조) */
export function openZaloChatWithMessage(phone: string, text: string) {
  if (typeof window === 'undefined') return;
  // 클립보드에 메시지 자동 복사
  void navigator.clipboard.writeText(text);
  const cleanPhone = normalizePhone(phone);
  const targetUrl = cleanPhone.length >= 8 ? `https://zalo.me/${cleanPhone}` : `https://zalo.me/${BESTMARIO_ZALO_PHONE}`;
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}
