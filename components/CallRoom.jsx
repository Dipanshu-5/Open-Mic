'use client';
import { useEffect, useRef, useState } from 'react';
import {
  HMSReactiveStore,
  selectPeers,
  selectVideoTrackByPeerID,
} from '@100mslive/hms-video-store';

/** @param {{session:{token:string,name:string,mode:'audio'|'video'},onLeave:()=>void}} props */
export default function CallRoom({ session, onLeave }) {
  const container = useRef(/** @type {HTMLDivElement|null} */ (null));
  const actions = useRef(
    /** @type {ReturnType<HMSReactiveStore['getActions']>|null} */ (null),
  );
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(session.mode === 'audio');
  useEffect(() => {
    const sdk = new HMSReactiveStore();
    sdk.triggerOnSubscribe();
    const store = sdk.getStore();
    const hmsActions = sdk.getActions();
    actions.current = hmsActions;
    let active = true;
    /** @type {(()=>void)[]} */ let cleanupTiles = [];
    const unsubscribe = store.subscribe((peers) => {
      for (const cleanup of cleanupTiles) cleanup();
      cleanupTiles = [];
      const target = container.current;
      if (!target) return;
      target.replaceChildren();
      for (const peer of peers) {
        const tile = document.createElement('div');
        tile.className = 'peer-tile';
        const label = document.createElement('span');
        label.textContent = `${peer.name}${peer.isLocal ? ' (you)' : ''}`;
        if (session.mode === 'video') {
          const video = document.createElement('video');
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          tile.append(video);
          let attached = '';
          const untrack = store.subscribe((track) => {
            if (attached) hmsActions.detachVideo(attached, video);
            attached = track?.id || '';
            if (attached)
              hmsActions.attachVideo(attached, video).catch(() => {
                if (active)
                  setError(
                    'Video could not be displayed. Try turning your camera off and on.',
                  );
              });
          }, selectVideoTrackByPeerID(peer.id));
          cleanupTiles.push(() => {
            untrack();
            if (attached) hmsActions.detachVideo(attached, video);
          });
        }
        tile.append(label);
        target.append(tile);
      }
    }, selectPeers);
    hmsActions
      .join({
        userName: session.name,
        authToken: session.token,
        settings: {
          isAudioMuted: false,
          isVideoMuted: session.mode === 'audio',
        },
      })
      .catch(() => {
        if (active)
          setError(
            'The room could not connect. Check microphone/camera permissions and your connection, then leave and retry.',
          );
      });
    return () => {
      active = false;
      unsubscribe();
      for (const cleanup of cleanupTiles) cleanup();
      hmsActions.leave().catch(() => {});
    };
  }, [session]);
  async function toggleAudio() {
    try {
      await actions.current?.setLocalAudioEnabled(muted);
      setMuted((value) => !value);
    } catch {
      setError(
        'Microphone access is unavailable. Check your browser permissions.',
      );
    }
  }
  async function toggleVideo() {
    try {
      await actions.current?.setLocalVideoEnabled(cameraOff);
      setCameraOff((value) => !value);
    } catch {
      setError('Camera access is unavailable. You can continue with audio.');
    }
  }
  return (
    <div className="call-room">
      <div ref={container} className="peer-grid" />
      <div className="call-controls">
        <button
          type="button"
          className="button button-outline"
          onClick={toggleAudio}
        >
          {muted ? 'Unmute microphone' : 'Mute microphone'}
        </button>
        {session.mode === 'video' && (
          <button
            type="button"
            className="button button-outline"
            onClick={toggleVideo}
          >
            {cameraOff ? 'Turn camera on' : 'Turn camera off'}
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={async () => {
            await actions.current?.leave();
            onLeave();
          }}
        >
          Leave conversation
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="field-hint">
        Recording is disabled. If a permission is denied, you can enable it in
        your browser’s site settings and rejoin.
      </p>
    </div>
  );
}
