import React, { useEffect, useMemo, useRef, useState } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DEFAULT_LANGUAGES = [
  { value: 'ja', label: 'JA' },
  { value: 'en', label: 'EN' },
  { value: 'zh', label: 'ZH' },
];

const TAB_KEYS = ['overview', 'howto', 'leaderboard'];

function OnboardingDialog({
  isOpen = false,
  lang,
  t,
  seed,
  onChangeSeed,
  onApplySeed,
  onStart,
  onPractice,
  onClose,
  languages = DEFAULT_LANGUAGES,
  onSelectLanguage,
  forced = false,
}) {
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS[0]);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(TAB_KEYS[0]);
    setDontShowAgain(false);
  }, [isOpen, lang]);

  useEffect(() => {
    if (!isOpen) return undefined;

    lastFocusedRef.current = document.activeElement;
    const dialogEl = dialogRef.current;

    const focusFirst = () => {
      if (!dialogEl) return;
      const auto = dialogEl.querySelector('[data-autofocus="true"]');
      if (auto?.focus) {
        auto.focus();
        return;
      }
      const focusable = dialogEl.querySelectorAll(FOCUSABLE_SELECTORS);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    };

    const handleKeyDown = (event) => {
      if (!dialogRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    focusFirst();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previous = lastFocusedRef.current;
      if (previous && previous.focus) {
        previous.focus();
      }
    };
  }, [isOpen, onClose]);

  const tabLabels = useMemo(() => t('onboarding.tabs', {}), [t]);
  const overview = useMemo(() => t('onboarding.overview', {}), [t]);
  const howto = useMemo(() => t('onboarding.howto', {}), [t]);
  const board = useMemo(() => t('onboarding.board', {}), [t]);
  const cta = useMemo(() => t('onboarding.cta', {}), [t]);
  const misc = useMemo(() => t('onboarding.misc', {}), [t]);
  const contentMap = useMemo(() => ({
    overview,
    howto,
    leaderboard: board,
  }), [overview, howto, board]);

  if (!isOpen) {
    return null;
  }

  const section = contentMap[activeTab] || {};
  const points = section && typeof section === 'object'
    ? Object.entries(section).filter(([, value]) => Boolean(value))
    : [];

  const handleStart = () => {
    onStart?.({ dontShowAgain });
  };

  return (
    <div className="ob-backdrop">
      <div
        ref={dialogRef}
        className="ob-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        id="onboarding-dialog"
      >
        <header className="ob-header">
          <div className="ob-heading">
            <img src="/logo.svg" alt="IQtest Mini logo" className="ob-logo" />
            <h2 id="onboarding-title">{t('onboarding.title', 'Quick start')}</h2>
          </div>
          <button
            type="button"
            className="ob-close"
            onClick={() => onClose?.()}
            aria-label={misc.close || 'Close'}
            data-autofocus="true"
          >
            ×
          </button>
        </header>
        <div className="ob-tabs" role="tablist" aria-label={misc.tablist || 'Onboarding overview'}>
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              aria-controls={`onboarding-panel-${key}`}
              id={`onboarding-tab-${key}`}
              className={`onb-chip ${activeTab === key ? 'is-active' : ''}`.trim()}
              onClick={() => setActiveTab(key)}
            >
              {tabLabels?.[key] || key}
            </button>
          ))}
        </div>
        <section
          id={`onboarding-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`onboarding-tab-${activeTab}`}
        >
          {points.length > 0 && (
            <ul className="onb-list">
              {points.map(([key, item], index) => (
                <li
                  key={`${activeTab}-point-${key || index}`}
                  className={key === 'tip' ? 'ob-tip' : undefined}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="ob-controls">
          <div className="ob-langs" role="group" aria-label={misc.language || 'Language'}>
            {languages.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`chip ${lang === value ? 'primary' : 'ghost'}`.trim()}
                onClick={() => onSelectLanguage?.(value)}
                aria-pressed={lang === value}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="ob-seed ob-control-row onb-row"
            onSubmit={(event) => {
              event.preventDefault();
              onApplySeed?.();
            }}
          >
            <label className="onb-label" htmlFor="onboarding-seed-input">{misc.seed || 'Seed'}</label>
            <input
              id="onboarding-seed-input"
              type="text"
              value={seed ?? ''}
              onChange={(event) => onChangeSeed?.(event.target.value)}
              placeholder={misc.seedPlaceholder || 'Enter seed'}
              autoComplete="off"
              className="ob-input"
            />
            <button type="submit" className="ob-button">
              {cta.applySeed || 'Apply'}
            </button>
          </form>
        </div>
        <footer className="ob-footer">
          <label className="onb-label inline">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              disabled={forced}
              className="onb-check"
            />
            <span>{cta.dontShow || "Don't show again"}</span>
          </label>
          <div className="ob-actions">
            <button type="button" className="ob-button ghost" onClick={() => onPractice?.()}>
              {cta.practice || 'Practice (TODO)'}
            </button>
            <button type="button" className="ob-button" onClick={handleStart}>
              {cta.start || 'Start'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default OnboardingDialog;
