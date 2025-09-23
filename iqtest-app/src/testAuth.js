import { auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';

async function verifyAnonymousAuth() {
  try {
    const credential = await signInAnonymously(auth);
    const { user } = credential;
    console.log('[testAuth] Firebase currentUser:', user?.uid ?? 'unknown');
    return user;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[testAuth] Anonymous sign-in failed', error);
    throw error;
  }
}

if (typeof window !== 'undefined') {
  verifyAnonymousAuth();
}

export default verifyAnonymousAuth;
