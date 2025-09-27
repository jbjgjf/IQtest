import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const MAX_NICKNAME_LENGTH = 24;
const MAX_SCORE = 9999;
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'];

export const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return '';
  return nickname.trim().replace(/\s+/g, ' ');
};

export const validateScorePayload = ({ nickname, score, difficulty, iq }) => {
  const cleanNickname = sanitizeNickname(nickname);
  if (!cleanNickname || cleanNickname.length > MAX_NICKNAME_LENGTH) {
    throw new Error('invalid nickname');
  }
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new Error('invalid score');
  }
  if (!ALLOWED_DIFFICULTIES.includes(difficulty)) {
    throw new Error('invalid difficulty');
  }
  const iqNumber = Number(iq);
  if (!Number.isFinite(iqNumber)) {
    throw new Error('invalid iq');
  }
  return { nickname: cleanNickname, score, difficulty, iq: iqNumber };
};

const docIdFor = (uid, difficulty) => `${uid}_${difficulty}`;

export async function saveScore({ nickname, score, difficulty, iq, now = serverTimestamp() }) {
  const { nickname: cleanNickname, score: validScore, difficulty: validDifficulty, iq: validIq } =
    validateScorePayload({ nickname, score, difficulty, iq });

  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid) {
    throw new Error('not signed in');
  }

  const ref = doc(db, 'scores', docIdFor(uid, validDifficulty));
  const snapshot = await getDoc(ref);
  const existed = snapshot.exists();

  const payload = {
    uid,
    nickname: cleanNickname,
    score: validScore,
    difficulty: validDifficulty,
    iq: validIq,
    updatedAt: now,
  };

  if (!existed) {
    payload.createdAt = now;
  }

  await setDoc(ref, payload, { merge: true });
  return { existed };
}
