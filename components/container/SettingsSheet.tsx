"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

import {
  ARBITRUM_RPC_URL,
  DEFAULT_FORM_VALUES,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import {
  CACHE_TTL_OPTIONS,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { useNerdMode } from "@/context/NerdModeContext";
import { useLocalStorage } from "@/hooks/use-local-storage";

// Get all TallyZero storage keys
const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS).filter(
  (key) => !key.endsWith("-") // Exclude prefixes
);

export function SettingsSheet() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);

  // LocalStorage settings
  const [storedL2Rpc, setStoredL2Rpc] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [storedL1Rpc, setStoredL1Rpc] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [blockRange, setBlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );
  const [l1BlockRange, setL1BlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );
  const { nerdMode, toggleNerdMode } = useNerdMode();
  const [daysToSearch, setDaysToSearch] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );
  const [cacheTtl, setCacheTtl] = useLocalStorage<number>(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000 // Convert ms to seconds
  );
  const [skipPreloadCache, setSkipPreloadCache] = useLocalStorage<boolean>(
    STORAGE_KEYS.SKIP_PRELOAD_CACHE,
    false
  );
  const [tenderlyOrg, setTenderlyOrg] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ORG,
    DEFAULT_TENDERLY_ORG
  );
  const [tenderlyProject, setTenderlyProject] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_PROJECT,
    DEFAULT_TENDERLY_PROJECT
  );
  const [tenderlyAccessToken, setTenderlyAccessToken] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ACCESS_TOKEN,
    ""
  );

  // Local form state
  const [l2RpcInput, setL2RpcInput] = useState(storedL2Rpc);
  const [l1RpcInput, setL1RpcInput] = useState(storedL1Rpc);
  const [blockRangeInput, setBlockRangeInput] = useState(String(blockRange));
  const [l1BlockRangeInput, setL1BlockRangeInput] = useState(
    String(l1BlockRange)
  );
  const [daysInput, setDaysInput] = useState(String(daysToSearch));
  const [ttlInput, setTtlInput] = useState(cacheTtl);
  const [ttlCustomInput, setTtlCustomInput] = useState(String(cacheTtl));
  const [tenderlyOrgInput, setTenderlyOrgInput] = useState(tenderlyOrg);
  const [tenderlyProjectInput, setTenderlyProjectInput] =
    useState(tenderlyProject);
  const [tenderlyAccessTokenInput, setTenderlyAccessTokenInput] =
    useState(tenderlyAccessToken);

  // Sync local state when sheet opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setL2RpcInput(storedL2Rpc);
        setL1RpcInput(storedL1Rpc);
        setBlockRangeInput(String(blockRange));
        setL1BlockRangeInput(String(l1BlockRange));
        setDaysInput(String(daysToSearch));
        setTtlInput(cacheTtl);
        setTtlCustomInput(String(cacheTtl));
        setTenderlyOrgInput(tenderlyOrg);
        setTenderlyProjectInput(tenderlyProject);
        setTenderlyAccessTokenInput(tenderlyAccessToken);
      }
      setOpen(isOpen);
    },
    [
      storedL2Rpc,
      storedL1Rpc,
      blockRange,
      l1BlockRange,
      daysToSearch,
      cacheTtl,
      tenderlyOrg,
      tenderlyProject,
      tenderlyAccessToken,
    ]
  );

  // Save settings
  const handleSave = useCallback(() => {
    setStoredL2Rpc(l2RpcInput);
    setStoredL1Rpc(l1RpcInput);
    setBlockRange(parseInt(blockRangeInput) || DEFAULT_FORM_VALUES.blockRange);
    setL1BlockRange(
      parseInt(l1BlockRangeInput) || DEFAULT_FORM_VALUES.l1BlockRange
    );
    setDaysToSearch(parseInt(daysInput) || DEFAULT_FORM_VALUES.daysToSearch);
    setCacheTtl(ttlInput);
    setTenderlyOrg(tenderlyOrgInput || DEFAULT_TENDERLY_ORG);
    setTenderlyProject(tenderlyProjectInput || DEFAULT_TENDERLY_PROJECT);
    setTenderlyAccessToken(tenderlyAccessTokenInput);
    setOpen(false);
    // Reload to apply changes
    window.location.reload();
  }, [
    l2RpcInput,
    l1RpcInput,
    blockRangeInput,
    l1BlockRangeInput,
    daysInput,
    ttlInput,
    tenderlyOrgInput,
    tenderlyProjectInput,
    tenderlyAccessTokenInput,
    setStoredL2Rpc,
    setStoredL1Rpc,
    setBlockRange,
    setL1BlockRange,
    setDaysToSearch,
    setCacheTtl,
    setTenderlyOrg,
    setTenderlyProject,
    setTenderlyAccessToken,
  ]);

  // Clear all cache
  const handleClearCache = useCallback(() => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    alert(`Cleared ${keysToRemove.length} cached items`);
  }, []);

  // Clear all settings (factory reset)
  const handleClearAllSettings = useCallback(() => {
    if (
      !confirm(
        "Are you sure? This will reset ALL settings to defaults and clear all cache."
      )
    ) {
      return;
    }
    // Clear all TallyZero keys
    ALL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    // Clear cache entries
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    alert("All settings have been reset. The page will reload.");
    window.location.reload();
  }, []);

  // Reset to defaults (form inputs only)
  const handleResetDefaults = useCallback(() => {
    setL2RpcInput("");
    setL1RpcInput("");
    setBlockRangeInput(String(DEFAULT_FORM_VALUES.blockRange));
    setL1BlockRangeInput(String(DEFAULT_FORM_VALUES.l1BlockRange));
    setDaysInput(String(DEFAULT_FORM_VALUES.daysToSearch));
    setTtlInput(3600); // 1 hour default in seconds
    setTtlCustomInput("3600");
    setTenderlyOrgInput(DEFAULT_TENDERLY_ORG);
    setTenderlyProjectInput(DEFAULT_TENDERLY_PROJECT);
    setTenderlyAccessTokenInput("");
  }, []);

  // Export settings
  const handleExportSettings = useCallback(() => {
    const settings: Record<string, unknown> = {};
    ALL_STORAGE_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          settings[key] = JSON.parse(value);
        } catch {
          settings[key] = value;
        }
      }
    });
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tally-zero-settings-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Import settings
  const handleImportSettings = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          Object.entries(settings).forEach(([key, value]) => {
            if (
              ALL_STORAGE_KEYS.includes(
                key as (typeof ALL_STORAGE_KEYS)[number]
              )
            ) {
              localStorage.setItem(key, JSON.stringify(value));
            }
          });
          alert("Settings imported successfully. The page will reload.");
          window.location.reload();
        } catch {
          alert("Failed to import settings. Invalid file format.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // Calculate cache stats
  const getCacheStats = useCallback(() => {
    let count = 0;
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.STAGES_CACHE_PREFIX)) {
        count++;
        const value = localStorage.getItem(key);
        if (value) size += value.length;
      }
    }
    return { count, size: (size / 1024).toFixed(2) };
  }, []);

  // Calculate total storage usage
  const getTotalStorageUsage = useCallback(() => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("tally-zero")) {
        const value = localStorage.getItem(key);
        if (value) total += key.length + value.length;
      }
    }
    return (total / 1024).toFixed(2);
  }, []);

  const cacheStats = getCacheStats();
  const totalStorage = getTotalStorageUsage();

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col overflow-hidden"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure TallyZero preferences and RPC endpoints
          </SheetDescription>
        </SheetHeader>

        <Tabs
          defaultValue="general"
          className="flex-1 flex flex-col mt-4 min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full grid grid-cols-3">
            <TabsTrigger value="general" className="text-xs sm:text-sm">
              General
            </TabsTrigger>
            <TabsTrigger value="rpc" className="text-xs sm:text-sm">
              RPC
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs sm:text-sm">
              Advanced
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-1">
            <TabsContent value="general" className="mt-0 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={theme === t ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTheme(t)}
                      className="capitalize"
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="days-search">Days to Search</Label>
                <Input
                  id="days-search"
                  type="number"
                  value={daysInput}
                  onChange={(e) => setDaysInput(e.target.value)}
                  placeholder={String(DEFAULT_FORM_VALUES.daysToSearch)}
                  min={1}
                  max={365}
                />
                <p className="text-xs text-muted-foreground">
                  How many days back to search for proposals (1-365)
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Nerd Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Show technical details and debug info
                  </p>
                </div>
                <Button
                  type="button"
                  variant={nerdMode ? "default" : "outline"}
                  size="sm"
                  onClick={toggleNerdMode}
                >
                  {nerdMode ? "On" : "Off"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="rpc" className="mt-0 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="l2-rpc">Arbitrum RPC URL</Label>
                <Input
                  id="l2-rpc"
                  type="url"
                  value={l2RpcInput}
                  onChange={(e) => setL2RpcInput(e.target.value)}
                  placeholder={ARBITRUM_RPC_URL}
                />
                <p className="text-xs text-muted-foreground">
                  Custom Arbitrum One RPC endpoint (optional)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="l1-rpc">Ethereum L1 RPC URL</Label>
                <Input
                  id="l1-rpc"
                  type="url"
                  value={l1RpcInput}
                  onChange={(e) => setL1RpcInput(e.target.value)}
                  placeholder={ETHEREUM_RPC_URL}
                />
                <p className="text-xs text-muted-foreground">
                  Custom Ethereum mainnet RPC endpoint (optional)
                </p>
              </div>

              <Separator />

              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 mr-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-2" />
                )}
                Block Range Settings
              </button>

              {showAdvanced && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="block-range">Arbitrum Block Range</Label>
                    <Input
                      id="block-range"
                      type="number"
                      value={blockRangeInput}
                      onChange={(e) => setBlockRangeInput(e.target.value)}
                      placeholder={String(DEFAULT_FORM_VALUES.blockRange)}
                      min={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Query chunk size for Arbitrum (default: 10,000,000)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="l1-block-range">L1 Block Range</Label>
                    <Input
                      id="l1-block-range"
                      type="number"
                      value={l1BlockRangeInput}
                      onChange={(e) => setL1BlockRangeInput(e.target.value)}
                      placeholder={String(DEFAULT_FORM_VALUES.l1BlockRange)}
                      min={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Query chunk size for Ethereum L1 (default: 1,000)
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="mt-0 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Cache Duration</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CACHE_TTL_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        ttlInput === option.value ? "default" : "outline"
                      }
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
                  (current:{" "}
                  {ttlInput >= 3600
                    ? `${Math.floor(ttlInput / 3600)}h ${Math.floor((ttlInput % 3600) / 60)}m`
                    : ttlInput >= 60
                      ? `${Math.floor(ttlInput / 60)}m ${ttlInput % 60}s`
                      : `${ttlInput}s`}
                  )
                </p>
              </div>

              <Separator />

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

              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Tenderly Simulation
                </Label>
                <p className="text-xs text-muted-foreground">
                  Configure Tenderly project for simulating retryable ticket
                  executions
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
                      onChange={(e) =>
                        setTenderlyAccessTokenInput(e.target.value)
                      }
                      placeholder="Enter your Tenderly access token"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Required for simulation. Get from dashboard.tenderly.co
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Cache Management</Label>
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cached items:</span>
                    <span className="font-mono">{cacheStats.count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cache size:</span>
                    <span className="font-mono">{cacheStats.size} KB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Total storage:
                    </span>
                    <span className="font-mono">{totalStorage} KB</span>
                  </div>
                  <Separator />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={handleClearCache}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Cache
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Backup & Restore</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportSettings}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleImportSettings}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Export settings to a file or import from a backup
                </p>
              </div>

              <Separator />

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
                        onClick={handleResetDefaults}
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
                        onClick={handleClearAllSettings}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear All Settings
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {nerdMode && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Debug Info</Label>
                    <div className="p-4 bg-muted/50 rounded-lg space-y-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">L2 RPC:</span>
                        <span className="truncate max-w-[180px]">
                          {storedL2Rpc || "(default)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">L1 RPC:</span>
                        <span className="truncate max-w-[180px]">
                          {storedL1Rpc || "(default)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Block Range:
                        </span>
                        <span>{blockRange.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          L1 Block Range:
                        </span>
                        <span>{l1BlockRange.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Days:</span>
                        <span>{daysToSearch}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Cache TTL:
                        </span>
                        <span>
                          {cacheTtl}s ({Math.floor(cacheTtl / 60)}m)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Skip Preload:
                        </span>
                        <span>{skipPreloadCache ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Tenderly Org:
                        </span>
                        <span>{tenderlyOrg || DEFAULT_TENDERLY_ORG}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Tenderly Project:
                        </span>
                        <span>
                          {tenderlyProject || DEFAULT_TENDERLY_PROJECT}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex-shrink-0 flex gap-2 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" className="flex-1" onClick={handleSave}>
            Save & Reload
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
