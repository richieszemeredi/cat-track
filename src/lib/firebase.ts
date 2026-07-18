import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

/** True when running against the local Firebase emulators (dev/e2e). */
export const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === 'true'

const firebaseConfig = isEmulatorMode
  ? {
      // Any non-empty values work against the emulator's demo project.
      apiKey: 'demo-api-key',
      authDomain: 'demo-cattrack.firebaseapp.com',
      projectId: 'demo-cattrack',
      appId: 'demo-app-id',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    }

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Offline-first: persistent IndexedDB cache, multi-tab safe. The cache is
// disposable — cloud is the source of truth (iOS may evict IndexedDB).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (isEmulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
