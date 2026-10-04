'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, AudioLines, Check, Clock3, Video } from 'lucide-react';
import { formatMoney } from '../lib/money.js';

/** @param {{ plans: ReadonlyArray<Readonly<import('../lib/config.js').Plan>> }} props */
export function PlanPreview({ plans }) {
  const [mode, setMode] = useState(
    /** @type {import('../lib/config.js').CallMode} */ ('video'),
  );
  return (
    <div>
      <div
        className="mode-selector"
        role="group"
        aria-label="Conversation mode"
      >
        <button
          type="button"
          aria-pressed={mode === 'video'}
          onClick={() => setMode('video')}
        >
          <Video size={18} aria-hidden="true" /> Video call
        </button>
        <button
          type="button"
          aria-pressed={mode === 'audio'}
          onClick={() => setMode('audio')}
        >
          <AudioLines size={18} aria-hidden="true" /> Browser audio
        </button>
      </div>
      <p className="mode-description" aria-live="polite">
        {mode === 'video'
          ? 'Meet face to face, from a place that feels like you.'
          : 'Just our voices. No camera, no need to be on screen.'}
      </p>
      <div className="plan-grid">
        {plans
          .filter((plan) => plan.mode === mode && plan.enabled)
          .map((plan) => (
            <article
              className={`plan-card ${plan.durationMinutes === 60 ? 'plan-card-long' : ''}`}
              key={plan.id}
            >
              <div className="plan-card-top">
                <span className="plan-duration">
                  <Clock3 size={17} aria-hidden="true" /> {plan.durationMinutes}{' '}
                  minutes
                </span>
                <span className="plan-type">
                  {mode === 'video' ? 'Video' : 'Audio'}
                </span>
              </div>
              <h3>
                {plan.durationMinutes === 30
                  ? 'A little pause'
                  : 'Room to unfold'}
              </h3>
              <p>
                {plan.durationMinutes === 30
                  ? 'A thoughtful check-in, a fresh perspective, or a moment to share.'
                  : 'More time to slow down, follow your thoughts, and let the conversation flow.'}
              </p>
              <div className="plan-price">
                {formatMoney(plan.amountInPaise)} <span>/ session</span>
              </div>
              <div className="plan-benefit">
                <Check size={16} aria-hidden="true" /> One-to-one · No recording
              </div>
              <Link
                href={`/book?planId=${plan.id}`}
                className={`button ${plan.durationMinutes === 30 ? 'button-outline' : ''}`}
              >
                Choose {plan.durationMinutes} minutes{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </article>
          ))}
      </div>
    </div>
  );
}
