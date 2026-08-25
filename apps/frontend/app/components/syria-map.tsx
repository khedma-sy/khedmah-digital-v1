'use client';

import { useRouter } from 'next/navigation';
import { provinces } from '../../lib/platform-data';

const umbrellaServices = [
  ['⌂', 'تعليم'], ['♥', 'صحة'], ['▦', 'تجارة'], ['●', 'خدمات'],
  ['⚒', 'مهنيون'], ['▥', 'شركات'], ['◆', 'سيارات']
];

export function SyriaMap() {
  const router = useRouter();
  return (
    <div className="syria-map" aria-label="خريطة المحافظات السورية">
      <div className="map-orbit map-orbit-one" /><div className="map-orbit map-orbit-two" />
      <div className="umbrella-canopy" aria-hidden="true"><span className="canopy-spire" /><i /><i /><i /><i /><i /></div>
      <div className="umbrella-services" aria-label="قطاعات مظلة خدمة">
        {umbrellaServices.map(([icon, label]) => <span key={label}><b>{icon}</b><small>{label}</small></span>)}
      </div>
      <div className="umbrella-pole" aria-hidden="true" />
      <svg viewBox="0 0 760 520" role="img" aria-label="سوريا، اختر محافظة للمتابعة">
        <defs>
          <linearGradient id="mapFill" x1="0" x2="1"><stop stopColor="#071f46"/><stop offset="1" stopColor="#0b3973"/></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path className="syria-shape" d="M102 164 L196 137 L247 100 L359 91 L418 60 L552 82 L641 124 L654 184 L618 234 L644 284 L603 330 L539 348 L526 408 L423 431 L366 480 L273 452 L238 395 L164 365 L126 310 L75 261 L91 215 Z" />
        <g className="map-lines">
          <path d="M180 180 L365 132 L523 166 L580 279 L430 345 L310 290 L180 180 M365 132 L430 345 M310 290 L273 410 M523 166 L430 345" />
        </g>
      </svg>
      {provinces.map((province) => (
        <button key={province.slug} className={`province-node province-${province.slug}`} data-map-id={province.mapId} onClick={() => router.push(`/locations/${province.slug}`)} aria-label={`استكشف خدمات ${province.name}`}>
          <span className="node-pulse" /><span className="node-dot" /><span className="node-label">{province.name}</span>
        </button>
      ))}
      <div className="map-caption"><span className="status-dot" /> تغطية رقمية تتوسع في كل سوريا</div>
    </div>
  );
}
