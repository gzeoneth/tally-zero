import { ethers } from "ethers";
import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { useFormattedProposals } from "@/hooks/use-formatted-proposals";
import { useParseProposals } from "@hooks/use-parse-proposals";
import { useSearchProposals } from "@hooks/use-search-proposals";

import { ContractParams, State } from "@/types/search";

import { getBlockRange, selectDAOByGovernorAddress } from "@/lib/dao";
import { publicClientToProvider } from "@/lib/ethers";
import GovernorABI from "@data/OzGovernor_ABI.json";

export function useGovernorContract({
  values,
  state,
  setState,
}: {
  values: ContractParams;
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
}) {
  const [overallProgress, setOverallProgress] = useState(0);

  // Wagmi v2: usePublicClient instead of useProvider
  const publicClient = usePublicClient({
    chainId: parseInt(values.networkId?.toString() as string),
  });

  const [provider, setProvider] = useState<
    ethers.providers.Provider | undefined
  >();
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    const initProvider = async () => {
      setProviderReady(false);
      setProvider(undefined); // Clear provider while initializing

      if (values.rpcUrl && values.rpcUrl.trim()) {
        try {
          const jsonRpcProvider = new ethers.providers.JsonRpcProvider(
            values.rpcUrl
          );
          // Wait for provider to be ready
          await jsonRpcProvider.ready;
          // Test the provider with a simple call
          await jsonRpcProvider.getBlockNumber();
          setProvider(jsonRpcProvider);
          setProviderReady(true);
        } catch (error) {
          console.error("Failed to create custom provider:", error);
          // Fall back to wagmi provider
          if (publicClient) {
            try {
              const ethersProvider = publicClientToProvider(publicClient);
              setProvider(ethersProvider);
            } catch (e) {
              console.error(
                "Failed to create ethers provider from publicClient:",
                e
              );
            }
          }
          setProviderReady(true);
        }
      } else {
        if (publicClient) {
          try {
            const ethersProvider = publicClientToProvider(publicClient);
            setProvider(ethersProvider);
          } catch (e) {
            console.error(
              "Failed to create ethers provider from publicClient:",
              e
            );
          }
        }
        setProviderReady(true);
      }
    };

    initProvider();
  }, [values.rpcUrl, values.networkId, publicClient]);

  const dao = selectDAOByGovernorAddress(values.contractAddress);

  // Create governor contract instance when provider is ready
  const governorContractRef = useRef(state.governor.contract);

  useEffect(() => {
    if (
      !governorContractRef.current &&
      providerReady &&
      provider &&
      values.contractAddress
    ) {
      const governorContract = new ethers.Contract(
        values.contractAddress?.toString() as string,
        GovernorABI,
        provider
      );

      governorContractRef.current = governorContract;

      setState((prevState) => ({
        ...prevState,
        system: {},
        governor: {
          ...prevState.governor,
          contract: governorContract,
          name: undefined,
        },
      }));
    }
  }, [
    provider,
    providerReady,
    values.contractAddress,
    state.governor.contract,
    values.state?.governor.contract,
    setState,
  ]);

  // Update the ref when state.governor.contract changes outside of this useEffect
  useEffect(() => {
    governorContractRef.current = state.governor.contract;
  }, [state.governor.contract]);

  // When governor contract is ready, find Proposals
  // Use custom block range if provided, otherwise use DAO config or default
  const defaultBlockRange = getBlockRange(dao) as number;
  const blockRange = values.blockRange || defaultBlockRange || 10000;

  const shouldSearch = providerReady && !!provider && !!state.governor.contract;
  const { proposals, searchProgress, error, isSearching } = useSearchProposals({
    provider: provider!, // We know provider exists when shouldSearch is true
    contractAddress: values.contractAddress,
    blockRange,
    daysToSearch: values.daysToSearch || 30, // Default to 30 days
    parallelQueries: 3, // Use 3 parallel queries for better performance
    enabled: shouldSearch,
  });

  // When Proposals, parse them into a more readable format
  const shouldParse = providerReady && proposals.length > 0 && !!provider;
  const parsedProposals = useParseProposals(
    provider!, // We know provider exists when shouldParse is true
    values.contractAddress,
    proposals,
    shouldParse
  );
  const formattedProposals = useFormattedProposals(
    parsedProposals,
    values.networkId?.toString() as string
  );

  useEffect(() => {
    setOverallProgress(searchProgress);
  }, [searchProgress]);

  return {
    overallProgress,
    formattedProposals,
    searchError: error,
    isSearching,
    isProviderReady: providerReady,
  };
}
