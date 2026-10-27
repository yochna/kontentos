import React from 'react';
import type { CanvasCustomElement } from '../../../../types/canvasScene';
import { isRichHtml, sanitizeRichText } from '../../utils/richText';

interface Props {
  element: CanvasCustomElement;
  width: number;
  height: number;
}

export const CustomShapeRenderer: React.FC<Props> = ({ element, width, height }) => {
  const fill = element.fill || '#38bdf8';
  const stroke = element.stroke || 'transparent';
  const strokeWidth = element.strokeWidth ?? 0;
  const opacity = element.opacity ?? 1;
  const blur = element.blur ?? 0;
  const radius = element.radius ?? 0;
  const glow = element.glow ?? 0;
  const shadow = element.shadow ?? false;

  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    opacity,
    filter: [blur > 0 ? `blur(${blur}px)` : '', glow > 0 ? `drop-shadow(0 0 ${glow}px ${fill})` : '']
      .filter(Boolean)
      .join(' '),
  };

  if (element.kind === 'image') {
    return (
      <img
        src={element.imageUrl}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: element.objectFit || 'cover',
          borderRadius: `${radius}px`,
          opacity,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          boxShadow: shadow ? '0 18px 50px -12px rgba(0,0,0,0.65)' : undefined,
        }}
      />
    );
  }

  if (element.kind === 'text') {
    const text = element.text || '';
    const textStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent:
        element.textAlign === 'left'
          ? 'flex-start'
          : element.textAlign === 'right'
          ? 'flex-end'
          : 'center',
      color: element.color || '#ffffff',
      fontSize: `${element.fontSize ?? 26}px`,
      fontWeight: element.fontWeight ?? 700,
      fontStyle: element.fontStyle ?? 'normal',
      fontFamily: element.fontFamily || 'inherit',
      lineHeight: element.lineHeight ?? 1.2,
      letterSpacing:
        typeof element.letterSpacing === 'number' ? `${element.letterSpacing}px` : undefined,
      textAlign: element.textAlign ?? 'center',
      textShadow: glow > 0 ? `0 0 ${glow}px ${element.color || fill}` : '0 2px 12px rgba(0,0,0,0.35)',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
    };

    if (isRichHtml(text)) {
      return (
        <div
          style={textStyle}
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }}
        />
      );
    }

    return <div style={textStyle}>{text}</div>;
  }

  if (element.kind === 'badge' || element.shapeType === 'badge') {
    return (
      <div
        style={{
          ...wrapperStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '999px',
          background: fill,
          color: element.color || '#ffffff',
          fontSize: `${Math.max(12, Math.min(20, height * 0.34))}px`,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '0 16px',
          boxShadow: shadow ? '0 10px 28px -8px rgba(0,0,0,0.55)' : undefined,
          whiteSpace: 'nowrap',
        }}
      >
        {element.text || 'BADGE'}
      </div>
    );
  }

  const svgProps = {
    width: '100%',
    height: '100%',
    viewBox: '0 0 100 100',
    preserveAspectRatio: 'none' as const,
    style: wrapperStyle,
  };

  switch (element.shapeType) {
    case 'circle':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: '50%',
            background: fill,
            boxShadow: shadow ? '0 18px 45px -12px rgba(0,0,0,0.6)' : undefined,
          }}
        />
      );
    case 'pill':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: '999px',
            background: fill,
            border: strokeWidth > 0 ? `${strokeWidth}px solid ${stroke}` : undefined,
          }}
        />
      );
    case 'card':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: `${radius || 24}px`,
            background: fill,
            border: `1px solid rgba(255,255,255,0.25)`,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: shadow ? '0 24px 60px -20px rgba(0,0,0,0.7)' : undefined,
          }}
        />
      );
    case 'diamond':
      return (
        <div
          style={{
            ...wrapperStyle,
            width: '70%',
            height: '70%',
            margin: '15%',
            background: fill,
            transform: 'rotate(45deg)',
            borderRadius: `${radius || 8}px`,
          }}
        />
      );
    case 'ring':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: '50%',
            border: `${Math.max(2, strokeWidth || 8)}px solid ${fill}`,
            boxShadow: `0 0 30px ${fill}55`,
          }}
        />
      );
    case 'star':
      return (
        <svg {...svgProps}>
          <path
            d="M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z"
            fill={fill}
            opacity={0.95}
          />
        </svg>
      );
    case 'hexagon':
      return (
        <svg {...svgProps}>
          <polygon points="50,2 95,26 95,74 50,98 5,74 5,26" fill={fill} />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...svgProps}>
          <path d="M50 4 L57 35 L88 42 L57 49 L50 80 L43 49 L12 42 L43 35 Z" fill={fill} />
          <path d="M80 62 L84 78 L100 82 L84 86 L80 102 L76 86 L60 82 L76 78 Z" fill={fill} opacity={0.75} />
          <path d="M22 60 L24 70 L34 72 L24 74 L22 84 L20 74 L10 72 L20 70 Z" fill={fill} opacity={0.65} />
        </svg>
      );
    case 'check':
      return (
        <svg {...svgProps}>
          <path
            d="M12 52 L38 78 L88 18"
            fill="none"
            stroke={fill}
            strokeWidth={strokeWidth || 10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...svgProps}>
          <path
            d="M8 88 C32 18 74 18 96 46"
            fill="none"
            stroke={fill}
            strokeWidth={strokeWidth || 7}
            strokeLinecap="round"
          />
          <path d="M76 32 L98 47 L76 60" fill="none" stroke={fill} strokeWidth={strokeWidth || 7} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'growth':
      return (
        <svg {...svgProps}>
          <path d="M6 88 L36 56 L58 72 L94 20" fill="none" stroke={fill} strokeWidth={strokeWidth || 7} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M78 18 L96 18 L96 36" fill="none" stroke={fill} strokeWidth={strokeWidth || 7} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'next':
      return (
        <svg {...svgProps}>
          <path d="M6 50 L88 50" fill="none" stroke={fill} strokeWidth={strokeWidth || 8} strokeLinecap="round" />
          <path d="M68 24 L94 50 L68 76" fill="none" stroke={fill} strokeWidth={strokeWidth || 8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'quote':
      return (
        <svg {...svgProps}>
          <path
            d="M18 72 C18 44 30 24 48 12 L56 20 C44 30 38 42 38 50 L54 50 L54 84 L18 84 Z M56 72 C56 44 68 24 86 12 L94 20 C82 30 76 42 76 50 L92 50 L92 84 L56 84 Z"
            fill={fill}
          />
        </svg>
      );
    case 'flame':
      return (
        <svg {...svgProps}>
          <path
            d="M50 4 C66 28 86 44 86 64 A36 36 0 0 1 14 64 C14 48 24 38 36 28 C36 44 44 50 50 50 C56 34 50 18 50 4 Z"
            fill={fill}
          />
        </svg>
      );
    case 'heart':
      return (
        <svg {...svgProps}>
          <path
            d="M50 90 C18 66 6 48 6 32 A24 24 0 0 1 50 16 A24 24 0 0 1 94 32 C94 48 82 66 50 90 Z"
            fill={fill}
          />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...svgProps}>
          <path d="M18 8 H82 V94 L50 70 L18 94 Z" fill={fill} />
        </svg>
      );
    case 'zigzag':
      return (
        <svg {...svgProps}>
          <polyline
            points="2,70 20,30 38,70 56,30 74,70 92,30 98,54"
            fill="none"
            stroke={fill}
            strokeWidth={strokeWidth || 7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'reticle':
      return (
        <svg {...svgProps}>
          <circle cx="50" cy="50" r="30" fill="none" stroke={fill} strokeWidth={strokeWidth || 4} />
          <circle cx="50" cy="50" r="5" fill={fill} />
          <path d="M50 2 V26 M50 74 V98 M2 50 H26 M74 50 H98" stroke={fill} strokeWidth={strokeWidth || 4} strokeLinecap="round" />
        </svg>
      );
    case 'brackets':
      return (
        <div
          style={{
            ...wrapperStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: fill,
            fontFamily: 'Georgia, serif',
            fontSize: `${Math.max(36, height * 0.9)}px`,
            lineHeight: 1,
            fontWeight: 300,
          }}
        >
          [ ]
        </div>
      );
    case 'bar':
    case 'horizon':
    case 'dashed':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: '999px',
            background:
              element.shapeType === 'horizon'
                ? `linear-gradient(90deg, transparent, ${fill}, transparent)`
                : fill,
            borderTop:
              element.shapeType === 'dashed' ? `${Math.max(2, strokeWidth || 3)}px dashed ${fill}` : undefined,
            backgroundClip: element.shapeType === 'dashed' ? 'unset' : undefined,
            boxShadow: glow > 0 ? `0 0 18px ${fill}` : undefined,
          }}
        />
      );
    case 'badge':
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: '999px',
            background: fill,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: element.color || '#ffffff',
            fontWeight: 900,
            fontSize: `${Math.max(12, height * 0.34)}px`,
            letterSpacing: '0.08em',
          }}
        >
          {element.text || 'BADGE'}
        </div>
      );
    default:
      return (
        <div
          style={{
            ...wrapperStyle,
            borderRadius: `${radius || 18}px`,
            background: fill,
            border: strokeWidth > 0 ? `${strokeWidth}px solid ${stroke}` : undefined,
          }}
        />
      );
  }
};

export default CustomShapeRenderer;
