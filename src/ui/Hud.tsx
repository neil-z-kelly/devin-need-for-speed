import type { Game } from '../game/Game';
import { formatTime } from '../race/RaceRules';
import { hudStore, useStore } from '../state/store';
import { ControlsList } from './ControlsList';

export function Hud({ game, redline }: { game: Game; redline: number }) {
  const speed = useStore(hudStore, (s) => s.speedKmh);
  const rpm = useStore(hudStore, (s) => s.rpm);
  const gear = useStore(hudStore, (s) => s.gear);
  const nitrous = useStore(hudStore, (s) => s.nitrous);
  const nitrousActive = useStore(hudStore, (s) => s.nitrousActive);
  const wrongWay = useStore(hudStore, (s) => s.wrongWay);
  const phase = useStore(hudStore, (s) => s.phase);
  const showPerf = useStore(hudStore, (s) => s.showPerf);
  const countdown = useStore(hudStore, (s) => s.countdown);

  return (
    <div className="overlay">
      {showPerf && <PerfPanel />}
      <RaceStatus />
      <Standings />
      {countdown >= 0 && <div className={`countdown${countdown === 0 ? ' go' : ''}`}>{countdown === 0 ? 'GO' : Math.ceil(countdown)}</div>}
      {wrongWay && <div className="banner">WRONG WAY</div>}
      {phase === 'paused' && (
        <div className="screen dim">
          <div className="card">
            <div className="eyebrow">Paused</div>
            <h2>Harbor Circuit</h2>
            <div className="buttons">
              <button onClick={() => game.resume()}>Resume</button>
              <button onClick={() => game.startRace()}>Restart Race</button>
              <button onClick={() => game.toMenu()}>Quit to Menu</button>
            </div>
            <ControlsList />
          </div>
        </div>
      )}
      <div className="hud-speed">
        <div className="value">{Math.round(speed)}</div>
        <div className="unit">KM/H</div>
        <div className="rpm">
          <i style={{ transform: `scaleX(${Math.min(rpm / redline, 1)})` }} />
        </div>
        <div className="gear">
          GEAR <b>{gear === 0 ? 'R' : gear}</b>
          <span style={{ marginLeft: 'auto' }}>{Math.round(rpm)} RPM</span>
        </div>
        <div className={`nos${nitrousActive ? ' active' : ''}`}>
          NOS
          <div className="bar">
            <i style={{ transform: `scaleX(${nitrous})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RaceStatus() {
  const lap = useStore(hudStore, (s) => s.lap);
  const totalLaps = useStore(hudStore, (s) => s.totalLaps);
  const lapTime = useStore(hudStore, (s) => s.lapTime);
  const lastLap = useStore(hudStore, (s) => s.lastLapTime);
  const bestLap = useStore(hudStore, (s) => s.bestLapTime);
  const position = useStore(hudStore, (s) => s.position);
  const total = useStore(hudStore, (s) => s.standings.length);
  return (
    <div className="race-status">
      <div className="position">
        <b>{position}</b>
        <small>/ {total}</small>
      </div>
      <div className="lap">
        LAP <b>{lap}</b> / {totalLaps}
      </div>
      <div className="times">
        <div>
          <span>TIME</span>
          <b>{formatTime(lapTime)}</b>
        </div>
        <div>
          <span>LAST</span>
          <b>{lastLap === null ? '--:--.---' : formatTime(lastLap)}</b>
        </div>
        <div>
          <span>BEST</span>
          <b>{bestLap === null ? '--:--.---' : formatTime(bestLap)}</b>
        </div>
      </div>
    </div>
  );
}

function Standings() {
  const rows = useStore(hudStore, (s) => s.standings);
  return (
    <ol className="standings">
      {rows.map((r, i) => (
        <li key={r.name} className={r.isPlayer ? 'player' : ''}>
          <span className="pos">{i + 1}</span>
          <i className="swatch" style={{ background: r.paint }} />
          <span className="name">{r.name}</span>
          <span className="gap">{r.finishTime !== null ? formatTime(r.finishTime) : i === 0 ? 'LEADER' : `+${Math.round(r.metresBehind)} m`}</span>
        </li>
      ))}
    </ol>
  );
}

function PerfPanel() {
  const fps = useStore(hudStore, (s) => s.fps);
  const frameMs = useStore(hudStore, (s) => s.frameMs);
  const worst = useStore(hudStore, (s) => s.worst1PercentMs);
  const drawCalls = useStore(hudStore, (s) => s.drawCalls);
  const triangles = useStore(hudStore, (s) => s.triangles);
  const gpu = useStore(hudStore, (s) => s.gpu);
  return (
    <div className="perf">
      <div className="big">
        {fps.toFixed(1)}
        <small>FPS</small>
      </div>
      <div>
        frame {frameMs.toFixed(1)} ms, worst 1% {worst.toFixed(1)} ms
      </div>
      <div>
        {drawCalls} draw calls, {(triangles / 1000).toFixed(0)}k tris
      </div>
      <div className="gpu" title={gpu}>
        {gpu}
      </div>
    </div>
  );
}
