import React, { useState } from 'react';
import './MensaIqTest.css';

const MensaIqTest = () => {
  const questions = [
    { id: 1, text: "2, 4, 6, 8, ?", options: ["10", "12", "14"], answer: "10" },
    { id: 2, text: "□ + 5 = 12. □ = ?", options: ["5", "7", "12"], answer: "7" }
  ];

  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const handleAnswer = (option) => {
    if (option === questions[current].answer) {
      setScore(score + 1);
    }
    const next = current + 1;
    if (next < questions.length) {
      setCurrent(next);
    } else {
      setFinished(true);
    }
  };

  const totalQuestions = questions.length;
  const answeredCount = finished ? totalQuestions : current;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  return (
    <div className="mensa-page">
      <div className="mensa-card">
        <div className="mensa-progress">
          <div
            className="mensa-progress-track"
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={totalQuestions}
            aria-label="現在の進捗"
          >
            <div
              className="mensa-progress-bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="mensa-progress-label">
            {finished
              ? '完了'
              : `質問 ${current + 1} / ${totalQuestions}`}
          </span>
        </div>

        {!finished ? (
          <>
            <h2 className="mensa-question">Q{current + 1}: {questions[current].text}</h2>
            <div className="mensa-options">
              {questions[current].options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className="mensa-option-button"
                  onClick={() => handleAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mensa-result">
            <h2>あなたのスコア</h2>
            <p className="mensa-score">{score} / {totalQuestions}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MensaIqTest;
