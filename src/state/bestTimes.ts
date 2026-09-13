export interface BestTimes {
  bestLap: number | null;
  bestRace: number | null;
}

const KEY = 'nfs.best.v1';

export function loadBestTimes(storage: Pick<Storage, 'getItem'> = localStorage): BestTimes {
  const raw = storage.getItem(KEY);
  if (!raw) return { bestLap: null, bestRace: null };
  const p = JSON.parse(raw) as Partial<Record<keyof BestTimes, unknown>>;
  return {
    bestLap: typeof p.bestLap === 'number' ? p.bestLap : null,
    bestRace: typeof p.bestRace === 'number' ? p.bestRace : null,
  };
}

/** Returns the merged record plus which entries improved. */
export function recordBestTimes(
  current: BestTimes,
  lap: number | null,
  race: number,
  storage: Pick<Storage, 'setItem'> = localStorage,
): { best: BestTimes; newBestLap: boolean; newBestRace: boolean } {
  const newBestLap = lap !== null && (current.bestLap === null || lap < current.bestLap);
  const newBestRace = current.bestRace === null || race < current.bestRace;
  const best: BestTimes = {
    bestLap: newBestLap ? lap : current.bestLap,
    bestRace: newBestRace ? race : current.bestRace,
  };
  storage.setItem(KEY, JSON.stringify(best));
  return { best, newBestLap, newBestRace };
}
