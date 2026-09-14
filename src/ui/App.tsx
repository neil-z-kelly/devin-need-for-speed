import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/Game';
import { PLAYER_SPECS } from '../game/PlayerVehicle';
import { settingsStore } from '../state/settings';
import { hudStore, useStore } from '../state/store';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { Results } from './Results';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const phase = useStore(hudStore, (s) => s.phase);
  const error = useStore(hudStore, (s) => s.error);
  const vehicle = useStore(settingsStore, (s) => s.vehicle);

  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    if (!canvas || !minimap) return;
    const g = new Game(canvas, minimap);
    setGame(g);
    g.start().catch((err: unknown) => {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      hudStore.set({ error: message });
    });
    return () => g.dispose();
  }, []);

  const inRace = phase === 'countdown' || phase === 'racing' || phase === 'paused';
  return (
    <>
      <canvas ref={canvasRef} className="game" tabIndex={0} />
      <canvas ref={minimapRef} className="minimap" width={220} height={220} style={{ visibility: inRace ? 'visible' : 'hidden' }} />
      {(phase === 'loading' || error) && <LoadingScreen />}
      {game && phase === 'menu' && <Menu game={game} />}
      {game && inRace && <Hud game={game} redline={PLAYER_SPECS[vehicle].drivetrain.redlineRpm} />}
      {game && phase === 'finished' && <Results game={game} />}
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
