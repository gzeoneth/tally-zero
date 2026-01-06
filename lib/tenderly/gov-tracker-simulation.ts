/**
 * Tenderly simulation integration using gov-tracker
 *
 * This module uses gov-tracker's extractAllSimulationsFromDecoded to prepare
 * simulation data, then calls Tenderly API to execute simulations.
 */

import { extractAllSimulationsFromDecoded } from "@gzeoneth/gov-tracker";
import type { ExtractedSimulation } from "@gzeoneth/gov-tracker/dist/types/simulation";
import type { EnrichedDecodedCalldata } from "@lib/calldata/decoder-wrapper";

import { getSimulationLink, getTenderlySettings } from "./settings";
import type {
  SimulationWithLink,
  StorageEncodingResponse,
  TenderlySimulationRequest,
  TenderlySimulationResponse,
} from "./types";

/**
 * Execute a Tenderly simulation from gov-tracker simulation data
 */
async function executeSimulation(
  simulation: ExtractedSimulation
): Promise<SimulationWithLink> {
  const { org, project, accessToken } = getTenderlySettings();
  const sim = simulation.simulation;

  // Handle timelock simulations with storage overrides
  if (sim.type === "timelock") {
    if (!accessToken) {
      throw new Error("Tenderly access token required for timelock simulation");
    }

    // First, encode storage overrides using Tenderly's API
    const encodeEndpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/contracts/encode-states`;

    const encodeResponse = await fetch(encodeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessToken,
      },
      body: JSON.stringify({
        networkID: sim.networkId,
        stateOverrides: {
          [sim.timelockAddress]: { value: sim.storageOverride.symbolic },
        },
      }),
    });

    if (!encodeResponse.ok) {
      const errorText = await encodeResponse.text();
      throw new Error(
        `Tenderly encode API error (${encodeResponse.status}): ${errorText}`
      );
    }

    const encodeData = (await encodeResponse.json()) as StorageEncodingResponse;
    const encodedStorage =
      encodeData.stateOverrides[sim.timelockAddress.toLowerCase()].value;

    // Create simulation timestamp
    const simTimestamp = Math.floor(Date.now() / 1000) + 1;

    // Now simulate with storage overrides
    const simEndpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

    const requestBody: TenderlySimulationRequest = {
      network_id: sim.networkId,
      from: sim.from,
      to: sim.to,
      input: sim.input,
      value: sim.value,
      gas: 30000000,
      save: true,
      save_if_fails: true,
      block_header: {
        timestamp: "0x" + simTimestamp.toString(16),
      },
      state_objects: {
        [sim.from]: { balance: "1000000000000000" },
        [sim.timelockAddress]: { storage: encodedStorage },
      },
    };

    const simResponse = await fetch(simEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessToken,
      },
      body: JSON.stringify(requestBody),
    });

    if (!simResponse.ok) {
      const errorText = await simResponse.text();
      throw new Error(
        `Tenderly simulation API error (${simResponse.status}): ${errorText}`
      );
    }

    const simData = (await simResponse.json()) as TenderlySimulationResponse;

    if (!simData.simulation?.id) {
      throw new Error("No simulation ID returned from Tenderly");
    }

    return {
      simulationId: simData.simulation.id,
      link: getSimulationLink(simData.simulation.id),
      success: simData.simulation.status,
    };
  }

  // Handle regular and retryable simulations
  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: sim.networkId,
    from: sim.from,
    to: sim.to,
    input: sim.input,
    value: sim.value,
    gas: 10000000,
    save: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers["X-Access-Key"] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tenderly API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TenderlySimulationResponse;

  if (!data.simulation?.id) {
    throw new Error("No simulation ID returned from Tenderly");
  }

  return {
    simulationId: data.simulation.id,
    link: getSimulationLink(data.simulation.id),
    success: data.simulation.status,
  };
}

/**
 * Simulate decoded calldata using Tenderly
 *
 * This function uses gov-tracker's extractAllSimulationsFromDecoded to identify
 * all simulatable actions in the decoded calldata, then executes them with Tenderly.
 *
 * @param decoded - Decoded calldata from gov-tracker
 * @param chainContext - Chain context for simulation
 * @returns Array of simulation results
 */
export async function simulateDecodedCalldata(
  decoded: EnrichedDecodedCalldata,
  chainContext: "arb1" | "nova" | "ethereum" = "arb1"
): Promise<Array<{ label: string; result: SimulationWithLink }>> {
  // Extract all simulations from the decoded calldata
  // Cast to the underlying type that gov-tracker expects
  const simulations = extractAllSimulationsFromDecoded(
    decoded as any,
    chainContext
  );

  // Execute each simulation
  const results = [];
  for (const sim of simulations) {
    try {
      const result = await executeSimulation(sim);
      results.push({ label: sim.label, result });
    } catch (error) {
      console.error(`Failed to simulate ${sim.label}:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Get simulation data without executing
 *
 * This returns the simulation data that can be used to execute simulations
 * manually or with other tools (e.g., Foundry).
 */
export function getSimulationData(
  decoded: EnrichedDecodedCalldata,
  chainContext: "arb1" | "nova" | "ethereum" = "arb1"
): ExtractedSimulation[] {
  // Cast to the underlying type that gov-tracker expects
  return extractAllSimulationsFromDecoded(decoded as any, chainContext);
}
