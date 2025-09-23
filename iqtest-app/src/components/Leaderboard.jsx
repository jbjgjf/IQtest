import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(20));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setRows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        },
        (err) => {
          setError(err);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div>Loading leaderboard...</div>;
  }

  if (error) {
    return <div>Failed to load leaderboard</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3>🏆 Leaderboard</h3>
      <ol>
        {rows.map((row, index) => (
          <li key={row.id}>
            {index + 1}. {row.nickname || 'ゲスト'} — {row.score ?? 0}
          </li>
        ))}
      </ol>
    </div>
  );
}
