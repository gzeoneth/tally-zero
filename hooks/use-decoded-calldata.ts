import { decodeCalldata, type DecodedCalldata } from "@lib/calldata-decoder";
import { useCallback, useEffect, useState } from "react";

interface UseDecodedCalldataOptions {
  calldata: string;
  targetAddress?: string;
  enabled?: boolean;
}

interface UseDecodedCalldataResult {
  decoded: DecodedCalldata | null;
  isDecoding: boolean;
  error: string | null;
  retry: () => void;
}

export function useDecodedCalldata({
  calldata,
  targetAddress,
  enabled = true,
}: UseDecodedCalldataOptions): UseDecodedCalldataResult {
  const [decoded, setDecoded] = useState<DecodedCalldata | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decode = useCallback(async () => {
    if (!enabled || !calldata || calldata === "0x") {
      setDecoded(null);
      setIsDecoding(false);
      return;
    }

    setIsDecoding(true);
    setError(null);

    try {
      const result = await decodeCalldata(calldata, targetAddress);
      setDecoded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decoding failed");
      setDecoded(null);
    } finally {
      setIsDecoding(false);
    }
  }, [calldata, targetAddress, enabled]);

  useEffect(() => {
    decode();
  }, [decode]);

  return {
    decoded,
    isDecoding,
    error,
    retry: decode,
  };
}
