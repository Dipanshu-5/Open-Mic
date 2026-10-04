import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  CircleCheck,
  HeartHandshake,
  Sparkles,
  Video,
} from 'lucide-react';
import { PlanPreview } from '../components/PlanPreview.jsx';
import { PLANS } from '../lib/config.js';

export default function HomePage() {
  return (
    <>
      <section className="hero page-width" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" /> One-to-one. At your own pace.
          </p>
          <h1 id="hero-heading">
            A little space
            <br />
            to <em>talk.</em>
          </h1>
          <p className="hero-description">
            Some days, a conversation is all you need.
            <br className="desktop-break" /> Make time to share, reflect, or
            simply be heard.
          </p>
          <a href="#sessions" className="button hero-button">
            Find your conversation <ArrowRight size={19} aria-hidden="true" />
          </a>
          <p className="hero-caption">
            <CircleCheck size={15} aria-hidden="true" /> From ₹299 · 30 or 60
            minutes · Online
          </p>
        </div>
        <div className="conversation-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-sun" />
          <div className="bubble bubble-back">
            <span />
            <span />
            <span />
          </div>
          <div className="bubble bubble-front">
            <AudioLines size={76} strokeWidth={1.15} />
          </div>
          <div className="art-label">
            <Sparkles size={17} strokeWidth={1.5} /> A moment, just for you
          </div>
          <span className="art-star star-one">✳</span>
          <span className="art-star star-two">✧</span>
        </div>
      </section>

      <div className="reassurance page-width">
        <span>
          <HeartHandshake size={19} aria-hidden="true" /> A human connection
        </span>
        <span>
          <Video size={19} aria-hidden="true" /> Video or browser audio
        </span>
        <span>
          <CircleCheck size={19} aria-hidden="true" /> No recordings
        </span>
      </div>

      <section
        id="sessions"
        className="sessions-section page-width"
        aria-labelledby="sessions-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR TIME, YOUR WAY</p>
            <h2 id="sessions-heading">How would you like to talk?</h2>
          </div>
          <p>
            Choose what feels comfortable.
            <br />
            Both ways make room for you.
          </p>
        </div>
        <PlanPreview plans={PLANS} />
      </section>

      <section
        id="how-it-works"
        className="how-section"
        aria-labelledby="how-heading"
      >
        <div className="page-width">
          <p className="eyebrow">A SIMPLE START</p>
          <h2 id="how-heading">From a little time to a good conversation.</h2>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <h3>Make it yours</h3>
              <p>Pick video or browser audio, then choose 30 or 60 minutes.</p>
            </article>
            <article>
              <span className="step-number">02</span>
              <h3>Find your moment</h3>
              <p>
                Choose an available time and pay securely. No guest account
                needed.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <h3>Settle in and talk</h3>
              <p>
                Your private booking link will bring you to the conversation
                when it’s time.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="closing-section page-width">
        <span className="closing-icon">
          <AudioLines size={28} aria-hidden="true" />
        </span>
        <h2>You don’t need the perfect words.</h2>
        <p>Just bring yourself. We’ll start there.</p>
        <a href="#sessions" className="text-link">
          Explore the sessions <ArrowDown size={17} aria-hidden="true" />
        </a>
        <p className="service-note">
          Conversation sessions are not therapy or medical, legal, or financial
          advice, and are not an emergency service.
        </p>
      </section>
    </>
  );
}
