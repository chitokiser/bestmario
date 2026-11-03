// Supabase DB 테이블 타입 — supabase/migrations/001_schema.sql 과 1:1 대응
// 스키마 변경 시 이 파일도 함께 수정할 것

export type OrderType = 'fixed' | 'customer_bid' | 'quote_request';
export type OrderStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
export type PaymentMethod = 'vietqr' | 'momo' | 'bm' | 'cash';
export type PaymentStatus = 'held' | 'completed' | 'refunded';
export type UserRole = 'customer' | 'technician' | 'admin';
export type TechnicianStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type QuotationStatus = 'submitted' | 'accepted' | 'rejected';
export type WarrantyStatus = 'active' | 'claimed' | 'closed';
export type DisputeStatus = 'open' | 'investigating' | 'resolved';

export interface DbUser {
  uid: string;
  role: UserRole;
  name: string;
  phone: string;
  lang: string;
  created_at: string;
}

export interface TechnicianProfile {
  uid: string;
  status: TechnicianStatus;
  skills: string[];
  documents: Record<string, string>;
  rating: number;
  rating_count: number;
  experience_years: number | null;
  career: string;
  bio: string;
  submitted_at: string | null;
  reject_reason: string;
}

export interface ServiceCategory {
  id: string;
  name_ko: string;
  name_vi: string;
  name_en: string;
  icon: string;
}

export interface ServiceProduct {
  id: string;
  category_id: string;
  name_ko: string;
  name_vi: string;
  base_price: number;
  description: string;
  bid_allowed: boolean;
}

export interface ServiceOrder {
  id: string;
  customer_uid: string;
  technician_uid: string | null;
  category_id: string;
  product_id: string | null;
  order_type: OrderType;
  status: OrderStatus;
  address: string;
  scheduled_at: string;
  photos_before: string[];
  photos_after: string[];
  note: string;
  offered_price: number | null;
  created_at: string;
}

export interface Quotation {
  id: string;
  order_id: string;
  technician_uid: string;
  price: number;
  duration_min: number;
  note: string;
  status: QuotationStatus;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  /** 스펙 §10 중복 결제 방지 키. 혼합 결제는 수단별로 다른 값을 쓴다. */
  idempotency_key: string | null;
  paid_at: string;
}

export interface Settlement {
  id: string;
  order_id: string;
  technician_uid: string;
  gross_amount: number;
  /** BestClub 에스크로로 들어온 금액. BestClub 수수료가 이미 차감된 상태라 플랫폼 수수료를 다시 적용하지 않는다. */
  bm_amount: number;
  fee_rate: number;
  net_amount: number;
  settled_at: string;
}

export interface Warranty {
  id: string;
  order_id: string;
  expires_at: string;
  status: WarrantyStatus;
}

export interface Dispute {
  id: string;
  order_id: string;
  reason: string;
  status: DisputeStatus;
  resolved_at: string | null;
}

export interface Message {
  id: string;
  order_id: string;
  sender_uid: string;
  content: string;
  translated_content: string | null;
  created_at: string;
}

// 관리자 설정 (BM→VND 환산율 등) — key/value 단일 테이블
export interface ServiceSetting {
  key: string;
  value: string;
}

export interface Database {
  users: DbUser;
  technician_profiles: TechnicianProfile;
  service_categories: ServiceCategory;
  service_products: ServiceProduct;
  service_orders: ServiceOrder;
  quotations: Quotation;
  payments: Payment;
  settlements: Settlement;
  warranties: Warranty;
  disputes: Dispute;
  messages: Message;
  service_settings: ServiceSetting;
}

export type SkillRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SkillRequest {
  id: string;
  uid: string;
  category_id: string;
  note: string;
  status: SkillRequestStatus;
  reject_reason: string;
  created_at: string;
  decided_at: string | null;
}
