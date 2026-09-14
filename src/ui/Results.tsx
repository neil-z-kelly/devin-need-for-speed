import type { Game } from '../game/Game';
import { formatTime } from '../race/RaceRules';
import { hudStore, useStore } from '../state/store';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function Results({ game }: { game: Game }) {
  const result = useStore(hudStore, (s) => s.result);
  const standings = useStore(hudStore, (s) => s.standings);
  if (!result) return null;
  return (
    <div className="screen dim">
      <div className="card wide">
        <div className="eyebrow">Race Complete</div>
        <h1>
          You finished <span>{ORDINAL[result.position - 1]}</span>
        </h1>
        <div className="best-times">
          <div>
            <span>Total</span>
            <b>{formatTime(result.totalTime)}</b>
            {result.newBestRace && <em>New record</em>}
          </div>
          <div>
            <span>Best lap</span>
            <b>{result.bestLap === null ? '--:--.---' : formatTime(result.bestLap)}</b>
            {result.newBestLap && <em>New record</em>}
          </div>
        </div>
        <div className="lap-list">
          {result.lapTimes.map((t, i) => (
            <div key={i}>
              <span>Lap {i + 1}</span>
              <b>{formatTime(t)}</b>
            </div>
          ))}
        </div>
        <ol className="standings static">
          {standings.map((r, i) => (
            <li key={r.name} className={r.isPlayer ? 'player' : ''}>
              <span className="pos">{i + 1}</span>
              <i className="swatch" style={{ background: r.paint }} />
              <span className="name">{r.name}</span>
              <span className="gap">{r.finishTime !== null ? formatTime(r.finishTime) : `Lap ${r.lapsDone + 1}`}</span>
            </li>
          ))}
        </ol>
        <div className="buttons">
          <button className="primary" onClick={() => game.startRace()}>
            Retry
          </button>
          <button onClick={() => game.toMenu()}>Main Menu</button>
        </div>
      </div>
    </div>
  );
}
