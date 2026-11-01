/** Fluides transportés par tuyaux. Les quantités sont en litres, les températures en °C. */
export const FLUIDS = {
  water: { name: 'Eau', color: 0x4a90d9 },
  wort: { name: 'Moût', color: 0xc8892f },
  hopped_wort: { name: 'Moût houblonné', color: 0x9f8a2a },
  beer: { name: 'Bière', color: 0xf0b030 },
} as const;

export type FluidId = keyof typeof FLUIDS;
export const AMBIENT_TEMP = 18;
