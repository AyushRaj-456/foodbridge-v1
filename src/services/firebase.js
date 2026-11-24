import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  addDoc,
  deleteDoc,
  limit,
  arrayUnion,
  orderBy
} from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBGOuoeL8JEfLZkwfBpjd4QybUftwTI_W8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'foodbridge-v1.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'foodbridge-v1',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'foodbridge-v1.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '783857884676',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:783857884676:web:305a976d7009e9d6911f51'
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Initialize Firestore with forced long polling to eliminate the WebChannel stream hang on Windows/proxied networks
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Connect to Local Firebase Emulators in development/testing mode (Zero Cost)
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' ||
                    (typeof window !== 'undefined' && window.location.hostname === 'localhost' && !import.meta.env.VITE_FIREBASE_API_KEY);

if (useEmulator && typeof window !== 'undefined') {
  // Prevent duplicate emulator connections
  if (!window._firebaseEmulatorsConnected) {
    try {
      const authHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';
      const authPort = import.meta.env.VITE_FIREBASE_AUTH_PORT || 9099;
      const firestorePort = import.meta.env.VITE_FIREBASE_FIRESTORE_PORT || 8080;
      const storagePort = import.meta.env.VITE_FIREBASE_STORAGE_PORT || 9199;

      connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
      connectFirestoreEmulator(db, authHost, Number(firestorePort));
      connectStorageEmulator(storage, authHost, Number(storagePort));
      window._firebaseEmulatorsConnected = true;
    } catch (e) {
      // In fast reload or vitest environments, emulator connection might already be bound
      console.warn('Firebase emulator connection check:', e.message);
    }
  }
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  addDoc,
  deleteDoc,
  limit,
  arrayUnion,
  orderBy,
  ref,
  uploadBytes,
  getDownloadURL
};
