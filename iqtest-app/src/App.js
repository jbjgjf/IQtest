import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import questionBank, { parseCell, shuffleArray } from './questions';
import MatrixItem, { MatrixCellThumb } from './components/MatrixItem';
import { Analytics } from '@vercel/analytics/react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const erf = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t;
  const expTerm = Math.exp(-absX * absX);
  const result = 1 - poly * expTerm;
  return sign * result;
};

const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

function App() {
  const QUESTION_TIME = 30;

  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [remaining, setRemaining] = useState(QUESTION_TIME);
  const [feedback, setFeedback] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState(() => shuffleArray(questionBank[0].options));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [sharedResult, setSharedResult] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const intervalRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const optionRefs = useRef([]);

  const total = questionBank.length;
  const currentQuestion = questionBank[current];
  const progressPct = Math.round(((finished ? total : current) / total) * 100);
  const timerProgressDeg = Math.max(0, Math.min(360, (remaining / QUESTION_TIME) * 360));

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearFeedbackTimeout = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('iqtest:last');
      if (stored) {
        const parsed = JSON.parse(stored);
        setLastResult(parsed);
      }
    } catch (error) {
      // noop: localStorage unavailable or corrupted data
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const hasBeacon = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
    console.log('[analytics] production mode. navigator.sendBeacon =', hasBeacon);
    const img = new Image();
    img.src = '/_vercel/insights/script.js';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    const t = params.get('t');
    const iq = params.get('iq');
    const p = params.get('p');
    if (s && t && iq && p) {
      setSharedResult({ score: s, total: t, iqRange: iq, percentile: p });
    }
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  const advanceQuestion = useCallback(() => {
    setCurrent((prev) => {
      const next = prev + 1;
      if (next < total) {
        return next;
      }
      setFinished(true);
      return prev;
    });
  }, [total]);

  useEffect(() => {
    optionRefs.current = [];
  }, [current, shuffledOptions.length]);

  useEffect(() => {
    if (!finished) {
      setShuffledOptions(shuffleArray(questionBank[current].options));
    }
  }, [current, finished]);

  useEffect(() => () => {
    stopTimer();
    clearFeedbackTimeout();
  }, [stopTimer, clearFeedbackTimeout]);

  useEffect(() => {
    stopTimer();
    clearFeedbackTimeout();

    if (finished) {
      setRemaining(0);
      setAnswerLocked(false);
      setFeedback(null);
      setSelectedOption(null);
      return;
    }

    setRemaining(QUESTION_TIME);
    setAnswerLocked(false);
    setSelectedOption(null);
    setFeedback(null);

    const onTimeout = () => {
      setElapsedSeconds((prev) => prev + QUESTION_TIME);
      setAnswerLocked(true);
      setFeedback('timeout');
      clearFeedbackTimeout();
      feedbackTimeoutRef.current = setTimeout(() => {
        setFeedback(null);
        setSelectedOption(null);
        setAnswerLocked(false);
        advanceQuestion();
        feedbackTimeoutRef.current = null;
      }, 300);
    };

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      stopTimer();
    };
  }, [current, finished, stopTimer, clearFeedbackTimeout, advanceQuestion, QUESTION_TIME]);

  const handleAnswer = (option) => {
    if (answerLocked || finished) return;

    const isCorrect = option === currentQuestion.answer;
    const timeSpent = clamp(QUESTION_TIME - remaining, 0, QUESTION_TIME);

    stopTimer();
    clearFeedbackTimeout();
    setAnswerLocked(true);
    setSelectedOption(option);
    setFeedback(isCorrect ? 'correct' : 'wrong');
    setElapsedSeconds((prev) => prev + timeSpent);

    if (isCorrect) {
      setScore((s) => s + 1);
    }

    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      setSelectedOption(null);
      setAnswerLocked(false);
      advanceQuestion();
      feedbackTimeoutRef.current = null;
    }, 300);
  };

  const handleOptionKeyDown = (event, index) => {
    if (finished) return;

    const len = shuffledOptions.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (index + 1) % len;
      const nextBtn = optionRefs.current[nextIndex];
      if (nextBtn) nextBtn.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (index - 1 + len) % len;
      const prevBtn = optionRefs.current[prevIndex];
      if (prevBtn) prevBtn.focus();
    } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space') {
      event.preventDefault();
      handleAnswer(shuffledOptions[index]);
    }
  };

  const reset = () => {
    stopTimer();
    clearFeedbackTimeout();
    setCurrent(0);
    setScore(0);
    setFinished(false);
    setRemaining(QUESTION_TIME);
    setFeedback(null);
    setSelectedOption(null);
    setAnswerLocked(false);
    setElapsedSeconds(0);
    setShuffledOptions(shuffleArray(questionBank[0].options));
    setToastMessage('');
  };

  const ratio = score / total;
  let resultClass = 'result-average';
  let resultMessage = '平均以上。練習を重ねるとさらに安定します。';
  if (ratio >= 0.9) {
    resultClass = 'result-excellent';
    resultMessage = '上位10%レベル。素晴らしい集中力とパターン認識力です。';
  } else if (ratio < 0.6) {
    resultClass = 'result-learn';
    resultMessage = '数列や図形の規則性を意識して練習してみましょう。';
  }

  const totalSeconds = elapsedSeconds;
  const expectedTotal = total * QUESTION_TIME || QUESTION_TIME;
  const accuracyFactor = ratio * 2 - 1;
  const rawTimeFactor = 1.0 + (0.5 - (expectedTotal ? totalSeconds / expectedTotal : 0)) * 0.15;
  const timeFactor = clamp(rawTimeFactor, 0.85, 1.15);
  const zApprox = clamp(accuracyFactor * 0.9 * timeFactor, -3, 3);
  const estimatedIQ = Math.round(100 + 15 * zApprox);
  const iqLow = estimatedIQ - 5;
  const iqHigh = estimatedIQ + 5;
  const percentile = clamp(Math.round(100 * (1 - normCdf(zApprox))), 0, 100);

  useEffect(() => {
    if (!finished) return;
    if (typeof window === 'undefined') return;
    const iqRange = `${iqLow}–${iqHigh}`;
    const payload = {
      score,
      total,
      z: zApprox,
      IQrange: iqRange,
      percentile,
      elapsedSeconds: totalSeconds,
      timestamp: Date.now(),
    };
    try {
      window.localStorage.setItem('iqtest:last', JSON.stringify(payload));
      setLastResult(payload);
    } catch (error) {
      // noop: storage might be disabled
    }
  }, [finished, score, total, zApprox, iqLow, iqHigh, percentile, totalSeconds]);

  const handleShare = async () => {
    if (!finished || typeof window === 'undefined') return;
    const params = new URLSearchParams({
      s: String(score),
      t: String(total),
      iq: `${iqLow}–${iqHigh}`,
      p: String(percentile),
    });
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastMessage('URLをコピーしました');
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage('');
        toastTimeoutRef.current = null;
      }, 3000);
    } catch (error) {
      setToastMessage('URLのコピーに失敗しました');
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage('');
        toastTimeoutRef.current = null;
      }, 4000);
    }
  };

  const dismissSharedResult = () => {
    setSharedResult(null);
    if (typeof window === 'undefined') return;
    const nextUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  return (
    <div className="app">
      <div className="wrap">
        <header className="header">
          <h1 className="title">ミニIQテスト（デモ）</h1>
          <div className="pills">
            <span className="pill">非言語・数列</span>
            <span className="pill">合計 {total} 問</span>
          </div>
        </header>

        {lastResult && (
          <p className="note previous-result">
            前回: {lastResult.score}/{lastResult.total}（推定IQ: {lastResult.IQrange}・上位{lastResult.percentile}%）
          </p>
        )}

        {sharedResult && (
          <div className="card center shared-result-card">
            <button
              type="button"
              className="shared-result-close"
              onClick={dismissSharedResult}
              aria-label="共有結果を閉じる"
            >
              ×
            </button>
            <div className="score">共有された結果</div>
            <p className="note">
              {sharedResult.score}/{sharedResult.total}（推定IQ: {sharedResult.iqRange}・上位{sharedResult.percentile}%）
            </p>
          </div>
        )}

        <div className="progress">
          <div className="progress-track">
            <div className="bar" aria-hidden="true">
              <i style={{ width: `${progressPct}%` }} />
            </div>
            {!finished && (
              <div
                className={`timer ${remaining <= 5 ? 'urgent' : ''} ${feedback === 'timeout' ? 'timeout' : ''}`.trim()}
                aria-label={`残り${remaining}秒`}
                aria-live="polite"
                style={{ '--progress-deg': `${timerProgressDeg}deg` }}
              >
                <span>{remaining}</span>
              </div>
            )}
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            進行度: {finished ? total : current}/{total} ({progressPct}%)
          </div>
        </div>

        {!finished ? (
          <div className="card">
            {currentQuestion.type === 'matrix' && (
              <MatrixItem seed={currentQuestion.svgSeed} missingCell />
            )}
            <div className="qtext">Q{current + 1}: {currentQuestion.text}</div>
            <div className={`opts ${currentQuestion.type === 'matrix' ? 'opts-matrix' : ''}`.trim()}>
              {shuffledOptions.map((opt, i) => {
                const isSelected = selectedOption === opt;
                const currentFeedback = isSelected ? feedback : null;
                const buttonClass = `btn ${currentQuestion.type === 'matrix' ? 'btn-thumb matrix-option' : ''}`.trim();
                const parsedCell = currentQuestion.type === 'matrix' ? parseCell(opt) : null;

                return (
                  <button
                    key={opt}
                    type="button"
                    className={buttonClass}
                    ref={(el) => { optionRefs.current[i] = el; }}
                    data-selected={isSelected ? 'true' : undefined}
                    data-feedback={currentFeedback ?? undefined}
                    data-correct={currentFeedback === 'correct' ? 'true' : undefined}
                    data-wrong={currentFeedback === 'wrong' ? 'true' : undefined}
                    onClick={() => handleAnswer(opt)}
                    onKeyDown={(event) => handleOptionKeyDown(event, i)}
                    disabled={answerLocked}
                    aria-label={currentQuestion.type === 'matrix' ? `図形選択肢 ${i + 1}` : undefined}
                  >
                    {currentQuestion.type === 'matrix' && parsedCell ? (
                      <MatrixCellThumb cell={parsedCell} />
                    ) : (
                      opt
                    )}
                  </button>
                );
              })}
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={reset}>リセット</button>
            </div>
          </div>
        ) : (
          <div className={`card center result ${resultClass}`}>
            <div className="score">あなたのスコア: {score}/{total}</div>
            <p className="result-iq">推定IQ: {iqLow}–{iqHigh}</p>
            <p className="note">推定上位 {percentile}%（簡易オフライン換算）</p>
            <p className="note result-message">{resultMessage}</p>
            <p className="note">※ 本デモは練習用です。正式なIQ検査とは異なります。</p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn ghost" onClick={handleShare}>結果を共有</button>
              <button className="btn primary" onClick={reset}>もう一度</button>
            </div>
          </div>
        )}
      </div>
      {toastMessage && (
        <div className="toast note" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
      <Analytics />
    </div>
  );
}

export default App;
