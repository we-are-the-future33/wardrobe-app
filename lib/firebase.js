// lib/firebase.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ── Auth ─────────────────────────────────────────
export const signInWithGoogle = () => signInWithPopup(auth, provider);
export const signOutUser = () => signOut(auth);
export { auth };

// ── Firestore helpers ────────────────────────────
const userDoc = (uid) => doc(db, 'users', uid);

export const loadUserData = async (uid) => {
  try {
    const snap = await getDoc(userDoc(uid));
    if (snap.exists()) return snap.data();
    return null;
  } catch(e) { console.error('loadUserData 실패:', e); return null; }
};

export const saveUserData = async (uid, data) => {
  try {
    await setDoc(userDoc(uid), data, { merge: true });
  } catch(e) { console.error('saveUserData 실패:', e); }
};

// 개별 필드 업데이트 (clothes, settings, weekOutfits 등)
export const updateUserField = async (uid, field, value) => {
  try {
    // Firestore 문서 크기 제한(1MB) 때문에 이미지는 제거 후 저장
    let toSave = value;
    if (field === 'clothes') {
      toSave = value.map(c => {
        const { image, ...rest } = c;
        return { ...rest, hasImage: !!image };
      });
    }
    await setDoc(userDoc(uid), { [field]: toSave }, { merge: true });
  } catch(e) { console.error(`updateUserField(${field}) 실패:`, e); }
};
