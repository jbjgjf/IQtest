import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { parseCell } from './questions';
import MatrixItem, { MatrixCellThumb } from './components/MatrixItem';
import Leaderboard from './components/Leaderboard';
import OnboardingDialog from './components/OnboardingDialog';
import { STRINGS } from './i18n/strings';
import { Analytics } from '@vercel/analytics/react';
import { generatePack } from './utils/generateQuestions';
import { mulberry32, hashStringToSeed } from './utils/prng';
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

const IQ_NORMS = {
  easy: { mean: 22, sd: 4 },
  medium: { mean: 16, sd: 5 },
  hard: { mean: 10, sd: 5 },
  mixed: { mean: 16, sd: 5 },
};

const LANGUAGE_OPTIONS = [
  { value: 'ja', label: 'JA' },
  { value: 'en', label: 'EN' },
  { value: 'zh', label: 'ZH' },
];

const LANGUAGE_TITLES = {
  ja: 'ミニIQテスト（デモ）',
  en: 'Mini IQ Test (Demo)',
  zh: '迷你 IQ 測試（示範）',
};

const estimateIQPoint = (rawCorrect, total, difficulty) => {
  const { mean, sd } = IQ_NORMS[difficulty] || IQ_NORMS.mixed;
  const correct = Number.isFinite(rawCorrect) ? rawCorrect : 0;
  const denominator = sd > 0 ? sd : 1;
  const z = (correct - mean) / denominator;
  const iq = 100 + 15 * z;
  const iqClamped = clamp(iq, 55, 145);
  return Math.round(iqClamped * 10) / 10;
};

const toFiniteNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const DEFAULT_QUESTION_TIME = 30;
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'];

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

const getByPath = (source, path) => {
  if (!source || typeof path !== 'string') return undefined;
  return path.split('.').reduce((acc, key) => (
    acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined
  ), source);
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
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'ja';
    return window.localStorage.getItem('iq:language') || 'ja';
  });
  const [hasDismissedOnboarding, setHasDismissedOnboarding] = useState(() => {
    if (typeof window === 'undefined') return false;
    const dismissed = window.localStorage.getItem('onboarding:dismissed') === 'true';
    const legacy = window.localStorage.getItem('iq:introSeen');
    return dismissed || Boolean(legacy);
  });
  const [forceIntro, setForceIntro] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('intro') === '1';
  });
  const [openOnboarding, setOpenOnboarding] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'navy';
    return window.localStorage.getItem('iq:theme') || 'navy';
  });
  const [toastMessage, setToastMessage] = useState('');
  const [nickname, setNickname] = useState('');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [scoreSent, setScoreSent] = useState(false);
  const [difficulty, setDifficulty] = useState('mixed');
  const [seedInput, setSeedInput] = useState('');
  const [seedActive, setSeedActive] = useState(null);
  const [isPractice, setIsPractice] = useState(false);
  const difficultyOptions = useMemo(
    () => [
      { value: 'easy', label: 'Easy' },
      { value: 'medium', label: 'Medium' },
      { value: 'hard', label: 'Hard' },
      { value: 'mixed', label: 'Mixed' },
    ],
    []
  );

  const intervalRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const optionRefs = useRef([]);
  const questionsRef = useRef(questions);
  const onboardingInitRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const legacy = window.localStorage.getItem('iq:introSeen');
    if (legacy && window.localStorage.getItem('onboarding:dismissed') !== 'true') {
      window.localStorage.setItem('onboarding:dismissed', 'true');
      setHasDismissedOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (onboardingInitRef.current) return;
    if (forceIntro || !hasDismissedOnboarding) {
      setOpenOnboarding(true);
    }
    onboardingInitRef.current = true;
  }, [forceIntro, hasDismissedOnboarding]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('iq:language', language);
  }, [language]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('iq:theme', theme);
    }
    try {
      const computed = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0B132B';
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', computed || '#0B132B');
    } catch (error) {
      // noop
    }
  }, [theme]);

  const titleText = useMemo(() => LANGUAGE_TITLES[language] || LANGUAGE_TITLES.ja, [language]);
  const strings = useMemo(() => STRINGS[language] || STRINGS.ja || {}, [language]);
  const t = useCallback((path, fallback) => {
    const value = getByPath(strings, path);
    return value !== undefined ? value : fallback;
  }, [strings]);

  const handleLanguageChange = useCallback((nextLang) => {
    if (!LANGUAGE_OPTIONS.some((option) => option.value === nextLang)) {
      return;
    }
    setLanguage(nextLang);
  }, []);

  const renderLanguageSwitch = useCallback(
    (extraClass = '') => (
            <div
              className={`language-switch ${extraClass}`.trim()}
              role="group"
              aria-label="Language selection"
            >
              {LANGUAGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${language === value ? 'primary' : 'ghost'}`.trim()}
                  onClick={() => handleLanguageChange(value)}
                  aria-pressed={language === value}
                >
                  {label}
                </button>
              ))}
            </div>
    ),
    [handleLanguageChange, language]
  );

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

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

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

  const buildRng = useCallback((seedValue) => {
    if (!seedValue) {
      return Math.random;
    }
    return mulberry32(hashStringToSeed(seedValue));
  }, []);

  const updateUrl = useCallback((seedValue, difficultyValue) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (seedValue) {
      params.set('seed', seedValue);
    } else {
      params.delete('seed');
    }
    if (difficultyValue && difficultyValue !== 'mixed') {
      params.set('difficulty', difficultyValue);
    } else {
      params.delete('difficulty');
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, []);

  const resetToQuestions = useCallback((nextQuestions) => {
    const hasNext = Array.isArray(nextQuestions);
    const target = hasNext ? nextQuestions : questionsRef.current || [];
    stopTimer();
    clearFeedbackTimeout();
    const firstQuestion = target[0];
    questionsRef.current = target;
    if (hasNext) {
      setQuestions(nextQuestions);
    }
    setCurrent(0);
    setScore(0);
    setFinished(false);
    setRemaining(getQuestionTimeLimit(firstQuestion));
    setFeedback(null);
    setSelectedOption(null);
    setAnswerLocked(false);
    setElapsedSeconds(0);
    const firstOptions = firstQuestion?.options;
    setShuffledOptions(Array.isArray(firstOptions) ? [...firstOptions] : []);
    setToastMessage('');
    setNickname('');
    setSubmitMsg('');
    setSubmittingScore(false);
    setScoreSent(false);
  }, [clearFeedbackTimeout, stopTimer]);

  const createPackAndStart = useCallback(
    ({ count = 30, seedOverride, difficultyOverride } = {}) => {
      const targetSeed = seedOverride !== undefined ? seedOverride : seedActive;
      const targetDifficulty = difficultyOverride || difficulty;
      setIsLoading(true);
      try {
        const rng = buildRng(targetSeed);
        const mix = targetDifficulty === 'mixed' && count > 1;
        const pack = generatePack(count, mix, targetDifficulty, { rng });
        const normalized = pack.questions
          .map((question) => normalizeQuestion(question))
          .filter(Boolean);
        if (seedOverride !== undefined) {
          setSeedActive(targetSeed);
          setSeedInput(targetSeed ?? '');
        }
        resetToQuestions(normalized);
      } catch (error) {
        console.error(error);
        resetToQuestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [buildRng, difficulty, resetToQuestions, seedActive]
  );

  const handleOnboardingStart = useCallback(({ dontShowAgain } = {}) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('iq:introSeen', '1');
      if (dontShowAgain && !forceIntro) {
        window.localStorage.setItem('onboarding:dismissed', 'true');
        setHasDismissedOnboarding(true);
      } else if (!dontShowAgain && !forceIntro && hasDismissedOnboarding) {
        window.localStorage.removeItem('onboarding:dismissed');
        setHasDismissedOnboarding(false);
      }
    }
    setIsPractice(false);
    resetToQuestions();
    setOpenOnboarding(false);
    if (forceIntro) {
      setForceIntro(false);
    }
  }, [forceIntro, hasDismissedOnboarding, resetToQuestions]);

  const handleOnboardingClose = useCallback(() => {
    setOpenOnboarding(false);
    if (forceIntro) {
      setForceIntro(false);
    }
  }, [forceIntro]);

  const handlePracticeStart = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('iq:introSeen', '1');
    }
    setIsPractice(true);
    createPackAndStart({ count: 1 });
    setOpenOnboarding(false);
    if (forceIntro) {
      setForceIntro(false);
    }
  }, [createPackAndStart, forceIntro]);

  const regenerate = useCallback(
    ({ seed, difficulty: mode } = {}) => {
      const hasSeedOverride = seed !== undefined;
      const hasDifficultyOverride = mode !== undefined;
      const normalizedDifficulty = hasDifficultyOverride
        ? (ALLOWED_DIFFICULTIES.includes(mode) ? mode : difficulty)
        : undefined;
      const normalizedSeed = hasSeedOverride ? (seed ?? null) : undefined;
      setIsPractice(false);
      createPackAndStart({
        count: 30,
        seedOverride: normalizedSeed,
        difficultyOverride: normalizedDifficulty,
      });
    },
    [createPackAndStart, difficulty]
  );

  const handleDifficultyChange = useCallback(
    (nextDifficulty) => {
      if (!ALLOWED_DIFFICULTIES.includes(nextDifficulty)) {
        return;
      }
      setLastResult(null);
      setDifficulty(nextDifficulty);
      updateUrl(seedActive, nextDifficulty);
      regenerate({ difficulty: nextDifficulty });
    },
    [regenerate, seedActive, updateUrl]
  );

  const applySeed = useCallback((rawValue) => {
    const trimmed = (rawValue ?? '').trim();
    const nextSeed = trimmed.length > 0 ? trimmed : null;
    setSeedInput(trimmed);
    setSeedActive(nextSeed);
    updateUrl(nextSeed, difficulty);
    regenerate({ seed: nextSeed });
  }, [difficulty, regenerate, updateUrl]);

  const handleApplySeedFromDialog = useCallback(() => {
    applySeed(seedInput);
  }, [applySeed, seedInput]);

  const handleSeedSubmit = useCallback((event) => {
    event.preventDefault();
    applySeed(seedInput);
  }, [applySeed, seedInput]);

  const handleSeedInputChange = (event) => {
    setSeedInput(event.target.value);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      regenerate();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    const diffParam = params.get('difficulty');
    const normalizedDifficulty = diffParam && ALLOWED_DIFFICULTIES.includes(diffParam.toLowerCase())
      ? diffParam.toLowerCase()
      : 'mixed';

    setSeedInput(seedParam ?? '');
    setSeedActive(seedParam ?? null);
    setDifficulty(normalizedDifficulty);
    regenerate({ seed: seedParam ?? null, difficulty: normalizedDifficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(`lastRun:${difficulty}`);
      if (stored) {
        const parsed = JSON.parse(stored) || {};
        let correct = Number(parsed.correct);
        if (!Number.isFinite(correct) && Number.isFinite(parsed.score)) {
          correct = Number(parsed.score);
        }
        if (!Number.isFinite(correct)) {
          correct = 0;
        }
        const totalValue = Number(parsed.total);
        const total = Number.isFinite(totalValue) ? totalValue : 0;
        const iqValue = Number.isFinite(parsed.iq)
          ? Number(parsed.iq)
          : estimateIQPoint(correct, total, difficulty);
        setLastResult({
          correct,
          total,
          timeMs: Number.isFinite(parsed.timeMs) ? parsed.timeMs : null,
          iq: iqValue,
          atISO: parsed.atISO,
        });
      } else {
        setLastResult(null);
      }
    } catch (error) {
      setLastResult(null);
    }
  }, [difficulty]);

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
    if (s && t && iq) {
      const scoreValue = Number(s);
      const totalValue = Number(t);
      const iqValue = Number(iq);
      setSharedResult({
        score: Number.isFinite(scoreValue) ? scoreValue : s,
        total: Number.isFinite(totalValue) ? totalValue : t,
        iq: Number.isFinite(iqValue) ? iqValue : iq,
      });
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
    setShuffledOptions([...currentQuestion.options]);
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

  const reset = useCallback(() => {
    if (isPractice) {
      setIsPractice(false);
      createPackAndStart({ count: 30 });
      return;
    }
    resetToQuestions();
  }, [createPackAndStart, isPractice, resetToQuestions]);

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
  const iqPoint = useMemo(
    () => estimateIQPoint(score, total, difficulty),
    [score, total, difficulty]
  );
  const helpLabel = t('onboarding.helpButton', 'Help / How to play');
  const themeLabel = t('onboarding.themeLabel', 'Theme');
  const seedPlaceholder = t('seed.placeholder', 'Seed');
  const seedApplyLabel = t('seed.apply', 'Apply');
  const practiceNotice = t('onboarding.practiceNoSave', 'Practice results are not saved.');

  useEffect(() => {
    if (!finished || isPractice) return;
    if (typeof window === 'undefined') return;
    const record = {
      correct: score,
      total,
      timeMs: Math.round(totalSeconds * 1000),
      iq: iqPoint,
      atISO: new Date().toISOString(),
      difficulty,
    };
    try {
      window.localStorage.setItem(`lastRun:${difficulty}`, JSON.stringify(record));
      setLastResult(record);
    } catch (error) {
      // noop: storage might be disabled
    }
  }, [finished, score, total, totalSeconds, iqPoint, difficulty, isPractice]);

  const handleShare = async () => {
    if (!finished || typeof window === 'undefined') return;
    const iqShare = Number.isFinite(iqPoint) ? iqPoint.toFixed(1) : String(iqPoint);
    const params = new URLSearchParams({
      s: String(score),
      t: String(total),
      iq: iqShare,
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
    if (isPractice) {
      setToastMessage(practiceNotice);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage('');
        toastTimeoutRef.current = null;
      }, 3000);
      return;
    }
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
      const result = await saveScore({ nickname: name, score, difficulty, iq: iqPoint });
      setNickname(name);
      setScoreSent(true);
      const message = result?.existed
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
      } else if (error?.message === 'invalid difficulty') {
        message = '難易度の判定に失敗しました';
      } else if (error?.message === 'invalid iq') {
        message = 'IQの算出に失敗しました';
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
          <div className="brand-row">
            <div className="brand-identity">
              <img src="/logo.svg" alt="IQtest Mini logo" className="brand-logo" />
              <h1 className="title">{titleText}</h1>
            </div>
            <div className="header-controls">
              <div className="header-chip-row">
                {renderLanguageSwitch('language-switch-header')}
                <div
                  role="radiogroup"
                  aria-label={themeLabel}
                  className="theme-swatch-row"
                >
                  {[
                    { key: 'navy', label: 'Navy', cls: 'swatch-navy' },
                    { key: 'royal', label: 'Royal', cls: 'swatch-royal' },
                    { key: 'emerald', label: 'Emerald', cls: 'swatch-emerald' },
                  ].map(({ key, label, cls }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={theme === key}
                      className={`theme-swatch ${cls} ${theme === key ? 'selected' : ''}`.trim()}
                      onClick={() => setTheme(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setTheme(key);
                        }
                      }}
                      title={label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-ghost"
                  onClick={() => {
                    setForceIntro(false);
                    setOpenOnboarding(true);
                  }}
                  aria-label={helpLabel}
                  aria-haspopup="dialog"
                  aria-controls="onboarding-dialog"
                >
                  <span className="qmark" aria-hidden="true">?</span>
                </button>
              </div>
            </div>
          </div>
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
          <div className="brand-row">
            <div className="brand-identity">
              <img src="/logo.svg" alt="IQtest Mini logo" className="brand-logo" />
              <h1 className="title">{titleText}</h1>
            </div>
            <div className="header-controls">
              <div className="header-chip-row">
                {renderLanguageSwitch('language-switch-header')}
                <div
                  role="radiogroup"
                  aria-label={themeLabel}
                  className="theme-swatch-row"
                >
                  {[
                    { key: 'navy', label: 'Navy', cls: 'swatch-navy' },
                    { key: 'royal', label: 'Royal', cls: 'swatch-royal' },
                    { key: 'emerald', label: 'Emerald', cls: 'swatch-emerald' },
                  ].map(({ key, label, cls }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={theme === key}
                      className={`theme-swatch ${cls} ${theme === key ? 'selected' : ''}`.trim()}
                      onClick={() => setTheme(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setTheme(key);
                        }
                      }}
                      title={label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-ghost"
                  onClick={() => {
                    setForceIntro(false);
                    setOpenOnboarding(true);
                  }}
                  aria-label={helpLabel}
                  aria-haspopup="dialog"
                  aria-controls="onboarding-dialog"
                >
                  <span className="qmark" aria-hidden="true">?</span>
                </button>
              </div>
            </div>
          </div>
          </header>
          <p className="note">問題データを読み込めませんでした。</p>
        </div>
        <Analytics />
      </div>
    );
  }

  return (
    <div className="app">
      <OnboardingDialog
        isOpen={openOnboarding}
        lang={language}
        t={t}
        seed={seedInput}
        onChangeSeed={setSeedInput}
        onApplySeed={handleApplySeedFromDialog}
        onStart={handleOnboardingStart}
        onPractice={handlePracticeStart}
        onClose={handleOnboardingClose}
        languages={LANGUAGE_OPTIONS}
        onSelectLanguage={handleLanguageChange}
        forced={forceIntro}
      />
      <div className="wrap">
        <header className="header">
          <div className="brand-row">
            <div className="brand-identity">
              <img src="/logo.svg" alt="IQtest Mini logo" className="brand-logo" />
              <h1 className="title">{titleText}</h1>
            </div>
            <div className="header-controls">
              <div className="header-chip-row">
                {renderLanguageSwitch('language-switch-header')}
                <div
                  role="radiogroup"
                  aria-label={themeLabel}
                  className="theme-swatch-row"
                >
                  {[
                    { key: 'navy', label: 'Navy', cls: 'swatch-navy' },
                    { key: 'royal', label: 'Royal', cls: 'swatch-royal' },
                    { key: 'emerald', label: 'Emerald', cls: 'swatch-emerald' },
                  ].map(({ key, label, cls }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={theme === key}
                      className={`theme-swatch ${cls} ${theme === key ? 'selected' : ''}`.trim()}
                      onClick={() => setTheme(key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setTheme(key);
                        }
                      }}
                      title={label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-ghost"
                  onClick={() => {
                    setForceIntro(false);
                    setOpenOnboarding(true);
                  }}
                  aria-label={helpLabel}
                  aria-haspopup="dialog"
                  aria-controls="onboarding-dialog"
                >
                  <span className="qmark" aria-hidden="true">?</span>
                </button>
              </div>
            </div>
          </div>
          <div className="pills">
            <span className="pill">非言語・数列</span>
            <span className="pill">合計 {total} 問</span>
          </div>
        </header>

        <div
          className="generator-controls"
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div
            role="group"
            aria-label="難易度"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
          >
            {difficultyOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`btn ${difficulty === value ? 'primary' : 'ghost'}`.trim()}
                onClick={() => handleDifficultyChange(value)}
                aria-pressed={difficulty === value}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="header-utilities">
            <form onSubmit={handleSeedSubmit} className="ob-control-row">
              <input
                id="seed-input"
                type="text"
                value={seedInput}
                onChange={handleSeedInputChange}
                placeholder={seedPlaceholder}
                aria-label={seedPlaceholder}
                className="ob-input"
              />
              <button type="submit" className="ob-button">
                {seedApplyLabel}
              </button>
            </form>
            <button
              type="button"
              className="icon-ghost"
              onClick={() => {
                setForceIntro(false);
                setOpenOnboarding(true);
              }}
              aria-label={helpLabel}
              aria-haspopup="dialog"
              aria-controls="onboarding-dialog"
            >
              <span className="qmark" aria-hidden="true">?</span>
            </button>
          </div>
        </div>

        {lastResult && (
          <p className="note previous-result">
            前回: {lastResult.correct}/{lastResult.total}（推定IQ: {Number.isFinite(Number(lastResult.iq)) ? Number(lastResult.iq).toFixed(1) : '--'}）
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
              {sharedResult.score}/{sharedResult.total}（推定IQ: {Number.isFinite(Number(sharedResult.iq)) ? Number(sharedResult.iq).toFixed(1) : '--'}）
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
            <p className="result-iq">推定IQ: {Number.isFinite(iqPoint) ? iqPoint.toFixed(1) : '--'}</p>
            <p className="note result-message">{resultMessage}</p>
            <p className="note">※ 本デモは練習用です。正式なIQ検査とは異なります。</p>
            {isPractice ? (
              <p className="note" style={{ marginTop: 16 }}>
                {practiceNotice}
              </p>
            ) : (
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
            )}
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
