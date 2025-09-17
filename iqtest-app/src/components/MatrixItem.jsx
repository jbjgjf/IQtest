import React from 'react';
import { generateMatrixCell } from '../matrixUtils';

const VIEWBOX = 100;
const HALF = VIEWBOX / 2;

const renderAccent = (cell) => {
  const { accent, accentColor, stroke } = cell;
  const accentStroke = stroke ? '#0f172a' : 'none';
  const accentStrokeWidth = stroke ? 4 : 0;

  switch (accent) {
    case 'dot':
      return (
        <circle
          cx={0}
          cy={0}
          r={18}
          fill={accentColor}
          stroke={accentStroke}
          strokeWidth={accentStrokeWidth}
        />
      );
    case 'bar':
      return (
        <rect
          x={-30}
          y={-8}
          width={60}
          height={16}
          rx={6}
          fill={accentColor}
          stroke={accentStroke}
          strokeWidth={accentStrokeWidth}
        />
      );
    case 'cross':
      return (
        <g stroke={accentColor} strokeWidth={6} strokeLinecap="round">
          <line x1={-26} y1={-26} x2={26} y2={26} />
          <line x1={-26} y1={26} x2={26} y2={-26} />
        </g>
      );
    case 'slash':
      return (
        <line
          x1={-32}
          y1={-32}
          x2={32}
          y2={32}
          stroke={accentColor}
          strokeWidth={8}
          strokeLinecap="round"
        />
      );
    default:
      return null;
  }
};

const MatrixSvgContent = ({ cell }) => {
  if (!cell) return null;

  const transform = `translate(${HALF} ${HALF}) rotate(${cell.rotation}) scale(${cell.invert ? -cell.scale : cell.scale} ${cell.scale})`;
  const strokeColor = cell.stroke ? '#0f172a' : 'none';
  const strokeWidth = cell.stroke ? 6 : 0;

  let shapeElement = null;
  switch (cell.shape) {
    case 'circle':
      shapeElement = <circle cx={0} cy={0} r={40} fill={cell.fill} stroke={strokeColor} strokeWidth={strokeWidth} />;
      break;
    case 'triangle':
      shapeElement = (
        <path
          d="M 0 -45 L 39 32 L -39 32 Z"
          fill={cell.fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      );
      break;
    case 'diamond':
      shapeElement = (
        <rect
          x={-32}
          y={-32}
          width={64}
          height={64}
          fill={cell.fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          transform="rotate(45)"
          rx={10}
          ry={10}
        />
      );
      break;
    case 'square':
    default:
      shapeElement = (
        <rect
          x={-36}
          y={-36}
          width={72}
          height={72}
          fill={cell.fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          rx={12}
          ry={12}
        />
      );
      break;
  }

  return (
    <g transform={transform}>
      {shapeElement}
      {renderAccent(cell)}
    </g>
  );
};

const MatrixCellVisual = ({ cell }) => (
  <svg className="matrix-cell-svg" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-hidden="true" focusable="false">
    <rect x={0} y={0} width={VIEWBOX} height={VIEWBOX} fill="none" />
    <MatrixSvgContent cell={cell} />
  </svg>
);

const MatrixItem = ({ seed, missingCell = false }) => {
  const cells = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const isMissing = missingCell && row === 2 && col === 2;
      const cellData = isMissing ? null : generateMatrixCell(seed, row, col);
      cells.push({ row, col, isMissing, cellData });
    }
  }

  return (
    <div className="matrix-grid" role="img" aria-label="図形パターン">
      {cells.map(({ row, col, isMissing, cellData }) => (
        <div
          key={`${row}-${col}`}
          className={`matrix-cell ${isMissing ? 'matrix-cell--missing' : ''}`.trim()}
        >
          {!isMissing && <MatrixCellVisual cell={cellData} />}
        </div>
      ))}
    </div>
  );
};

export const MatrixCellThumb = ({ cell }) => (
  <div className="opt-thumb" aria-hidden="true">
    <MatrixCellVisual cell={cell} />
  </div>
);

export default MatrixItem;
