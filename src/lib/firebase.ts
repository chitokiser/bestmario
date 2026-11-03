import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
// BestClub(jumper-b15aa)의 모든 Cloud Function 은 us-central1 에 배포되어 있다.
// (`firebase functions:list --project jumper-b15aa` 기준 275개 전부 us-central1,
//  functions v2 onCall 에 region 지정이 없어 기본값이 적용됨)
// asia-northeast3 으로 두면 merchantMemberJoin·payServiceJobEscrow·releaseEscrow
// 호출이 모두 not-found 로 실패한다 — 멘토 자동 지정이 조용히 실패해 온 원인.
export const functions = getFunctions(app, 'us-central1');

// 에뮬레이터 연결 — 신규 앱 초기화 시 한 번만, NEXT_PUBLIC_USE_EMULATOR=true 일 때만
if (
  isNewApp &&
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_EMULATOR === 'true'
) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export const callMerchantMemberJoin = (merchantId: string) =>
  httpsCallable(functions, 'merchantMemberJoin')({ merchantId });

export const callPayServiceJobEscrow = (
  merchantId: string,
  serviceJobId: string,
  amountVnd: number
) => httpsCallable(functions, 'payServiceJobEscrow')({ merchantId, serviceJobId, amountVnd });

export const callReleaseEscrow = (serviceJobId: string) =>
  httpsCallable(functions, 'releaseEscrow')({ serviceJobId });
