import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed' },
];

const difficultyLabel = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed',
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
};

const formatRelativeTime = (date, rtf) => {
  if (!date) return '—';
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const units = [
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];
  for (const { unit, seconds } of units) {
    if (absSeconds >= seconds || unit === 'second') {
      const value = Math.round(diffSeconds / seconds);
      return rtf.format(value, unit);
    }
  }
  return '—';
};

const getDifficultyClasses = (difficulty) => {
  if (!difficultyLabel[difficulty]) {
    return 'difficulty-badge difficulty-unknown';
  }
  return `difficulty-badge difficulty-${difficulty}`;
};

const extractIndexLink = (message) => {
  if (typeof message !== 'string') return null;
  const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s"]+/);
    return match ? match[0] : null;
};

const buildQueryVariants = (baseRef, filter) => [
  {
    name: 'primary',
    build: () =>
      filter === 'all'
        ? query(baseRef, orderBy('score', 'desc'), orderBy('updatedAt', 'desc'), limit(20))
        : query(
            baseRef,
            where('difficulty', '==', filter),
            orderBy('score', 'desc'),
            orderBy('updatedAt', 'desc'),
            limit(20)
          ),
  },
  {
    name: 'noUpdatedAt',
    build: () =>
      filter === 'all'
        ? query(baseRef, orderBy('score', 'desc'), limit(20))
        : query(baseRef, where('difficulty', '==', filter), orderBy('score', 'desc'), limit(20)),
  },
  {
    name: 'nameOnly',
    build: () =>
      filter === 'all'
        ? query(baseRef, orderBy('__name__'), limit(20))
        : query(baseRef, where('difficulty', '==', filter), orderBy('__name__'), limit(20)),
  },
];

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [activeVariant, setActiveVariant] = useState('primary');
  const [indexLink, setIndexLink] = useState(null);
  const rtf = useMemo(() => new Intl.RelativeTimeFormat('ja-JP', { numeric: 'auto' }), []);

  const unsubscribeRef = useRef(() => {});
  const lastErrorRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    setIndexLink(null);
    lastErrorRef.current = null;

    const baseRef = collection(db, 'scores');
    const variants = buildQueryVariants(baseRef, filter);

    const cleanup = () => {
      try {
        unsubscribeRef.current();
      } catch (err) {
        // ignore
      }
    };

    const handleError = (variantName, err) => {
      console.error('[leaderboard]', {
        phase: 'query',
        variant: variantName,
        code: err?.code,
        message: err?.message,
        err,
      });
      lastErrorRef.current = err;
      const link = extractIndexLink(err?.message);
      if (link) {
        setIndexLink(link);
        console.info('[leaderboard] Firestore index suggestion', link);
      }
    };

    const attemptVariant = (index) => {
      if (disposed) return;
      if (index >= variants.length) {
        const err = lastErrorRef.current;
        setError(err || new Error('Failed to build leaderboard query.'));
        setLoading(false);
        return;
      }

      const variant = variants[index];
      let builtQuery;
      try {
        builtQuery = variant.build();
      } catch (err) {
        handleError(variant.name, err);
        attemptVariant(index + 1);
        return;
      }

      try {
        const unsubscribe = onSnapshot(
          builtQuery,
          (snapshot) => {
            if (disposed) return;
            const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setRows(docs);
            setActiveVariant(variant.name);
            setError(null);
            setLoading(false);
          },
          (err) => {
            handleError(variant.name, err);
            unsubscribe();
            if (disposed) return;
            attemptVariant(index + 1);
          }
        );
        unsubscribeRef.current = unsubscribe;
      } catch (err) {
        handleError(variant.name, err);
        attemptVariant(index + 1);
      }
    };

    attemptVariant(0);

    return () => {
      disposed = true;
      cleanup();
    };
  }, [filter]);

  if (loading) {
    return <div>Loading leaderboard...</div>;
  }

  if (error) {
    const code = error?.code || 'unknown';
    const message = error?.message || 'Unable to load data.';
    return (
      <div style={{ marginTop: 24 }}>
        <h3>🏆 Leaderboard</h3>
        <div>Failed to load leaderboard.</div>
        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
          ({code}) {message}
        </div>
        {indexLink && (
          <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
            <a href={indexLink} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
              Firestore インデックスの作成リンク
            </a>
          </div>
        )}
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
          管理者の方は Firestore のインデックス設定、データ型、ネットワーク状態を確認してください。
        </div>
      </div>
    );
  }

  const formatRowDifficulty = (value) => difficultyLabel[value] || '—';

  return (
    <div style={{ marginTop: 24 }}>
      <h3>🏆 Leaderboard</h3>
      <div className="leaderboard-filters">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`btn ${filter === value ? 'primary' : 'ghost'}`.trim()}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="leaderboard-table-wrapper">
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>
          クエリバリアント: {activeVariant}
        </div>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nickname</th>
              <th>Score</th>
              <th>IQ</th>
              <th>Difficulty</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '16px' }}>
                  まだスコアがありません。
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const nickname = row.nickname || 'ゲスト';
                const scoreValue = Number(row.score);
                const score = Number.isFinite(scoreValue) ? scoreValue : 0;
                const iqValue = Number(row.iq);
                const iq = Number.isFinite(iqValue) ? iqValue.toFixed(1) : '—';
                const difficultyValue = row.difficulty || null;
                const updatedAt = formatRelativeTime(toDate(row.updatedAt) || toDate(row.createdAt), rtf);

                return (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>{nickname}</td>
                    <td>{score}</td>
                    <td>{iq}</td>
                    <td>
                      <span className={getDifficultyClasses(difficultyValue)}>
                        {formatRowDifficulty(difficultyValue)}
                      </span>
                    </td>
                    <td>{updatedAt}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
