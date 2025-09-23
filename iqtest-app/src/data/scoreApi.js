import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function saveScore({ nickname, score }) {
  const trimmed = typeof nickname === 'string' ? nickname.trim() : '';
  if (!trimmed || trimmed.length < 1 || trimmed.length > 24) {
    throw new Error('ニックネームは1〜24文字で入力してください');
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0) {
    throw new Error('スコアが正しくありません');
  }

  try {
    await addDoc(collection(db, 'scores'), {
      nickname: trimmed,
      score: numericScore,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save score', error);
    throw error;
  }
}
