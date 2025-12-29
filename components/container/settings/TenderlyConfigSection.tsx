"use client";

import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
} from "@/config/storage-keys";

interface TenderlyConfigSectionProps {
  tenderlyOrgInput: string;
  setTenderlyOrgInput: (value: string) => void;
  tenderlyProjectInput: string;
  setTenderlyProjectInput: (value: string) => void;
  tenderlyAccessTokenInput: string;
  setTenderlyAccessTokenInput: (value: string) => void;
}

/**
 * Tenderly simulation configuration section
 */
export function TenderlyConfigSection({
  tenderlyOrgInput,
  setTenderlyOrgInput,
  tenderlyProjectInput,
  setTenderlyProjectInput,
  tenderlyAccessTokenInput,
  setTenderlyAccessTokenInput,
}: TenderlyConfigSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Tenderly Simulation</Label>
      <p className="text-xs text-muted-foreground">
        Configure Tenderly project for simulating retryable ticket executions
      </p>
      <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="tenderly-org" className="text-xs">
            Organization/User Name
          </Label>
          <Input
            id="tenderly-org"
            type="text"
            value={tenderlyOrgInput}
            onChange={(e) => setTenderlyOrgInput(e.target.value)}
            placeholder={DEFAULT_TENDERLY_ORG}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenderly-project" className="text-xs">
            Project Slug
          </Label>
          <Input
            id="tenderly-project"
            type="text"
            value={tenderlyProjectInput}
            onChange={(e) => setTenderlyProjectInput(e.target.value)}
            placeholder={DEFAULT_TENDERLY_PROJECT}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenderly-token" className="text-xs">
            Access Token
          </Label>
          <Input
            id="tenderly-token"
            type="password"
            value={tenderlyAccessTokenInput}
            onChange={(e) => setTenderlyAccessTokenInput(e.target.value)}
            placeholder="Enter your Tenderly access token"
          />
          <p className="text-[10px] text-muted-foreground">
            Required for simulation. Get from dashboard.tenderly.co
          </p>
        </div>
      </div>
    </div>
  );
}
