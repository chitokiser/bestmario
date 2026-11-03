'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, callMerchantMemberJoin } from '@/lib/firebase';
import { createSupabaseClient } from '@/lib/supabase';
import { useUTM } from '@/hooks/useUTM';
import { useMerchant } from '@/hooks/useMerchant';
import { useWebzines } from '@/hooks/useWebzines';
import { useAuthState } from '@/hooks/useAuthState';
import { useOrders } from '@/hooks/useOrders';

const MERCHANT_ID = process.env.NEXT_PUBLIC_BESTMARIO_MERCHANT_ID || undefined;

const LOCALES = [
  { code: 'vi', label: 'VI' },
  { code: 'ko', label: 'KO' },
  { code: 'en', label: 'EN' },
];

interface ServiceCategory {
  id: string;
  icon: string;
  title: string;
  titleVi: string;
  titleEn: string;
  sub: string;
  tags: string[];
  items: string[];
  itemsVi: string[];
}

const BESTMARIO_SERVICES: ServiceCategory[] = [
  {
    id: 'repair',
    icon: '🔧',
    title: '생활수리 및 출장 홈서비스',
    titleVi: 'Sửa chữa & Dịch vụ tại nhà',
    titleEn: 'Home Repair & Services',
    sub: 'Home Repair',
    tags: ['repair'],
    items: [
      '전기 수리 및 배선 공사', '수도·배관 수리', '누수 탐지 및 방수',
      '에어컨 청소 및 수리', '냉장고·세탁기·건조기 수리', '온수기·보일러 수리',
      '조명·LED 설치 및 교체', '콘센트·스위치 교체', '도어락·디지털키 설치',
      '문·창문 수리', '가구 조립 및 설치', '커튼·블라인드 설치',
      'TV 벽걸이 및 전자제품 설치', '타일·바닥 부분 보수', '벽 균열 및 천장 보수',
    ],
    itemsVi: [
      'Sửa điện & đi dây', 'Sửa đường ống nước', 'Phát hiện rò rỉ & chống thấm',
      'Vệ sinh & sửa máy lạnh', 'Sửa tủ lạnh, máy giặt, máy sấy', 'Sửa bình nóng lạnh, lò hơi',
      'Lắp đèn LED', 'Thay ổ cắm, công tắc', 'Lắp khóa cửa thông minh',
      'Sửa cửa & cửa sổ', 'Lắp ráp nội thất', 'Lắp rèm cửa & mành',
      'Lắp TV treo tường', 'Sửa gạch & sàn nhà', 'Trám vết nứt tường & trần',
    ],
  },
  {
    id: 'clean',
    icon: '🧹',
    title: '청소 및 위생관리',
    titleVi: 'Vệ sinh & Khử trùng',
    titleEn: 'Cleaning & Sanitation',
    sub: 'Cleaning',
    tags: ['clean'],
    items: [
      '일반 가정 청소', '입주 전 청소', '퇴거 후 청소', '사무실·상가 청소',
      '에어컨 분해 세척', '소파·침대 매트리스 청소', '카펫·커튼 세탁',
      '주방 후드 및 배기구 청소', '욕실·화장실 전문 청소', '물탱크 청소',
      '곰팡이 제거 및 살균', '유리창·외벽 청소', '정기 방문 청소',
    ],
    itemsVi: [
      'Vệ sinh nhà ở thông thường', 'Vệ sinh trước khi chuyển vào', 'Dọn dẹp sau khi chuyển đi',
      'Vệ sinh văn phòng & cửa hàng', 'Vệ sinh máy lạnh tháo lắp', 'Giặt sofa, nệm',
      'Giặt thảm & rèm', 'Vệ sinh máy hút mùi bếp', 'Vệ sinh nhà tắm chuyên sâu',
      'Vệ sinh bể nước', 'Xử lý mốc & khử khuẩn', 'Lau kính & ngoại thất', 'Dịch vụ vệ sinh định kỳ',
    ],
  },
  {
    id: 'interior',
    icon: '🏠',
    title: '인테리어 및 리모델링',
    titleVi: 'Nội thất & Cải tạo',
    titleEn: 'Interior & Renovation',
    sub: 'Interior',
    tags: ['interior'],
    items: [
      '아파트 전체 인테리어', '주택·빌라 리모델링', '욕실 리모델링', '주방 리모델링',
      '거실·침실 인테리어', '상업시설 인테리어', '식당·카페 인테리어',
      '사무실·학원 인테리어', '벽체·천장 공사', '바닥재·마루 시공',
      '타일 시공', '도장 및 페인트', '방수·단열 공사', '붙박이장·맞춤가구',
    ],
    itemsVi: [
      'Nội thất căn hộ toàn bộ', 'Cải tạo nhà & biệt thự', 'Cải tạo phòng tắm',
      'Cải tạo nhà bếp', 'Nội thất phòng khách & phòng ngủ', 'Nội thất thương mại',
      'Nội thất nhà hàng & café', 'Nội thất văn phòng', 'Thi công tường & trần',
      'Lát sàn & gỗ', 'Ốp gạch', 'Sơn & hoàn thiện', 'Chống thấm & cách nhiệt', 'Tủ âm tường',
    ],
  },
  {
    id: 'design3d',
    icon: '📐',
    title: '인테리어 설계 및 3D 디자인',
    titleVi: 'Thiết kế & Mô hình 3D',
    titleEn: 'Design & 3D Visualization',
    sub: '3D Design',
    tags: ['interior'],
    items: [
      '아파트 평면도 설계', '주택 건축 평면도', '2D CAD 도면 제작', '3D 인테리어 조감도',
      '실내 공간 디자인', '주방·욕실 3D 설계', '가구 배치 및 맞춤 설계',
      '조명 설계', '전기·수도 설비 도면', '자재 및 마감재 선정',
      '시공 견적 및 물량 산출', '리모델링 전후 시뮬레이션',
    ],
    itemsVi: [
      'Thiết kế mặt bằng căn hộ', 'Bản vẽ kiến trúc nhà ở', 'Bản vẽ 2D CAD',
      'Phối cảnh 3D nội thất', 'Thiết kế không gian nội thất', 'Thiết kế 3D bếp & phòng tắm',
      'Bố trí nội thất theo yêu cầu', 'Thiết kế chiếu sáng', 'Bản vẽ điện & nước',
      'Chọn vật liệu hoàn thiện', 'Dự toán & khối lượng thi công', 'Mô phỏng trước & sau cải tạo',
    ],
  },
  {
    id: 'elevator',
    icon: '🛗',
    title: '엘리베이터 및 승강설비',
    titleVi: 'Thang máy & Thiết bị nâng',
    titleEn: 'Elevator & Lifting Systems',
    sub: 'Elevator',
    tags: ['repair'],
    items: [
      '가정용 엘리베이터 설치', '소형 주택용 엘리베이터', '전망형 유리 엘리베이터',
      '상업용 승객 엘리베이터', '화물용 엘리베이터', '엘리베이터 설계 및 도면',
      '엘리베이터 교체 및 리모델링', '엘리베이터 유지보수', '정기 안전점검',
      '제어반 및 인버터 교체', '고장 진단 및 긴급 출동',
    ],
    itemsVi: [
      'Lắp thang máy gia đình', 'Thang máy nhà nhỏ', 'Thang máy kính panorama',
      'Thang máy chở khách thương mại', 'Thang máy chở hàng', 'Thiết kế & bản vẽ thang máy',
      'Thay thế & nâng cấp thang máy', 'Bảo trì thang máy', 'Kiểm định an toàn định kỳ',
      'Thay tủ điều khiển & biến tần', 'Chẩn đoán sự cố & xuất phát khẩn cấp',
    ],
  },
  {
    id: 'hvac',
    icon: '❄️',
    title: '냉난방 및 공조설비',
    titleVi: 'Điều hòa & Thông gió',
    titleEn: 'HVAC Systems',
    sub: 'HVAC',
    tags: ['repair'],
    items: [
      '가정용 에어컨 설치', '에어컨 이전 설치', '에어컨 가스 충전', '에어컨 냉매 누설 수리',
      '시스템 에어컨 설치', '중앙 냉난방 설비', 'VRV·VRF 설비',
      '환기 시스템 설치', '배기팬 설치', '공기청정기 설치', '냉난방 설비 정기점검',
    ],
    itemsVi: [
      'Lắp điều hòa gia đình', 'Di chuyển điều hòa', 'Nạp gas điều hòa',
      'Sửa rò rỉ gas điều hòa', 'Lắp điều hòa trung tâm', 'Hệ thống sưởi & làm mát trung tâm',
      'Hệ thống VRV·VRF', 'Lắp hệ thống thông gió', 'Lắp quạt hút', 'Lắp máy lọc không khí',
      'Kiểm tra định kỳ hệ thống điều hòa',
    ],
  },
  {
    id: 'electric',
    icon: '⚡',
    title: '전기·전자 및 스마트홈',
    titleVi: 'Điện & Nhà thông minh',
    titleEn: 'Electrical & Smart Home',
    sub: 'Smart Home',
    tags: ['repair'],
    items: [
      '주택 전기 배선 공사', '분전반·차단기 교체', '전기 용량 증설', 'CCTV 설치',
      '출입통제 시스템', '비디오 인터폰 설치', '스마트 도어락',
      '스마트 조명 제어', '스마트홈 자동화', 'Wi-Fi 및 네트워크 설치',
      '홈시어터·프로젝터 설치', '태양광 설비 설치', '전기차 충전기 설치',
    ],
    itemsVi: [
      'Thi công điện nhà ở', 'Thay tủ phân phối & cầu dao', 'Tăng công suất điện',
      'Lắp camera CCTV', 'Hệ thống kiểm soát ra vào', 'Lắp chuông hình video',
      'Khóa cửa thông minh', 'Điều khiển đèn thông minh', 'Tự động hóa nhà thông minh',
      'Lắp Wi-Fi & mạng', 'Lắp home theater & máy chiếu', 'Lắp pin năng lượng mặt trời',
      'Lắp trạm sạc xe điện',
    ],
  },
  {
    id: 'waterproof',
    icon: '🏗️',
    title: '방수·도장·건축 보수',
    titleVi: 'Chống thấm & Sơn phủ',
    titleEn: 'Construction Maintenance',
    sub: 'Waterproofing',
    tags: ['repair'],
    items: [
      '옥상 방수', '욕실 방수', '외벽 방수', '누수 보수',
      '벽면 페인트', '외벽 도장', '타일 교체 및 보수',
      '바닥 균열 보수', '천장 누수 보수', '단열 및 결로 방지',
      '지붕·빗물받이 수리', '건물 외벽 보수',
    ],
    itemsVi: [
      'Chống thấm mái', 'Chống thấm phòng tắm', 'Chống thấm tường ngoài', 'Sửa chống thấm rò rỉ',
      'Sơn tường trong', 'Sơn mặt tiền ngoài', 'Thay gạch ốp & lát',
      'Trám vết nứt sàn', 'Sửa thấm dột trần', 'Cách nhiệt & chống đọng sương',
      'Sửa mái & máng nước', 'Bảo trì mặt ngoài tòa nhà',
    ],
  },
  {
    id: 'move',
    icon: '📦',
    title: '이사 및 입주 서비스',
    titleVi: 'Chuyển nhà & Dọn vào',
    titleEn: 'Moving & Relocation',
    sub: 'Moving',
    tags: ['move'],
    items: [
      '가정 이사', '사무실 이전', '소형 이사', '가구 운반',
      '가전제품 운반 및 설치', '포장 및 정리', '폐가구·폐기물 처리',
      '입주 전 점검', '퇴거 전 원상복구',
    ],
    itemsVi: [
      'Chuyển nhà gia đình', 'Di dời văn phòng', 'Chuyển đồ nhỏ', 'Vận chuyển nội thất',
      'Vận chuyển & lắp đặt thiết bị điện', 'Đóng gói & sắp xếp', 'Xử lý đồ nội thất cũ & rác thải',
      'Kiểm tra trước khi dọn vào', 'Hoàn trả nguyên trạng trước khi trả nhà',
    ],
  },
  {
    id: 'garden',
    icon: '🌿',
    title: '정원 및 외부시설 관리',
    titleVi: 'Sân vườn & Ngoại thất',
    titleEn: 'Garden & Outdoor',
    sub: 'Garden',
    tags: ['garden'],
    items: [
      '정원 조경 설계', '잔디 관리 및 예초', '나무 전지 및 가지치기', '화단 조성',
      '식물 관리', '테라스·발코니 시공', '차양·어닝 설치',
      '수영장 청소 및 관리', '외부 조명 설치', '정원 자동관수 시스템',
    ],
    itemsVi: [
      'Thiết kế cảnh quan sân vườn', 'Chăm sóc & cắt cỏ', 'Tỉa cành cây',
      'Tạo bồn hoa', 'Chăm sóc cây cảnh', 'Thi công sân thượng & ban công',
      'Lắp mái che & ô dù', 'Vệ sinh & bảo trì hồ bơi', 'Lắp đèn ngoài trời',
      'Hệ thống tưới tự động',
    ],
  },
  {
    id: 'pest',
    icon: '🪲',
    title: '해충 방제 및 환경관리',
    titleVi: 'Kiểm soát côn trùng',
    titleEn: 'Pest Control',
    sub: 'Pest Control',
    tags: ['clean'],
    items: [
      '바퀴벌레 방제', '개미 방제', '모기 방제', '흰개미 방제', '쥐·설치류 방제',
      '빈대 방제', '해충 정기관리', '식당·상업시설 방역',
      '건물 소독 및 살균', '악취 제거',
    ],
    itemsVi: [
      'Diệt gián', 'Diệt kiến', 'Diệt muỗi', 'Diệt mối', 'Diệt chuột',
      'Diệt rệp giường', 'Kiểm soát sâu bọ định kỳ', 'Phun khử trùng nhà hàng & thương mại',
      'Khử trùng & tiệt khuẩn tòa nhà', 'Khử mùi hôi',
    ],
  },
  {
    id: 'appliance',
    icon: '🔌',
    title: '가전제품 및 생활설비',
    titleVi: 'Gia dụng & Thiết bị',
    titleEn: 'Appliance Services',
    sub: 'Appliances',
    tags: ['repair'],
    items: [
      '냉장고 수리', '세탁기 수리', '건조기 수리', '식기세척기 설치·수리',
      '정수기 설치·관리', '공기청정기 관리', '인덕션·가스레인지 수리',
      '전기오븐·전자레인지 수리', 'TV·모니터 설치', '소형 가전 수리',
    ],
    itemsVi: [
      'Sửa tủ lạnh', 'Sửa máy giặt', 'Sửa máy sấy', 'Lắp & sửa máy rửa bát',
      'Lắp & bảo trì máy lọc nước', 'Bảo trì máy lọc không khí', 'Sửa bếp từ & bếp ga',
      'Sửa lò nướng & lò vi sóng', 'Lắp TV & màn hình', 'Sửa đồ gia dụng nhỏ',
    ],
  },
  {
    id: 'safety',
    icon: '🛡️',
    title: '안전·소방 및 건물 관리',
    titleVi: 'An toàn & PCCC & Quản lý tòa nhà',
    titleEn: 'Safety & Facility Management',
    sub: 'Safety',
    tags: ['safety'],
    items: [
      '소화기 설치 및 점검', '화재경보기 설치', '스프링클러 점검', '비상조명 설치',
      '피난 유도등 점검', '건물 전기 안전점검', '시설물 정기점검',
      '건물 관리 대행', '상업시설 유지보수', '긴급 시설물 수리',
    ],
    itemsVi: [
      'Lắp & kiểm tra bình chữa cháy', 'Lắp báo cháy', 'Kiểm tra sprinkler', 'Lắp đèn khẩn cấp',
      'Kiểm tra biển chỉ dẫn thoát hiểm', 'Kiểm tra an toàn điện tòa nhà', 'Kiểm định công trình định kỳ',
      'Quản lý tòa nhà đại diện', 'Bảo trì cơ sở thương mại', 'Sửa chữa khẩn cấp cơ sở vật chất',
    ],
  },
];

const FILTER_TABS = [
  { id: 'all', label: '전체', labelVi: 'Tất cả', labelEn: 'All' },
  { id: 'repair', label: '수리·설비', labelVi: 'Sửa chữa', labelEn: 'Repair' },
  { id: 'clean', label: '청소·위생', labelVi: 'Vệ sinh', labelEn: 'Cleaning' },
  { id: 'interior', label: '인테리어', labelVi: 'Nội thất', labelEn: 'Interior' },
  { id: 'move', label: '이사·입주', labelVi: 'Chuyển nhà', labelEn: 'Moving' },
  { id: 'safety', label: '안전·관리', labelVi: 'An toàn', labelEn: 'Safety' },
];

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount) + '₫';
}

function WalletChip({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(255,255,255,0.15)' }}
      aria-label={`${label}: ${value}`}
    >
      {icon} {new Intl.NumberFormat().format(value)}
    </span>
  );
}

export default function LandingClient({ locale }: { locale: string }) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();

  useUTM();

  const [joinLoading, setJoinLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalService, setModalService] = useState('');
  const [modalItem, setModalItem] = useState('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalAddress, setModalAddress] = useState('');
  const [modalSchedule, setModalSchedule] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const { user, wallets, authLoading } = useAuthState();
  const { createOrder, submitting } = useOrders();
  const { merchant, loading: merchantLoading } = useMerchant(MERCHANT_ID);
  const { webzines, loading: webzinesLoading } = useWebzines(MERCHANT_ID, 3);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (!result.user) return;

      setJoinLoading(true);
      try {
        // Supabase users 행 생성. ignoreDuplicates 이므로 재로그인 시
        // 기존 role(technician/admin)을 customer 로 덮어쓰지 않는다.
        const idToken = await result.user.getIdToken();
        const supabase = createSupabaseClient(idToken);
        const { error } = await supabase.from('users').upsert(
          {
            uid: result.user.uid,
            role: 'customer',
            name: result.user.displayName ?? '',
            phone: result.user.phoneNumber ?? '',
            lang: locale,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'uid', ignoreDuplicates: true }
        );
        if (error) console.error('[supabase] users upsert 실패', error.message);
      } catch (e) {
        // Supabase 저장 실패 — 로그인 자체는 유지한다
        console.error('[supabase] users upsert 예외', e);
      }

      if (MERCHANT_ID) {
        try {
          await callMerchantMemberJoin(MERCHANT_ID);
        } catch {
          // 멘토 지정 실패 무시
        }
      }
      setJoinLoading(false);
    } catch {
      // 팝업 닫음 또는 취소 무시
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSwitchLocale = (newLocale: string) => {
    const segments = pathname.split('/');
    const knownLocales = ['ko', 'en', 'vi'];
    if (knownLocales.includes(segments[1])) {
      segments[1] = newLocale === 'vi' ? '' : newLocale;
    } else {
      if (newLocale !== 'vi') segments.splice(1, 0, newLocale);
    }
    const newPath = segments.filter(Boolean).join('/') || '/';
    router.push('/' + newPath.replace(/^\//, ''));
  };

  // service 는 service_categories.id (= BESTMARIO_SERVICES[].id)
  const openRequestModal = (service?: string, item?: string) => {
    setModalService(service ?? '');
    setModalItem(item ?? '');
    setModalNote(item ?? '');
    setModalError(null);
    setShowModal(true);
  };

  // 견적 요청 주문 생성 — order_type = 'quote_request' (스펙 §5③)
  const handleSubmitQuoteRequest = async () => {
    setModalError(null);

    if (!user) {
      setModalError(
        locale === 'vi' ? 'Vui lòng đăng nhập trước.' :
        locale === 'en' ? 'Please log in first.' : '먼저 로그인해 주세요.'
      );
      return;
    }
    if (!modalService || !modalAddress.trim() || !modalSchedule) {
      setModalError(
        locale === 'vi' ? 'Hãy chọn lĩnh vực và nhập địa chỉ, thời gian.' :
        locale === 'en' ? 'Select a category and enter address and time.' :
        '서비스 분야, 주소, 희망 일시를 입력해 주세요.'
      );
      return;
    }

    try {
      const contact = modalPhone.trim();
      const order = await createOrder({
        category_id: modalService,
        order_type: 'quote_request',
        address: modalAddress.trim(),
        scheduled_at: new Date(modalSchedule).toISOString(),
        note: contact ? `${modalNote.trim()}\n(연락처: ${contact})` : modalNote.trim(),
      });
      setShowModal(false);
      router.push(`/${locale}/orders/${order.id}`);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    }
  };

  const getServiceLabel = (svc: ServiceCategory) => {
    if (locale === 'vi') return svc.titleVi;
    if (locale === 'en') return svc.titleEn;
    return svc.title;
  };

  const getItemLabel = (svc: ServiceCategory, idx: number) => {
    if (locale === 'vi') return svc.itemsVi[idx] ?? svc.items[idx];
    return svc.items[idx];
  };

  const filteredServices = BESTMARIO_SERVICES.filter((svc) => {
    const matchFilter = activeFilter === 'all' || svc.tags.includes(activeFilter);
    if (!matchFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      svc.title.toLowerCase().includes(q) ||
      svc.titleVi.toLowerCase().includes(q) ||
      svc.titleEn.toLowerCase().includes(q) ||
      svc.items.some((it) => it.toLowerCase().includes(q)) ||
      svc.itemsVi.some((it) => it.toLowerCase().includes(q))
    );
  });

  const btStock = merchant?.btBalance ?? 0;
  const btPerVnd = merchant?.btPerVnd;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 gap-2"
        style={{ background: 'var(--color-primary)' }}
      >
        {/* 로고는 빨간 'BEST' + 검정 'MARIO' 조합이라 흰 배경용이다.
            빨간 헤더에 그대로 올리면 'BEST' 가 배경에 묻히므로 흰 판 위에 올린다. */}
        <a href="#" className="flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
          <Image
            src="/bestmario-logo.webp"
            alt="BestMario"
            width={480}
            height={155}
            priority
            className="h-7 w-auto"
          />
        </a>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {user && wallets && (
            <div className="flex gap-1 flex-wrap">
              <WalletChip icon="💎" value={wallets.pointBalanceVnd} label="BM" />
              <WalletChip icon="🎟️" value={wallets.btBalance} label="BT" />
              <WalletChip icon="⭐" value={wallets.pointBalance} label="Point" />
            </div>
          )}

          {!authLoading && (
            <button
              onClick={user ? handleLogout : handleLogin}
              disabled={joinLoading}
              className="text-xs font-semibold text-white underline-offset-2 hover:underline whitespace-nowrap disabled:opacity-60"
            >
              {joinLoading ? tCommon('join_processing') : user ? tCommon('logout') : tCommon('login')}
            </button>
          )}

          <div className="flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSwitchLocale(l.code)}
                aria-current={locale === l.code ? 'true' : undefined}
                className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${
                  locale === l.code
                    ? 'bg-white text-red-600'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #B71C1C 0%, #E53935 52%, #C62828 100%)' }}
      >
        {/* 배경 원형 장식 */}
        <div
          className="absolute top-0 right-0 rounded-full opacity-10"
          style={{ width: '300px', height: '300px', background: 'white', transform: 'translate(80px, -80px)' }}
        />
        <div
          className="absolute bottom-0 left-0 rounded-full opacity-10"
          style={{ width: '200px', height: '200px', background: 'white', transform: 'translate(-60px, 60px)' }}
        />

        {/* 네이비 바닥: 캐릭터가 딛고 설 지면이자 아래 지표 바와 이어지는 보조색 */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '160px',
            background: 'linear-gradient(to top, rgba(19,38,62,1) 0%, rgba(19,38,62,0.88) 25%, rgba(19,38,62,0.45) 60%, rgba(19,38,62,0) 100%)',
          }}
        />

        {/* 넓은 화면에서 텍스트와 캐릭터가 양 끝으로 벌어지지 않도록 묶어 가운데 정렬한다 */}
        <div
          className="relative mx-auto flex w-full max-w-[680px] items-center"
          style={{ minHeight: 'clamp(380px, 52vw, 520px)' }}
        >
          {/* 캐릭터: 히어로의 주인공. 오른쪽 바닥에 세운다.
              높이를 영역에 맞추므로 화면이 넓어져도 머리가 잘리지 않는다. */}
          <div
            className="absolute right-0 top-0 bottom-0 pointer-events-none select-none"
            style={{ width: 'min(50%, 290px)' }}
          >
            <Image
              src="/bestmario-character.webp"
              alt=""
              aria-hidden
              fill
              priority
              className="object-contain object-bottom"
              style={{ filter: 'drop-shadow(0 14px 20px rgba(9,20,34,0.35))' }}
              sizes="(max-width: 640px) 50vw, 290px"
            />
          </div>

          {/* 텍스트: 캐릭터 폭만큼 오른쪽을 비워 둔다 */}
          <div
            className="relative flex w-full flex-col gap-3 px-5 pt-7 pb-9"
            style={{ paddingRight: 'min(44%, 300px)', wordBreak: 'keep-all' }}
          >
            {/* 가맹점명이 서비스명과 다를 때만 윗줄에 표기한다 */}
            {merchant?.name && merchant.name !== t('hero_title') && (
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/70">
                {merchant.name}
              </span>
            )}

            <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-[1.1] drop-shadow-sm">
              {t('hero_title')}
            </h1>

            <p className="text-white/90 text-xs leading-relaxed">
              {t('hero_subtitle')}
            </p>

            {btPerVnd ? (
              <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-[11px] font-semibold w-fit">
                🎟️ {formatVND(btPerVnd)} = 1 BT
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-white/80 text-[11px] w-fit">
                🎟️ {t('bt_policy')}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => openRequestModal()}
                className="px-4 py-2.5 rounded-xl bg-white font-bold text-xs shadow-lg hover:shadow-xl active:scale-95 transition-all"
                style={{ color: 'var(--color-primary)' }}
              >
                {t('cta_request')}
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('services');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2.5 rounded-xl text-white font-bold text-xs active:scale-95 transition-all"
                style={{ background: 'var(--color-navy)' }}
              >
                {t('cta_quote')}
              </button>
            </div>

            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/75 font-medium">
              <li>✔ {t('trust_verified')}</li>
              <li>✔ {t('trust_warranty')}</li>
              <li>✔ {t('trust_multilang')}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Stats bar: 히어로의 네이비 바닥을 그대로 이어받는다 ── */}
      <div className="flex justify-around" style={{ background: 'var(--color-navy-deep)' }}>
        {[
          { num: '13', label: locale === 'vi' ? 'Lĩnh vực' : locale === 'en' ? 'Fields' : '서비스 분야' },
          { num: '160+', label: locale === 'vi' ? 'Hạng mục' : locale === 'en' ? 'Items' : '세부 항목' },
          { num: '24/7', label: locale === 'vi' ? 'Khẩn cấp' : locale === 'en' ? 'Emergency' : '긴급출동' },
          { num: '10%', label: locale === 'vi' ? 'Tích BT' : locale === 'en' ? 'BT Earn' : 'BT 적립' },
        ].map(({ num, label }) => (
          <div key={label} className="flex-1 text-center py-3 border-r last:border-r-0"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
            <span className="block text-lg font-extrabold text-white">{num}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/55">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Service section ── */}
      <section id="services" className="px-4 pb-8">
        {/* Search */}
        <div className="relative mt-4 mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-text-muted, #9494a4)' }}>🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveCategory(null); }}
            placeholder={
              locale === 'vi' ? 'Tìm dịch vụ (vd: điều hòa, rò rỉ, chuyển nhà…)' :
              locale === 'en' ? 'Search services (e.g. AC, leak, moving…)' :
              '서비스 검색 (예: 에어컨, 누수, 이사…)'
            }
            className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none transition-shadow"
            style={{
              background: 'var(--color-surface, #fff)',
              borderColor: 'var(--color-border, #ebebed)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveFilter(tab.id); setActiveCategory(null); }}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all border ${
                activeFilter === tab.id
                  ? 'text-white border-transparent'
                  : 'border-gray-200 hover:border-red-300'
              }`}
              style={activeFilter === tab.id
                ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }
                : { background: 'var(--color-surface, #fff)', color: 'var(--color-text-muted)' }
              }
            >
              {locale === 'vi' ? tab.labelVi : locale === 'en' ? tab.labelEn : tab.label}
            </button>
          ))}
        </div>

        {/* Section header */}
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
            {locale === 'vi' ? 'Lĩnh vực dịch vụ' : locale === 'en' ? 'Service Categories' : '서비스 분야'}
          </h2>
          <span className="text-xs" style={{ color: 'var(--color-text-muted, #9494a4)' }}>
            {filteredServices.length}{locale === 'vi' ? ' lĩnh vực' : locale === 'en' ? ' fields' : '개'}
          </span>
        </div>

        {filteredServices.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔎</div>
            <p className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              {locale === 'vi' ? 'Không có kết quả' : locale === 'en' ? 'No results found' : '검색 결과가 없습니다'}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {locale === 'vi' ? 'Thử từ khóa khác' : locale === 'en' ? 'Try a different keyword' : '다른 키워드로 검색해 보세요'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredServices.map((svc) => {
              const isActive = activeCategory === svc.id;
              return (
                <div key={svc.id} style={{ gridColumn: isActive ? '1 / -1' : undefined }}>
                  {/* Category card */}
                  <button
                    onClick={() => setActiveCategory(isActive ? null : svc.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all ${
                      isActive ? 'shadow-md' : 'hover:shadow-sm'
                    }`}
                    style={{
                      background: isActive ? 'var(--color-primary-bg, #FFEBEE)' : 'var(--color-surface, #fff)',
                      borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border, #ebebed)',
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-3xl mb-2 block">{svc.icon}</span>
                      <span
                        className="text-base transition-transform"
                        style={{
                          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          transform: isActive ? 'rotate(90deg)' : 'none',
                        }}
                      >›</span>
                    </div>
                    <div
                      className="font-bold text-xs leading-tight mb-1"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {getServiceLabel(svc)}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {svc.items.length}{locale === 'vi' ? ' mục' : locale === 'en' ? ' items' : '개 항목'}
                    </div>
                  </button>

                  {/* Expanded sub-items panel */}
                  {isActive && (
                    <div
                      className="rounded-2xl border mt-2 overflow-hidden"
                      style={{
                        borderColor: 'var(--color-primary)',
                        background: 'var(--color-surface, #fff)',
                      }}
                    >
                      {/* Panel header */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 border-b"
                        style={{
                          background: 'var(--color-primary-bg, #FFEBEE)',
                          borderColor: 'var(--color-primary)',
                        }}
                      >
                        <span className="text-xl">{svc.icon}</span>
                        <span className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
                          {getServiceLabel(svc)}
                        </span>
                      </div>

                      {/* Sub-items */}
                      <div className="flex flex-wrap gap-2 p-4">
                        {svc.items.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => openRequestModal(svc.id, getItemLabel(svc, idx))}
                            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all hover:border-red-400 hover:text-red-600"
                            style={{
                              background: 'var(--color-bg, #f7f7f8)',
                              borderColor: 'var(--color-border, #ebebed)',
                              color: 'var(--color-text-2, #5c5c6e)',
                            }}
                          >
                            <span style={{ color: 'var(--color-text-muted)' }}>◦</span>
                            {getItemLabel(svc, idx)}
                          </button>
                        ))}
                      </div>

                      {/* CTA */}
                      <div className="px-4 pb-4">
                        <button
                          onClick={() => openRequestModal(svc.id)}
                          className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-95"
                          style={{ background: 'var(--color-primary)' }}
                        >
                          {svc.icon} {locale === 'vi' ? 'Yêu cầu báo giá →' : locale === 'en' ? 'Request Quote →' : '견적 요청하기 →'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Trust badges ── */}
      <section className="px-4 py-4 flex justify-center">
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {[
            { icon: '✅', label: t('trust_verified') },
            { icon: '🛡️', label: t('trust_warranty') },
            { icon: '💬', label: t('trust_multilang') },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 p-3 rounded-xl text-center"
              style={{ background: 'var(--color-surface, #f9f9f9)' }}
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium leading-tight" style={{ color: 'var(--color-text-2)' }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── BT Policy ── */}
      <section className="mx-4 mb-6 rounded-2xl p-5" style={{ background: '#FFF8E1' }}>
        <h2 className="font-bold text-sm text-amber-900 mb-2">🎟️ {t('bt_policy')}</h2>
        <p className="text-xs text-amber-800 leading-relaxed">{t('bt_description')}</p>
        {btPerVnd ? (
          <p className="mt-2 text-xs font-bold text-amber-900">
            {formatVND(btPerVnd)} = 1 BT · {t('bt_stock')}: {btStock.toLocaleString()}
          </p>
        ) : null}
      </section>

      {/* ── BestClub join CTA ── */}
      {!user && (
        <section
          className="mx-4 mb-6 rounded-2xl p-6 text-center"
          style={{ background: 'var(--color-primary)' }}
        >
          <h2 className="font-bold text-white text-base mb-1">{t('join_title')}</h2>
          <p className="text-white/80 text-xs mb-4">{t('join_subtitle')}</p>
          <button
            onClick={handleLogin}
            className="px-6 py-2.5 rounded-xl bg-white font-bold text-red-600 text-sm hover:shadow-lg transition-shadow"
          >
            {tCommon('login')}
          </button>
        </section>
      )}

      {/* ── Webzine ── */}
      {!webzinesLoading && webzines.length > 0 && (
        <section className="px-4 pb-6">
          <h2 className="text-base font-bold mb-3" style={{ color: 'var(--color-text)' }}>
            {t('webzine_title')}
          </h2>
          <div className="flex flex-col gap-3">
            {webzines.map((w) => (
              <article
                key={w.id}
                className="rounded-xl border p-4 flex gap-3 items-start"
                style={{
                  background: 'var(--color-surface, #fff)',
                  borderColor: 'var(--color-border, #ebebed)',
                }}
              >
                {w.thumbnail_url && (
                  <img
                    src={w.thumbnail_url}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold line-clamp-2" style={{ color: 'var(--color-text)' }}>{w.title}</h3>
                  {w.summary && (
                    <p className="mt-1 text-xs line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{w.summary}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Area links ── */}
      <section className="px-4 pb-8">
        <h2 className="text-sm font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {t('area_title')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            { slug: 'my-dinh', label: 'Mỹ Đình' },
            { slug: 'keangnam-trung-hoa', label: 'Keangnam / Trung Hòa' },
            { slug: 'tay-ho', label: 'Tây Hồ' },
            { slug: 'cau-giay', label: 'Cầu Giấy' },
          ].map(({ slug, label }) => (
            <a
              key={slug}
              href={`/${locale}/area/${slug}`}
              className="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors hover:border-red-300 hover:text-red-600"
              style={{
                borderColor: 'var(--color-border, #e5e7eb)',
                color: 'var(--color-text-2)',
              }}
            >
              📍 {label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto px-4 py-8 text-center border-t" style={{ borderColor: 'var(--color-border, #f0f0f0)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          BestMario — BestClub Franchise Channel
          <br />
          Hà Nội, Vietnam · {t('tagline')}
        </p>
      </footer>

      {/* ── Sticky CTA ── */}
      <div
        className="sticky bottom-0 z-50 px-4 py-3 border-t"
        style={{
          background: 'var(--color-surface, #fff)',
          borderColor: 'var(--color-border, #ebebed)',
        }}
      >
        <button
          onClick={() => openRequestModal()}
          className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white flex items-center justify-center gap-2 shadow-lg transition-opacity hover:opacity-90 active:scale-99"
          style={{
            background: 'linear-gradient(135deg, #B71C1C 0%, #E53935 100%)',
            boxShadow: '0 4px 14px rgba(229,57,53,.35)',
          }}
        >
          <span>⚡</span>
          {locale === 'vi' ? 'Yêu cầu dịch vụ ngay' : locale === 'en' ? 'Request Service Now' : '지금 바로 서비스 신청'}
        </button>
      </div>

      {/* ── Quote Request Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end"
          style={{ background: 'rgba(26,26,31,0.48)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full rounded-t-3xl px-5 pb-8 pt-0 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--color-surface, #fff)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full" style={{ background: 'var(--color-border, #ebebed)' }} />
            </div>

            <h2 className="text-lg font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
              {modalItem ||
                (locale === 'vi' ? 'Yêu cầu báo giá' : locale === 'en' ? 'Service Quote Request' : '서비스 견적 요청')}
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
              {locale === 'vi' ? 'Nhập thông tin và lịch hẹn của bạn' :
               locale === 'en' ? 'Enter your details and preferred schedule' :
               '서비스 정보와 방문 일정을 입력해 주세요'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {locale === 'vi' ? 'Lĩnh vực dịch vụ' : locale === 'en' ? 'Service Category' : '서비스 분야'}
                </label>
                <select
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--color-bg, #f7f7f8)',
                    borderColor: 'var(--color-border, #ebebed)',
                    color: 'var(--color-text)',
                  }}
                  value={modalService}
                  onChange={(e) => setModalService(e.target.value)}
                >
                  <option value="">
                    {locale === 'vi' ? '-- Chọn lĩnh vực --' : locale === 'en' ? '-- Select category --' : '-- 선택해주세요 --'}
                  </option>
                  {BESTMARIO_SERVICES.map((svc) => (
                    <option key={svc.id} value={svc.id}>{getServiceLabel(svc)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {locale === 'vi' ? 'Số điện thoại' : locale === 'en' ? 'Phone Number' : '연락처'}
                </label>
                <input
                  type="tel"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  placeholder={locale === 'vi' ? '0123 456 789' : '010-0000-0000'}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--color-bg, #f7f7f8)',
                    borderColor: 'var(--color-border, #ebebed)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {locale === 'vi' ? 'Địa chỉ' : locale === 'en' ? 'Address' : '방문 주소'}
                </label>
                <input
                  type="text"
                  value={modalAddress}
                  onChange={(e) => setModalAddress(e.target.value)}
                  placeholder={
                    locale === 'vi' ? 'VD: Mỹ Đình, Hà Nội, tòa A, căn 1001' :
                    locale === 'en' ? 'e.g. My Dinh, Hanoi, Bldg A, Apt 1001' :
                    '예: 하노이 미딩 OO아파트 101동 1001호'
                  }
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--color-bg, #f7f7f8)',
                    borderColor: 'var(--color-border, #ebebed)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {locale === 'vi' ? 'Ngày & giờ mong muốn' : locale === 'en' ? 'Preferred Date & Time' : '방문 희망 일시'}
                </label>
                <input
                  type="datetime-local"
                  value={modalSchedule}
                  onChange={(e) => setModalSchedule(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{
                    background: 'var(--color-bg, #f7f7f8)',
                    borderColor: 'var(--color-border, #ebebed)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {locale === 'vi' ? 'Yêu cầu chi tiết' : locale === 'en' ? 'Details' : '요청 사항'}
                </label>
                <textarea
                  rows={3}
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder={
                    locale === 'vi' ? 'Mô tả chi tiết (địa điểm, triệu chứng, ghi chú…)' :
                    locale === 'en' ? 'Describe the issue (location, symptoms, notes…)' :
                    '상세 내용을 입력해주세요 (위치, 증상, 특이사항 등)'
                  }
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none"
                  style={{
                    background: 'var(--color-bg, #f7f7f8)',
                    borderColor: 'var(--color-border, #ebebed)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            {modalError && (
              <p className="mt-4 text-xs font-semibold" style={{ color: '#D32F2F' }}>{modalError}</p>
            )}

            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {locale === 'vi'
                ? 'Kỹ thuật viên sẽ gửi báo giá (tối đa 5). Bạn chọn một báo giá rồi thanh toán.'
                : locale === 'en'
                  ? 'Technicians will send quotes (up to 5). You pick one, then pay.'
                  : '기술자가 견적을 제출합니다(최대 5건). 견적을 선택한 뒤 결제합니다.'}
            </p>

            <button
              onClick={handleSubmitQuoteRequest}
              disabled={submitting}
              className="w-full mt-3 rounded-2xl py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {submitting
                ? (locale === 'vi' ? 'Đang gửi…' : locale === 'en' ? 'Sending…' : '전송 중…')
                : (locale === 'vi' ? 'Gửi yêu cầu báo giá →' : locale === 'en' ? 'Send Quote Request →' : '견적 요청 보내기 →')}
            </button>
            <button
              onClick={() => { setShowModal(false); router.push(`/${locale}/order/new`); }}
              className="w-full mt-2 py-2.5 text-sm font-semibold underline underline-offset-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {locale === 'vi' ? 'Hoặc đặt ngay theo giá cố định →' :
               locale === 'en' ? 'Or book a fixed-price item now →' :
               '또는 고정가 항목으로 바로 예약 →'}
            </button>
            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-1 py-2.5 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {locale === 'vi' ? 'Hủy' : locale === 'en' ? 'Cancel' : '취소'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
