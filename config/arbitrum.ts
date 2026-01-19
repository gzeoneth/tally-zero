export const ARBITRUM_CHAIN_ID = 42161;

export const ARBITRUM_GOVERNORS = {
  CORE: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  TREASURY: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
} as const;

export function isArbitrumGovernor(address: string): boolean {
  const normalized = address.toLowerCase();
  return Object.values(ARBITRUM_GOVERNORS).some(
    (addr) => addr.toLowerCase() === normalized
  );
}

export function isCoreGovernor(address: string): boolean {
  return address.toLowerCase() === ARBITRUM_GOVERNORS.CORE.toLowerCase();
}

export function isTreasuryGovernor(address: string): boolean {
  return address.toLowerCase() === ARBITRUM_GOVERNORS.TREASURY.toLowerCase();
}
