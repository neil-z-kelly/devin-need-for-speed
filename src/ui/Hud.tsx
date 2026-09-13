import { hudStore, useStore } from '../state/store';

export function Hud({ redline }: { redline: number }) {
  const speed = useStore(hudStore, (s) => s.speedKmh);
  const rpm = useStore(hudStore, (s) => s.rpm);
  const gear = useStore(hudStore, (s) => s.gear);
  const nitrous = useStore(hudStore, (s) => s.nitrous);
  const nitrousActive = useStore(hudStore, (s) => s.nitrousActive);
  const wrongWay = useStore(hudStore, (s) => s.wrongWay);
  const phase = useStore(hudStore, (s) => s.phase);
  const showPerf = useStore(hudStore, (s) => s.showPerf);

  return (
    <div className="overlay">
      {showPerf && <PerfPanel />}
      {wrongWay && <div className="banner">WRONG WAY</div>}
      {phase === 'paused' && <div className="banner">PAUSED</div>}
      <div className="controls">
        <div>
          <b>W S</b> throttle / brake
        </div>
        <div>
          <b>A D</b> steer
        </div>
        <div>
          <b>SPACE</b> handbrake
        </div>
        <div>
          <b>SHIFT</b> nitrous
        </div>
        <div>
          <b>R</b> reset <b style={{ marginLeft: 14 }}>C</b> camera <b style={{ marginLeft: 14 }}>ESC</b> pause
        </div>
      </div>
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
