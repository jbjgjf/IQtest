import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCmYq0UfxdJsMrGtCd2YnUJYx6x4IoGKho",
  authDomain: "ingest-app-7ed1a.firebaseapp.com",
  projectId: "ingest-app-7ed1a",
  storageBucket: "ingest-app-7ed1a.firebasestorage.app",
  messagingSenderId: "282908775712",
  appId: "1:282908775712:web:705d3624f4655cd9733345",
  measurementId: "G-SSSNEJ06VZ",
};

export const app = initializeApp(firebaseConfig);

const resolveAnalytics = () => {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  return analyticsSupported()
    .then((supported) => (supported ? getAnalytics(app) : null))
    .catch(() => null);
};

export const analyticsPromise = resolveAnalytics();

export let analytics = null;

analyticsPromise.then((instance) => {
  analytics = instance;
});

export const db = getFirestore(app);
export const auth = getAuth(app);

if (typeof window !== "undefined") {
  signInAnonymously(auth).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[firebase] Anonymous sign-in failed", error);
  });
}
