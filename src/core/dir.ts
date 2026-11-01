/** Directions cardinales. Axe Y vers le bas (convention écran). */
export type Dir = 0 | 1 | 2 | 3; // 0=Est, 1=Sud, 2=Ouest, 3=Nord

export const DX: readonly number[] = [1, 0, -1, 0];
export const DY: readonly number[] = [0, 1, 0, -1];

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateCW = (d: Dir): Dir => ((d + 1) % 4) as Dir;
