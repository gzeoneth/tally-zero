import { decodeAbiParameters, encodeAbiParameters } from "viem";

import {
  CANDIDATE_PROFILE_SCHEMA_UID,
  EAS_GRAPHQL_URL,
  PROFILE_PARAM_TYPES,
} from "@/config/eas";
import { debug } from "@/lib/debug";
import type { CandidateProfile } from "@/types/eas";

export function encodeCandidateProfile(
  proposalId: bigint,
  name: string,
  statement: string,
  discourseHandle: string,
  twitterHandle: string
): `0x${string}` {
  return encodeAbiParameters(PROFILE_PARAM_TYPES, [
    proposalId,
    name,
    statement,
    discourseHandle,
    twitterHandle,
  ]);
}

interface DecodedProfile {
  proposalId: bigint;
  name: string;
  statement: string;
  discourseHandle: string;
  twitterHandle: string;
}

export function decodeCandidateProfile(data: `0x${string}`): DecodedProfile {
  const [proposalId, name, statement, discourseHandle, twitterHandle] =
    decodeAbiParameters(PROFILE_PARAM_TYPES, data);
  return {
    proposalId: proposalId as bigint,
    name: name as string,
    statement: statement as string,
    discourseHandle: discourseHandle as string,
    twitterHandle: twitterHandle as string,
  };
}

interface EasAttestation {
  id: string;
  attester: string;
  data: string;
  time: number;
  txid: string;
}

interface EasGraphqlResponse {
  data: {
    attestations: EasAttestation[];
  };
}

const CANDIDATE_PROFILES_QUERY = `
  query CandidateProfiles($schemaId: String!) {
    attestations(
      where: { schemaId: { equals: $schemaId }, revoked: { equals: false } }
      orderBy: [{ time: desc }]
    ) {
      id
      attester
      data
      time
      txid
    }
  }
`;

export async function fetchCandidateProfiles(
  proposalId: string,
  schemaUid: string = CANDIDATE_PROFILE_SCHEMA_UID
): Promise<Map<string, CandidateProfile>> {
  const profiles = new Map<string, CandidateProfile>();

  debug.eas("Fetching candidate profiles for proposal %s", proposalId);

  const response = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: CANDIDATE_PROFILES_QUERY,
      variables: { schemaId: schemaUid },
    }),
  });

  if (!response.ok) {
    throw new Error(`EAS GraphQL request failed: ${response.status}`);
  }

  const result: EasGraphqlResponse = await response.json();
  const attestations = result.data?.attestations ?? [];

  debug.eas("Received %d attestations", attestations.length);

  for (const attestation of attestations) {
    const attesterLower = attestation.attester.toLowerCase();

    // Already have a newer attestation for this attester (ordered desc by time)
    if (profiles.has(attesterLower)) continue;

    try {
      const decoded = decodeCandidateProfile(attestation.data as `0x${string}`);

      if (decoded.proposalId.toString() !== proposalId) continue;

      profiles.set(attesterLower, {
        name: decoded.name,
        statement: decoded.statement,
        discourseHandle: decoded.discourseHandle,
        twitterHandle: decoded.twitterHandle,
        proposalId,
        attester: attestation.attester,
        attestationUid: attestation.id,
        timestamp: attestation.time,
        txHash: attestation.txid,
      });
    } catch (e) {
      debug.eas("Failed to decode attestation %s: %O", attestation.id, e);
    }
  }

  debug.eas("Found %d profiles for proposal %s", profiles.size, proposalId);
  return profiles;
}
