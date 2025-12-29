import { getAddressExplorerUrl, getExplorerName } from "@/lib/explorer-utils";
import type { Address } from "@/types/search";
import { Addreth, AddrethConfig } from "addreth";
import { useTheme } from "next-themes";

export function ProposerCell({ proposer }: { proposer: Address }) {
  const { theme } = useTheme();

  return (
    <AddrethConfig>
      <Addreth
        ens={false}
        address={proposer}
        theme={theme === "dark" ? "dark" : "light"}
        explorer={(address) => ({
          name: getExplorerName("arb1"),
          accountUrl: getAddressExplorerUrl(address),
        })}
      />
    </AddrethConfig>
  );
}
