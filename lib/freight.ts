export function allocateFreight(total: number, lines: { grams: number; units: number }[]): number[] {
  const weights = lines.map(l => l.grams * l.units);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let given = 0;
  lines.forEach((_, i) => {
    const share = i === lines.length - 1 ? total - given : Math.floor(total * weights[i] / sum);
    out.push(share);
    given += share;
  });
  return out;
}
