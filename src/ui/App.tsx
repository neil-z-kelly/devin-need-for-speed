import { useEffect, useRef } from 'react';
import { Game } from '../game/Game';
import { hudStore, useStore } from '../state/store';
import { SPORTS_COUPE } from '../physics/drivetrain';
import { Hud } from './Hud';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useStore(hudStore, (s) => s.phase);
  const error = useStore(hudStore, (s) => s.error);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    game.start().catch((err: unknown) => {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      hudStore.set({ error: message });
    });
    return () => game.dispose();
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="game" tabIndex={0} />
      {phase === 'loading' || error ? <LoadingScreen /> : <Hud redline={SPORTS_COUPE.redlineRpm} />}
    </>
  );
}

function LoadingScreen() {
  const progress = useStore(hudStore, (s) => s.loadingProgress);
  const label = useStore(hudStore, (s) => s.loadingLabel);
  const error = useStore(hudStore, (s) => s.error);
  return (
    <div className="screen">
      <div className="card">
        <div className="eyebrow">Harbor Circuit</div>
        <h1>
          Devin <span>Need for Speed</span>
        </h1>
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <>
            <div className="progress">
              <i style={{ transform: `scaleX(${progress})` }} />
            </div>
            <div className="muted">{label}</div>
          </>
        )}
      </div>
    </div>
  );
}
