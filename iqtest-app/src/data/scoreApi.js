import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const MAX_NICKNAME_LENGTH = 24;
const MAX_SCORE = 9999;

const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return '';
  return nickname.trim();
};

export async function saveScore({ nickname, score }) {
  const cleanNickname = sanitizeNickname(nickname);
  if (!cleanNickname || cleanNickname.length > MAX_NICKNAME_LENGTH) {
    throw new Error('invalid nickname');
  }
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new Error('invalid score');
  }

  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid) {
    throw new Error('not signed in');
  }

  const ref = doc(db, 'scores', uid);
  const snapshot = await getDoc(ref);
  const existed = snapshot.exists();

  const payload = {
    nickname: cleanNickname,
    score,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload, { merge: true });
  return { ok: true, updated: existed };
}
