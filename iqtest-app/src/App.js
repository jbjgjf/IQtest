import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { parseCell, shuffleArray } from './questions';
import MatrixItem, { MatrixCellThumb } from './components/MatrixItem';
import Leaderboard from './components/Leaderboard';
import { Analytics } from '@vercel/analytics/react';
import { loadPacks } from './data/loader';
import {
  generateMatrixCell,
  mutateCell,
  serializeCell,
  canonicalMatrixKeyV2,
  visualDistance,
  toVisualFeatures,
  VISUAL_DISTANCE_THRESHOLD,
} from './matrixUtils';
import { analytics, auth } from './firebase';
import { saveScore } from './data/scoreApi';
import { onAuthStateChanged } from 'firebase/auth';

// Analytics: ブラウザのみで初期化を参照
if (typeof window !== 'undefined' && analytics) {
  // 何もしない：参照されるだけで beacon が送信される
  // DevTools Network で /_vercel/insights/beacon と Firebase の収集を確認する
}


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

const toFiniteNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const DEFAULT_QUESTION_TIME = 30;
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];
const DEFAULT_DIFFICULTY_TARGETS = { easy: 4, medium: 5, hard: 3 };
const DEFAULT_TOTAL_QUESTIONS = Object.values(DEFAULT_DIFFICULTY_TARGETS).reduce(
  (sum, count) => sum + count,
  0
);

const normalizeDifficulty = (value) => {
  if (!value) return 'medium';
  const normalized = String(value).toLowerCase();
  return DIFFICULTY_ORDER.includes(normalized) ? normalized : 'medium';
};

const getQuestionTimeLimit = (question) => {
  if (!question) return DEFAULT_QUESTION_TIME;
  const limit = toFiniteNumber(question.timeLimitSec, null);
  return limit ?? DEFAULT_QUESTION_TIME;
};

const selectQuestionsByDifficulty = (allQuestions, targets = DEFAULT_DIFFICULTY_TARGETS) => {
  if (!Array.isArray(allQuestions) || allQuestions.length === 0) {
    return [];
  }

  const desiredTotalRaw = Object.values(targets ?? {}).reduce((sum, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? sum + numeric : sum;
  }, 0);
  const desiredTotal = desiredTotalRaw > 0 ? desiredTotalRaw : DEFAULT_TOTAL_QUESTIONS;
  const limit = Math.min(desiredTotal, allQuestions.length);

  const shuffledAll = shuffleArray(allQuestions);
  const buckets = DIFFICULTY_ORDER.reduce((acc, diff) => {
    acc[diff] = [];
    return acc;
  }, {});

  shuffledAll.forEach((question) => {
    const diff = normalizeDifficulty(question.difficulty);
    buckets[diff].push(question);
  });

  const selections = [];
  const seenKeys = new Set();
  const makeKey = (question) => `${question._pack ?? 'pack'}::${question.id ?? question.text ?? Math.random().toString(36)}`;
  const addQuestion = (question) => {
    if (!question) return false;
    const key = makeKey(question);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    selections.push(question);
    return true;
  };

  DIFFICULTY_ORDER.forEach((diff) => {
    const targetCount = Number(targets?.[diff]) || 0;
    const bucket = buckets[diff] ?? [];
    let taken = 0;
    for (let i = 0; i < bucket.length && taken < targetCount; i += 1) {
      if (addQuestion(bucket[i])) {
        taken += 1;
      }
    }
  });

  for (let i = 0; i < shuffledAll.length && selections.length < limit; i += 1) {
    addQuestion(shuffledAll[i]);
  }

  if (selections.length < limit) {
    shuffledAll.forEach((question) => {
      if (selections.length < limit) {
        addQuestion(question);
      }
    });
  }

  return shuffleArray(selections);
};

const isPrimitiveOption = (value) => typeof value === 'number' || typeof value === 'string';

const looksLikeJsonString = (value) => typeof value === 'string' && value.trim().startsWith('{');

const deriveSeedFromId = (id) => {
  if (typeof id !== 'string' || id.length === 0) return null;
  return id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
};

export const normalizeQuestion = (raw) => {
  if (!raw) return null;
  const kind = raw.kind ?? raw.type ?? 'unknown';
  const difficulty = normalizeDifficulty(raw.difficulty);
  const tags = Array.isArray(raw.tags) ? raw.tags : undefined;
  const normalizedTimeLimit = toFiniteNumber(raw.timeLimitSec, null);
  const normalizedWeight = toFiniteNumber(raw.weight, null);

  const baseShape = {
    ...raw,
    kind,
    type: kind,
    difficulty,
    tags,
    timeLimitSec: normalizedTimeLimit ?? undefined,
    weight: normalizedWeight ?? raw.weight,
    _pack: raw._pack,
  };

  if (kind !== 'matrix') {
    const rawOptions = Array.isArray(raw.options) ? raw.options : [];
    let warned = false;
    const sanitizedOptions = rawOptions.reduce((acc, option) => {
      if (!isPrimitiveOption(option) || looksLikeJsonString(option)) {
        if (!warned && typeof console !== 'undefined') {
          console.warn('[normalizeQuestion] Dropping non-primitive option(s)', {
            questionId: raw.id,
          });
          warned = true;
        }
        return acc;
      }
      acc.push(option);
      return acc;
    }, []);

    const rawAnswer =
      (isPrimitiveOption(raw.answer) && !looksLikeJsonString(raw.answer))
        ? raw.answer
        : undefined;

    let answerIndex = Number.isInteger(raw.answerIndex)
      ? clamp(raw.answerIndex, 0, Math.max(0, sanitizedOptions.length - 1))
      : -1;

    let answerValue = rawAnswer;
    if (answerValue === undefined && answerIndex >= 0) {
      answerValue = sanitizedOptions[answerIndex];
    }
    if (answerValue === undefined && sanitizedOptions.length > 0) {
      answerValue = sanitizedOptions[0];
      answerIndex = 0;
    }
    if (answerValue === undefined) {
      answerIndex = -1;
    }

    return {
      ...baseShape,
      options: [...sanitizedOptions],
      answer: answerValue,
      answerIndex: answerIndex >= 0 ? answerIndex : sanitizedOptions.indexOf(answerValue),
    };
  }

  let seed = toFiniteNumber(raw.seed ?? raw.svgSeed, null);
  if (!Number.isFinite(seed)) {
    const derived = deriveSeedFromId(raw.id);
    seed = Number.isFinite(derived) ? derived : null;
  }
  const effectiveSeed = Number.isFinite(seed) ? seed : 1;

  const baseCell = generateMatrixCell(effectiveSeed, 2, 2);
  const answerSerialized = serializeCell(baseCell);
  const answerFeatures = toVisualFeatures(baseCell);

  const optionsMap = new Map();

  const SHAPE_POOL = ['square', 'circle', 'triangle', 'diamond'];
  const ACCENT_SHAPES = ['dot', 'cross', 'bar', 'slash'];
  const ACCENT_POSITIONS = ['center', 'tl', 'tr', 'bl', 'br'];
  const COLOR_POOL = ['#ef4444', '#22c55e', '#f97316', '#a855f7', '#0ea5e9', '#facc15'];

  const ensureDistinctShape = (currentShape, offset = 0) => {
    const baseIndex = SHAPE_POOL.indexOf(currentShape);
    if (baseIndex === -1) {
      return SHAPE_POOL[offset % SHAPE_POOL.length];
    }
    return SHAPE_POOL[(baseIndex + 1 + offset) % SHAPE_POOL.length];
  };

  const enforceDiversity = (candidate, seedBase) => {
    let adjusted = { ...candidate };
    let attempts = 0;
    while (attempts < 3 && visualDistance(adjusted, answerFeatures) < VISUAL_DISTANCE_THRESHOLD) {
      if (attempts === 0) {
        adjusted = {
          ...adjusted,
          shape: ensureDistinctShape(adjusted.shape, seedBase + attempts),
          rotation: ((Number.isFinite(adjusted.rotation) ? adjusted.rotation : 0) + ((seedBase % 3) + 1) * 90) % 360,
        };
      } else if (attempts === 1) {
        adjusted = {
          ...adjusted,
          fill: COLOR_POOL[(seedBase + attempts) % COLOR_POOL.length],
          accent: {
            shape: ACCENT_SHAPES[(seedBase + attempts) % ACCENT_SHAPES.length],
            position: ACCENT_POSITIONS[(seedBase + attempts) % ACCENT_POSITIONS.length],
            color: COLOR_POOL[(seedBase + attempts + 2) % COLOR_POOL.length],
          },
        };
      } else {
        adjusted = {
          ...adjusted,
          invert: !adjusted.invert,
          stripe: {
            enabled: true,
            angle: ((seedBase + attempts * 45) % 180),
            width: 0.6,
            gap: 0.25,
          },
        };
      }
      attempts += 1;
    }
    return adjusted;
  };

  const createVariant = (seedBase, steps = 3) => {
    let variant = baseCell;
    for (let step = 0; step < Math.max(1, steps); step += 1) {
      variant = mutateCell(variant, seedBase + step * 19);
    }
    return enforceDiversity(variant, seedBase);
  };

  const normalizeOption = (value) => {
    if (value == null) return null;
    const serialized = typeof value === 'string' ? value : serializeCell(value);
    let cellObject;
    try {
      cellObject = typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
      return null;
    }
    const features = toVisualFeatures(cellObject);
    const key = canonicalMatrixKeyV2(cellObject);
    return { serialized, features, key };
  };

  const hasSufficientContrast = (candidate, reference) => {
    if (!candidate || !reference) return true;
    const dv = Math.abs(candidate.fill.val - reference.fill.val);
    const ds = Math.abs(candidate.fill.sat - reference.fill.sat);
    const hueDiff = Math.min(
      Math.abs(candidate.fill.hue - reference.fill.hue),
      360 - Math.abs(candidate.fill.hue - reference.fill.hue)
    ) / 360;
    return dv >= 0.25 || ds >= 0.25 || hueDiff >= 0.2;
  };

  const tryAddOption = (candidateValue, { requireDiversity = false, requireContrast = false } = {}) => {
    const normalized = normalizeOption(candidateValue);
    if (!normalized) return false;
    const { key, serialized, features } = normalized;
    if (optionsMap.has(key)) {
      return false;
    }
    if (requireContrast && !hasSufficientContrast(features, answerFeatures)) {
      return false;
    }
    if (requireDiversity) {
      for (const existing of optionsMap.values()) {
        const distance = visualDistance(features, existing.features);
        if (distance < VISUAL_DISTANCE_THRESHOLD) {
          return false;
        }
      }
    }
    optionsMap.set(key, { serialized, features });
    return true;
  };

  tryAddOption(answerSerialized);

  const rawOptionList = Array.isArray(raw.options) ? raw.options : [];
  rawOptionList.forEach((option) => {
    tryAddOption(option);
  });

  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  candidates.forEach((candidate, index) => {
    const variantSeed = toFiniteNumber(candidate?.variant ?? candidate?.seed, null);
    const seedOffset = Number.isFinite(variantSeed) ? variantSeed : effectiveSeed + (index + 1) * 17;
    const mutated = createVariant(seedOffset, 4);
    tryAddOption(mutated, { requireDiversity: true, requireContrast: true });
  });

  let fillerSeed = effectiveSeed + 101;
  let attempts = 0;
  const maxAttempts = 250;
  while (optionsMap.size < 8 && attempts < maxAttempts) {
    const mutated = createVariant(fillerSeed + attempts * 31, 5);
    tryAddOption(mutated, { requireDiversity: true, requireContrast: true });
    attempts += 1;
  }

  const optionEntries = Array.from(optionsMap.values());
  const options = optionEntries.slice(0, 8).map((entry) => entry.serialized);
  if (!options.includes(answerSerialized)) {
    options.unshift(answerSerialized);
    while (options.length > 8) {
      options.pop();
    }
  }

  const answerIndex = Math.max(0, options.indexOf(answerSerialized));

  return {
    ...baseShape,
    svgSeed: effectiveSeed,
    options,
    answer: answerSerialized,
    answerIndex,
  };
};

function App() {
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_QUESTION_TIME);
  const [feedback, setFeedback] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [sharedResult, setSharedResult] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [nickname, setNickname] = useState('');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [scoreSent, setScoreSent] = useState(false);

  const intervalRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const optionRefs = useRef([]);

  const total = questions.length;
  const currentQuestion = questions[current];
  const currentKind = currentQuestion?.type ?? currentQuestion?.kind;
  const currentTimeLimit = getQuestionTimeLimit(currentQuestion);
  const progressPct = total > 0 ? Math.round(((finished ? total : current) / total) * 100) : 0;
  const timerProgressDeg = currentTimeLimit > 0
    ? Math.max(0, Math.min(360, (remaining / currentTimeLimit) * 360))
    : 0;

  const displayOptions = useMemo(() => {
    if (!Array.isArray(shuffledOptions)) {
      return [];
    }
    if (currentKind === 'matrix') {
      const seen = new Map();
      return shuffledOptions.filter((option) => {
        let key;
        try {
          key = canonicalMatrixKeyV2(option);
        } catch (error) {
          key = option;
        }
        if (seen.has(key)) {
          return false;
        }
        seen.set(key, true);
        return true;
      });
    }
    const filtered = shuffledOptions.filter((option) => {
      if (!isPrimitiveOption(option) || looksLikeJsonString(option)) {
        console.warn('[render] Filtering non-primitive option', {
          questionId: currentQuestion?.id,
          option,
        });
        return false;
      }
      return true;
    });
    console.assert(
      filtered.every((value) => typeof value === 'number' || typeof value === 'string'),
      'Non-matrix options must be primitive (number|string)',
      filtered
    );
    return filtered;
  }, [currentKind, shuffledOptions, currentQuestion?.id]);

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
    let cancelled = false;
    setIsLoading(true);
    loadPacks(['arithmetic.v1', 'matrix.v1'])
      .then((loadedQuestions) => {
        if (cancelled) return;
        const normalized = loadedQuestions
          .map((question) => normalizeQuestion(question))
          .filter(Boolean);
        const selected = selectQuestionsByDifficulty(normalized, DEFAULT_DIFFICULTY_TARGETS);
        setQuestions(selected);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          setQuestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
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
    if (typeof window === 'undefined') return undefined;
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user?.uid) {
          console.log(`Firebase UID: ${user.uid}`);
        }
      },
      (error) => {
        // eslint-disable-next-line no-console
        console.error('[auth] onAuthStateChanged error', error);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [auth]);

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
  }, [currentQuestion?.id, displayOptions.length]);

  useEffect(() => {
    if (finished) return;
    if (!currentQuestion || !Array.isArray(currentQuestion.options)) {
      setShuffledOptions([]);
      return;
    }
    setSelectedOption(null);
    setAnswerLocked(false);
    setFeedback(null);
    setShuffledOptions(shuffleArray(currentQuestion.options));
  }, [currentQuestion?.id, finished]);

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

    const timeLimit = currentTimeLimit;
    setRemaining(timeLimit);
    setAnswerLocked(false);
    setSelectedOption(null);
    setFeedback(null);

    const onTimeout = () => {
      setElapsedSeconds((prev) => prev + timeLimit);
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
  }, [current, finished, stopTimer, clearFeedbackTimeout, advanceQuestion, currentTimeLimit]);

  const handleAnswer = (option) => {
    if (answerLocked || finished) return;

    const isCorrect = option === currentQuestion.answer;
    const safeLimit = currentTimeLimit > 0 ? currentTimeLimit : DEFAULT_QUESTION_TIME;
    const timeSpent = clamp(safeLimit - remaining, 0, safeLimit);

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

    const len = displayOptions.length;
    if (len === 0) return;
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
      handleAnswer(displayOptions[index]);
    }
  };

  const reset = () => {
    stopTimer();
    clearFeedbackTimeout();
    setCurrent(0);
    setScore(0);
    setFinished(false);
    setRemaining(getQuestionTimeLimit(questions[0]));
    setFeedback(null);
    setSelectedOption(null);
    setAnswerLocked(false);
    setElapsedSeconds(0);
    const firstOptions = questions[0]?.options;
    setShuffledOptions(Array.isArray(firstOptions) ? shuffleArray(firstOptions) : []);
    setToastMessage('');
    setNickname('');
    setSubmitMsg('');
    setSubmittingScore(false);
    setScoreSent(false);
  };

  const ratio = total > 0 ? score / total : 0;
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
  const expectedTotal = questions.reduce(
    (sum, question) => sum + getQuestionTimeLimit(question),
    0
  ) || DEFAULT_QUESTION_TIME;
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

  const handleSubmitScore = async () => {
    if (!finished || submittingScore || scoreSent) return;
    setSubmitMsg('');

    const name = nickname.trim();
    if (!name) {
      setSubmitMsg('ニックネームを入力してください');
      return;
    }
    if (name.length > 24) {
      setSubmitMsg('ニックネームは24文字以内で入力してください');
      return;
    }
    if (!Number.isInteger(score) || score < 0 || score > 9999) {
      setSubmitMsg('スコアが正しくありません');
      return;
    }

    setSubmittingScore(true);
    try {
      const result = await saveScore({ nickname: name, score });
      setNickname(name);
      setScoreSent(true);
      const message = result?.updated
        ? 'ランキングを更新しました！'
        : 'スコアを送信しました！';
      setSubmitMsg(message);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[score] failed', error);
      let message = '送信に失敗しました';
      if (error?.message === 'invalid nickname') {
        message = 'ニックネームは1〜24文字で入力してください';
      } else if (error?.message === 'invalid score') {
        message = 'スコアが正しくありません';
      } else if (error?.message === 'not signed in') {
        message = '通信状況を確認して再度お試しください';
      }
      setSubmitMsg(message);
    } finally {
      setSubmittingScore(false);
    }
  };

  const dismissSharedResult = () => {
    setSharedResult(null);
    if (typeof window === 'undefined') return;
    const nextUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  if (isLoading) {
    return (
      <div className="app">
        <div className="wrap">
          <header className="header">
            <h1 className="title">ミニIQテスト（デモ）</h1>
          </header>
          <p className="note">読み込み中…</p>
        </div>
        <Analytics />
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="app">
        <div className="wrap">
          <header className="header">
            <h1 className="title">ミニIQテスト（デモ）</h1>
          </header>
          <p className="note">問題データを読み込めませんでした。</p>
        </div>
        <Analytics />
      </div>
    );
  }

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
            {currentKind === 'matrix' && (
              <MatrixItem seed={currentQuestion.svgSeed} missingCell />
            )}
            <div className="qtext">Q{current + 1}: {currentQuestion.text}</div>
            <div className={`opts ${currentKind === 'matrix' ? 'opts-matrix' : ''}`.trim()}>
              {displayOptions.map((opt, i) => {
                const isSelected = selectedOption === opt;
                const currentFeedback = isSelected ? feedback : null;
                const buttonClass = `btn ${currentKind === 'matrix' ? 'btn-thumb matrix-option' : ''}`.trim();
                const parsedCell = currentKind === 'matrix' ? parseCell(opt) : null;

                return (
                  <button
                    key={`${currentQuestion?.id ?? 'question'}-${i}`}
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
                    aria-label={currentKind === 'matrix' ? `図形選択肢 ${i + 1}` : undefined}
                  >
                    {currentKind === 'matrix' && parsedCell ? (
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
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="ニックネーム (1〜24文字)"
                  maxLength={24}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  disabled={submittingScore || scoreSent}
                  style={{ minWidth: 160 }}
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSubmitScore}
                  disabled={submittingScore || scoreSent}
                >
                  {scoreSent ? '送信済み' : submittingScore ? '送信中...' : 'スコアを送信'}
                </button>
              </div>
              {submitMsg && (
                <p className="note" style={{ marginTop: 8 }}>
                  {submitMsg}
                </p>
              )}
            </div>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn ghost" onClick={handleShare}>結果を共有</button>
              <button className="btn primary" onClick={reset}>もう一度</button>
            </div>
          </div>
        )}
        <Leaderboard />
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
