export interface Row {
  score: number;
  wins: number;
}

/**
 * Competition ranking for a finished hand: equal score AND equal wins share a
 * place, and the place after a tie skips (1, 2, 2, 4).
 *
 * The result card used to number the sorted rows 1..4, so two cats level on -36
 * were shown as second and third — a podium invented out of a tie. Ranks are
 * display only; nothing is paid out on them.
 */
export function competitionRanks<T extends Row>(rows: T[]): Array<T & { rank: number }> {
  return rows.reduce<Array<T & { rank: number }>>((acc, row, i) => {
    const prev = acc[i - 1];
    const shared = prev !== undefined && prev.score === row.score && prev.wins === row.wins;
    acc.push({ ...row, rank: shared ? prev.rank : i + 1 });
    return acc;
  }, []);
}
