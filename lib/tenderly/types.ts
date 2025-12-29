/**
 * Types for Tenderly simulation integration
 */

export interface TenderlySimulationRequest {
  network_id: string;
  from: string;
  to: string;
  input: string;
  value: string;
  gas: number;
  save: boolean;
  save_if_fails?: boolean;
  block_header?: {
    number?: string;
    timestamp: string;
  };
  state_objects?: Record<
    string,
    { balance?: string; storage?: Record<string, string> }
  >;
}

export interface TenderlySimulationResponse {
  simulation: {
    id: string;
    status: boolean;
  };
  transaction?: {
    call_trace?: Array<{
      error?: string;
    }>;
  };
}

export interface SimulationResult {
  simulationId: string;
  success: boolean;
}

export interface SimulationWithLink extends SimulationResult {
  link: string;
}

export interface TenderlySettings {
  org: string;
  project: string;
  accessToken: string | null;
}

export interface StorageEncodingResponse {
  stateOverrides: Record<string, { value: Record<string, string> }>;
}

export type ChainType = "L1" | "Arb1" | "Nova" | "unknown";
