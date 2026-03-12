"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useSimulateContract, useWriteContract } from "wagmi";

import { ReloadIcon } from "@radix-ui/react-icons";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  CANDIDATE_PROFILE_SCHEMA_UID,
  EAS_ABI,
  EAS_CONTRACT_ADDRESS,
} from "@/config/eas";
import { useCandidateProfiles } from "@/hooks/use-candidate-profiles";
import { encodeCandidateProfile } from "@/lib/eas";
import { getSimulationErrorMessage } from "@/lib/error-utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const NAME_MAX = 100;
const STATEMENT_MAX = 2000;

interface CandidateProfileFormProps {
  proposalId: string;
}

export function CandidateProfileForm({
  proposalId,
}: CandidateProfileFormProps): React.ReactElement {
  const { address } = useAccount();
  const { profiles, refetch } = useCandidateProfiles(proposalId);

  const existingProfile = address
    ? profiles.get(address.toLowerCase())
    : undefined;

  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [discourseHandle, setDiscourseHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (existingProfile && !prefilled) {
      setName(existingProfile.name);
      setStatement(existingProfile.statement);
      setDiscourseHandle(existingProfile.discourseHandle);
      setTwitterHandle(existingProfile.twitterHandle);
      setPrefilled(true);
    }
  }, [existingProfile, prefilled]);

  const isValid =
    name.trim().length > 0 &&
    name.length <= NAME_MAX &&
    statement.length <= STATEMENT_MAX;

  const encodedData = useMemo(() => {
    if (!isValid) return undefined;
    try {
      return encodeCandidateProfile(
        BigInt(proposalId),
        name.trim(),
        statement.trim(),
        discourseHandle.trim(),
        twitterHandle.trim()
      );
    } catch {
      return undefined;
    }
  }, [proposalId, name, statement, discourseHandle, twitterHandle, isValid]);

  const attestArgs = useMemo(() => {
    if (!encodedData) return undefined;
    return [
      {
        schema: CANDIDATE_PROFILE_SCHEMA_UID,
        data: {
          recipient: ZERO_ADDRESS,
          expirationTime: BigInt(0),
          revocable: true,
          refUID: ZERO_BYTES32,
          data: encodedData,
          value: BigInt(0),
        },
      },
    ] as const;
  }, [encodedData]);

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
  } = useSimulateContract({
    address: EAS_CONTRACT_ADDRESS,
    abi: EAS_ABI,
    functionName: "attest",
    args: attestArgs,
    query: { enabled: !!attestArgs },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isSimulateError || !simulateError) return null;
    return getSimulationErrorMessage(simulateError);
  }, [isSimulateError, simulateError]);

  const {
    data: txHash,
    isPending: isWriting,
    isSuccess,
    writeContract,
  } = useWriteContract();

  useEffect(() => {
    if (txHash) {
      toast(existingProfile ? "Profile updated!" : "Profile published!");
      refetch();
    }
  }, [txHash, existingProfile, refetch]);

  function handleSubmit(): void {
    if (simulateData?.request) {
      writeContract(simulateData.request);
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">
        {existingProfile ? "Update Profile" : "Candidate Profile"}
      </h4>

      <div className="space-y-2">
        <Label htmlFor="profile-name">Name *</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name or alias"
          variant="glass"
          maxLength={NAME_MAX}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-statement">Statement</Label>
        <textarea
          id="profile-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Why are you running? (optional)"
          maxLength={STATEMENT_MAX}
          rows={4}
          className="flex w-full rounded-md border glass-subtle border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
        <div className="text-xs text-muted-foreground text-right">
          {statement.length}/{STATEMENT_MAX}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="profile-discourse">Discourse</Label>
          <Input
            id="profile-discourse"
            value={discourseHandle}
            onChange={(e) => setDiscourseHandle(e.target.value)}
            placeholder="username"
            variant="glass"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-twitter">Twitter/X</Label>
          <Input
            id="profile-twitter"
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value)}
            placeholder="handle"
            variant="glass"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {simulationErrorMessage && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {simulationErrorMessage}
        </p>
      )}

      {isSuccess ? (
        <Button variant="secondary" disabled size="sm">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {existingProfile ? "Updated" : "Published"}
        </Button>
      ) : isWriting ? (
        <Button disabled size="sm">
          <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
          Submitting...
        </Button>
      ) : (
        <Button
          onClick={handleSubmit}
          disabled={!simulateData?.request}
          size="sm"
        >
          {existingProfile ? "Update Profile" : "Publish Profile"}
        </Button>
      )}
    </div>
  );
}
