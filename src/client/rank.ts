export interface Row {
  wins: number;
}

/**
 * Competition ranking for a finished match: seats level on hand wins share a
 * place and the place after a tie skips (1, 2, 2, 4).
 *
 * The match is decided by wins alone — the points ledger is gone, so there is no
 * second column to break a tie with. The result card used to number the sorted
 * rows 1..4, so two cats level were shown as second and third: a podium invented
 * out of a tie. Ranks are display only.
 */
export function competitionRanks<T extends Row>(rows: T[]): Array<T & { rank: number }> {
  return rows.reduce<Array<T & { rank: number }>>((acc, row, i) => {
    const prev = acc[i - 1];
    const shared = prev !== undefined && prev.wins === row.wins;
    acc.push({ ...row, rank: shared ? prev.rank : i + 1 });
    return acc;
  }, []);
}
