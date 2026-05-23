/**
 * Periodic Table Element Data
 * Each element includes atomic number, symbol, name, atomic weight,
 * refined isotope name, raw ore name, and unlock cost.
 *
 * Unlock cost formula: atomicNumber * atomicWeight * 10000
 * Sell price per unit: atomicWeight (rounded to 2dp)
 */

export const ELEMENTS = [
  {
    atomicNumber: 1,
    symbol: 'H',
    name: 'Hydrogen',
    atomicWeight: 1.008,
    rawName: 'Hydrogen Ore',
    refinedName: 'Deuterium',
    refinedSymbol: '²H',
    unlockCost: 0, // Starting element, free
    color: '#00d4ff',
    bgColor: '#001a2e',
    description: 'The most abundant element in the universe.'
  },
  {
    atomicNumber: 2,
    symbol: 'He',
    name: 'Helium',
    atomicWeight: 4.003,
    rawName: 'Helium Ore',
    refinedName: 'Helium-3',
    refinedSymbol: '³He',
    unlockCost: Math.round(2 * 4.003 * 10000),
    color: '#ffe066',
    bgColor: '#1a1800',
    description: 'Rare isotope used in quantum computing and fusion reactors.'
  },
  {
    atomicNumber: 3,
    symbol: 'Li',
    name: 'Lithium',
    atomicWeight: 6.941,
    rawName: 'Lithium Ore',
    refinedName: 'Lithium-6',
    refinedSymbol: '⁶Li',
    unlockCost: Math.round(3 * 6.941 * 10000),
    color: '#ff6eb4',
    bgColor: '#1a0010',
    description: 'Critical isotope for thermonuclear applications.'
  },
  {
    atomicNumber: 4,
    symbol: 'Be',
    name: 'Beryllium',
    atomicWeight: 9.012,
    rawName: 'Beryllium Ore',
    refinedName: 'Beryllium-9',
    refinedSymbol: '⁹Be',
    unlockCost: Math.round(4 * 9.012 * 10000),
    color: '#88ff44',
    bgColor: '#0a1a00',
    description: 'Used in neutron reflectors and aerospace alloys.'
  },
  {
    atomicNumber: 5,
    symbol: 'B',
    name: 'Boron',
    atomicWeight: 10.811,
    rawName: 'Boron Ore',
    refinedName: 'Boron-10',
    refinedSymbol: '¹⁰B',
    unlockCost: Math.round(5 * 10.811 * 10000),
    color: '#ffaa44',
    bgColor: '#1a0e00',
    description: 'Neutron absorber used in nuclear reactor control rods.'
  },
  {
    atomicNumber: 6,
    symbol: 'C',
    name: 'Carbon',
    atomicWeight: 12.011,
    rawName: 'Carbon Ore',
    refinedName: 'Carbon-14',
    refinedSymbol: '¹⁴C',
    unlockCost: Math.round(6 * 12.011 * 10000),
    color: '#aaaaaa',
    bgColor: '#111111',
    description: 'Radioactive isotope essential for dating and tracer studies.'
  },
  {
    atomicNumber: 7,
    symbol: 'N',
    name: 'Nitrogen',
    atomicWeight: 14.007,
    rawName: 'Nitrogen Ore',
    refinedName: 'Nitrogen-15',
    refinedSymbol: '¹⁵N',
    unlockCost: Math.round(7 * 14.007 * 10000),
    color: '#66ccff',
    bgColor: '#001a2e',
    description: 'Stable isotope used in NMR spectroscopy and metabolic studies.'
  },
  {
    atomicNumber: 8,
    symbol: 'O',
    name: 'Oxygen',
    atomicWeight: 15.999,
    rawName: 'Oxygen Ore',
    refinedName: 'Oxygen-18',
    refinedSymbol: '¹⁸O',
    unlockCost: Math.round(8 * 15.999 * 10000),
    color: '#00aaff',
    bgColor: '#00001a',
    description: 'Heavy oxygen isotope used in medical PET imaging.'
  },
  {
    atomicNumber: 9,
    symbol: 'F',
    name: 'Fluorine',
    atomicWeight: 18.998,
    rawName: 'Fluorine Ore',
    refinedName: 'Fluorine-18',
    refinedSymbol: '¹⁸F',
    unlockCost: Math.round(9 * 18.998 * 10000),
    color: '#ffff44',
    bgColor: '#1a1a00',
    description: 'Key radioisotope in positron emission tomography.'
  },
  {
    atomicNumber: 10,
    symbol: 'Ne',
    name: 'Neon',
    atomicWeight: 20.180,
    rawName: 'Neon Ore',
    refinedName: 'Neon-22',
    refinedSymbol: '²²Ne',
    unlockCost: Math.round(10 * 20.180 * 10000),
    color: '#ff4488',
    bgColor: '#1a0010',
    description: 'Rare stable isotope used in precision scientific instruments.'
  }
  // Additional elements can be added here following the same pattern
  // The game is designed to support all 118 elements
];

/**
 * Get element by atomic number
 */
export function getElementById(atomicNumber) {
  return ELEMENTS.find(e => e.atomicNumber === atomicNumber) || null;
}

/**
 * Get sell price per unit (atomic weight rounded to 2dp)
 */
export function getSellPrice(element) {
  return Math.round(element.atomicWeight * 100) / 100;
}

/**
 * Get unlock cost for an element
 * Formula: atomicNumber * atomicWeight * 10000
 */
export function getUnlockCost(element) {
  if (element.atomicNumber === 1) return 0;
  return Math.round(element.atomicNumber * element.atomicWeight * 10000);
}

/**
 * Get purchase cost for next harvester or refiner
 * Formula: (purchaseOrder * atomicWeight_2dp) * 2^purchaseOrder
 */
export function getPurchaseCost(purchaseOrder, atomicWeight) {
  const w = Math.round(atomicWeight * 100) / 100;
  return (purchaseOrder * w) * Math.pow(2, purchaseOrder);
}

/**
 * Get upgrade cost for a harvester/refiner/lift/car
 * Formula: unitNumber * atomicWeight_2dp * 2^(currentLevel + 1)
 */
export function getUpgradeCost(unitNumber, atomicWeight, currentLevel) {
  const w = Math.round(atomicWeight * 100) / 100;
  return unitNumber * w * Math.pow(2, currentLevel + 1);
}

/**
 * Get production amount for purchase order N (1-indexed)
 * Formula: 2^(N-1)  →  1, 2, 4, 8, 16...
 */
export function getBaseProduction(purchaseOrder) {
  return Math.pow(2, purchaseOrder - 1);
}
