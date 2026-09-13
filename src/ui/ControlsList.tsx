const CONTROLS: readonly [keys: string, action: string, pad: string][] = [
  ['W / Up', 'Throttle', 'RT'],
  ['S / Down', 'Brake, reverse', 'LT'],
  ['A D / Left Right', 'Steer', 'Left stick'],
  ['Space', 'Handbrake', 'A'],
  ['Shift', 'Nitrous', 'X'],
  ['R', 'Reset to track', 'Y / Back'],
  ['C', 'Camera', 'RB'],
  ['Esc / P', 'Pause', 'Start'],
];

export function ControlsList() {
  return (
    <table className="controls-table">
      <thead>
        <tr>
          <th>Keyboard</th>
          <th>Action</th>
          <th>Gamepad</th>
        </tr>
      </thead>
      <tbody>
        {CONTROLS.map(([keys, action, pad]) => (
          <tr key={action}>
            <td>
              <b>{keys}</b>
            </td>
            <td>{action}</td>
            <td>{pad}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
