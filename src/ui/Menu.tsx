import type { Game } from '../game/Game';
import { formatTime } from '../race/RaceRules';
import { loadBestTimes } from '../state/bestTimes';
import { LAP_OPTIONS, PAINT_COLORS, QUALITY_LEVELS, VEHICLES, settingsStore, type QualityLevel } from '../state/settings';
import { hudStore, useStore } from '../state/store';
import { ControlsList } from './ControlsList';
import { VehicleIcon } from './VehicleIcon';

export function Menu({ game }: { game: Game }) {
  const quality = useStore(settingsStore, (s) => s.quality);
  const volume = useStore(settingsStore, (s) => s.masterVolume);
  const paintIndex = useStore(settingsStore, (s) => s.paintIndex);
  const showPerf = useStore(settingsStore, (s) => s.showPerf);
  const laps = useStore(settingsStore, (s) => s.laps);
  const vehicle = useStore(settingsStore, (s) => s.vehicle);
  const gpu = useStore(hudStore, (s) => s.gpu);
  const best = loadBestTimes();

  const setQuality = (q: QualityLevel) => {
    settingsStore.set({ quality: q });
    window.location.reload();
  };

  return (
    <div className="screen menu">
      <div className="card wide">
        <div className="eyebrow">Harbor Circuit, {laps} {laps === 1 ? 'lap' : 'laps'}, 5 opponents</div>
        <h1>
          Devin <span>Need for Speed</span>
        </h1>
        <button className="primary" onClick={() => game.startRace()}>
          Start Race
        </button>

        <section>
          <h3>Vehicle</h3>
          <div className="vehicles" role="radiogroup" aria-label="Vehicle">
            {VEHICLES.map((v) => (
              <button
                key={v.id}
                role="radio"
                aria-checked={v.id === vehicle}
                data-vehicle={v.id}
                className={`vehicle-btn${v.id === vehicle ? ' selected' : ''}`}
                onClick={() => settingsStore.set({ vehicle: v.id })}
              >
                <VehicleIcon kind={v.id} paint={PAINT_COLORS[paintIndex].hex} />
                <b>{v.name}</b>
                <span>{v.blurb}</span>
              </button>
            ))}
          </div>
          <div className="muted small">The garage behind the menu shows your pick in your chosen paint.</div>
        </section>

        <section>
          <h3>Race Length</h3>
          <div className="segmented">
            {LAP_OPTIONS.map((n) => (
              <button key={n} className={n === laps ? 'selected' : ''} onClick={() => settingsStore.set({ laps: n })}>
                {n} {n === 1 ? 'lap' : 'laps'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Paint</h3>
          <div className="swatches">
            {PAINT_COLORS.map((c, i) => (
              <button
                key={c.hex}
                className={`swatch-btn${i === paintIndex ? ' selected' : ''}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={c.name}
                onClick={() => settingsStore.set({ paintIndex: i })}
              />
            ))}
          </div>
        </section>

        <section>
          <h3>Graphics Quality</h3>
          <div className="segmented">
            {QUALITY_LEVELS.map((q) => (
              <button key={q} className={q === quality ? 'selected' : ''} onClick={() => setQuality(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="muted small" title={gpu}>
            Changing quality reloads the game. Renderer: {gpu}
          </div>
          <label className="check">
            <input type="checkbox" checked={showPerf} onChange={(e) => settingsStore.set({ showPerf: e.target.checked })} />
            Show performance overlay
          </label>
        </section>

        <section>
          <h3>Audio Volume</h3>
          <label className="slider">
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => settingsStore.set({ masterVolume: Number(e.target.value) })} />
            <span>{Math.round(volume * 100)}%</span>
          </label>
        </section>

        <section>
          <h3>Best Times</h3>
          <div className="best-times">
            <div>
              <span>Best lap</span>
              <b>{best.bestLap === null ? '--:--.---' : formatTime(best.bestLap)}</b>
            </div>
            <div>
              <span>Best race</span>
              <b>{best.bestRace === null ? '--:--.---' : formatTime(best.bestRace)}</b>
            </div>
          </div>
        </section>

        <section>
          <h3>Controls</h3>
          <ControlsList />
        </section>
      </div>
    </div>
  );
}
