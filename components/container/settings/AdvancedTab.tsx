"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";
import { CACHE_TTL_OPTIONS } from "@/config/storage-keys";

import { BackupRestoreSection } from "./BackupRestoreSection";
import { CacheManagementSection } from "./CacheManagementSection";
import { DebugInfoSection } from "./DebugInfoSection";
import { formatTtl } from "./settings-utils";
import { TenderlyConfigSection } from "./TenderlyConfigSection";
import type { StoredSettings } from "./types";

interface AdvancedTabProps {
  // TTL settings
  ttlInput: number;
  setTtlInput: (value: number) => void;
  ttlCustomInput: string;
  setTtlCustomInput: (value: string) => void;
  // Skip preload cache
  skipPreloadCache: boolean;
  setSkipPreloadCache: (value: boolean) => void;
  // Tenderly settings
  tenderlyOrgInput: string;
  setTenderlyOrgInput: (value: string) => void;
  tenderlyProjectInput: string;
  setTenderlyProjectInput: (value: string) => void;
  tenderlyAccessTokenInput: string;
  setTenderlyAccessTokenInput: (value: string) => void;
  // Actions
  onClearCache: () => void;
  onExportSettings: () => void;
  onImportSettings: () => void;
  onResetDefaults: () => void;
  onClearAllSettings: () => void;
  // Stats
  cacheStats: { count: number; size: string };
  totalStorage: string;
  // Nerd mode
  nerdMode: boolean;
  storedSettings: StoredSettings;
}

/**
 * Advanced settings tab with cache, Tenderly config, and danger zone
 */
export function AdvancedTab({
  ttlInput,
  setTtlInput,
  ttlCustomInput,
  setTtlCustomInput,
  skipPreloadCache,
  setSkipPreloadCache,
  tenderlyOrgInput,
  setTenderlyOrgInput,
  tenderlyProjectInput,
  setTenderlyProjectInput,
  tenderlyAccessTokenInput,
  setTenderlyAccessTokenInput,
  onClearCache,
  onExportSettings,
  onImportSettings,
  onResetDefaults,
  onClearAllSettings,
  cacheStats,
  totalStorage,
  nerdMode,
  storedSettings,
}: AdvancedTabProps) {
  const [showDangerZone, setShowDangerZone] = useState(false);

  return (
    <div className="mt-0 space-y-6">
      {/* Cache Duration */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Cache Duration</Label>
        <div className="grid grid-cols-3 gap-2">
          {CACHE_TTL_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={ttlInput === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTtlInput(option.value);
                setTtlCustomInput(String(option.value));
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={ttlCustomInput}
            onChange={(e) => {
              setTtlCustomInput(e.target.value);
              const parsed = parseInt(e.target.value);
              if (!isNaN(parsed) && parsed > 0) {
                setTtlInput(parsed);
              }
            }}
            placeholder="3600"
            min={1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            seconds
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          How long to cache proposal lifecycle data before auto-refresh
          (current: {formatTtl(ttlInput)})
        </p>
      </div>

      <Separator />

      {/* Skip Preload Cache */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Skip Preload Cache</Label>
          <p className="text-xs text-muted-foreground">
            Bypass bundled proposal cache and fetch fresh data
          </p>
        </div>
        <Button
          type="button"
          variant={skipPreloadCache ? "default" : "outline"}
          size="sm"
          onClick={() => setSkipPreloadCache(!skipPreloadCache)}
        >
          {skipPreloadCache ? "On" : "Off"}
        </Button>
      </div>

      <Separator />

      {/* Tenderly Configuration */}
      <TenderlyConfigSection
        tenderlyOrgInput={tenderlyOrgInput}
        setTenderlyOrgInput={setTenderlyOrgInput}
        tenderlyProjectInput={tenderlyProjectInput}
        setTenderlyProjectInput={setTenderlyProjectInput}
        tenderlyAccessTokenInput={tenderlyAccessTokenInput}
        setTenderlyAccessTokenInput={setTenderlyAccessTokenInput}
      />

      <Separator />

      {/* Cache Management */}
      <CacheManagementSection
        cacheStats={cacheStats}
        totalStorage={totalStorage}
        onClearCache={onClearCache}
      />

      <Separator />

      {/* Backup & Restore */}
      <BackupRestoreSection
        onExportSettings={onExportSettings}
        onImportSettings={onImportSettings}
      />

      <Separator />

      {/* Danger Zone */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowDangerZone(!showDangerZone)}
          className="flex items-center text-sm text-destructive hover:text-destructive/80 transition-colors w-full"
        >
          {showDangerZone ? (
            <ChevronUp className="w-4 h-4 mr-2" />
          ) : (
            <ChevronDown className="w-4 h-4 mr-2" />
          )}
          <AlertTriangle className="w-4 h-4 mr-2" />
          Danger Zone
        </button>

        {showDangerZone && (
          <div className="space-y-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-destructive">
                Reset to Defaults
              </Label>
              <p className="text-xs text-muted-foreground">
                Reset form inputs to default values (does not save)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onResetDefaults}
              >
                Reset Form to Defaults
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium text-destructive">
                Factory Reset
              </Label>
              <p className="text-xs text-muted-foreground">
                Clear ALL settings and cache. This cannot be undone.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={onClearAllSettings}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Settings
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Debug Info (Nerd Mode Only) */}
      {nerdMode && (
        <>
          <Separator />
          <DebugInfoSection storedSettings={storedSettings} />
        </>
      )}
    </div>
  );
}
