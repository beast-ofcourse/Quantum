import { useState, type ReactNode } from "react";
import { KeyRound, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSwarmStore } from "@/stores/swarmStore";

const PROVIDERS = ["openai", "anthropic", "google", "groq"];

interface SwarmSettingsDialogProps {
  children?: ReactNode;
}

export function SwarmSettingsDialog({ children }: SwarmSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const config = useSwarmStore((s) => s.state?.config);

  const [defaultAgent, setDefaultAgent] = useState(config?.defaultAgent ?? "opencode");
  const [defaultModel, setDefaultModel] = useState(config?.defaultModel ?? "");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  const handleSaveApiKey = (provider: string) => {
    const key = apiKeys[provider];
    if (!key) return;
    console.log(`[SwarmSettingsDialog] save api key for ${provider}`);
  };

  const handleDeleteApiKey = (provider: string) => {
    console.log(`[SwarmSettingsDialog] delete api key for ${provider}`);
  };

  const handleTestConnection = (provider: string) => {
    console.log(`[SwarmSettingsDialog] test connection ${provider}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? (
          <Button variant="outline" size="sm">{children}</Button>
        ) : (
          <Button variant="ghost" size="icon-xs" aria-label="Swarm Settings">
            <KeyRound className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Swarm Settings</DialogTitle>
          <DialogDescription>
            Configure default agent, model, and provider API keys.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Defaults</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Default Agent</label>
                <Select value={defaultAgent} onValueChange={setDefaultAgent}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opencode" className="text-xs">OpenCode</SelectItem>
                    <SelectItem value="kilocode" className="text-xs">KiloCode</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Default Model</label>
                <Input
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="gpt-4o"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">API Keys</h3>
            {PROVIDERS.map((provider) => (
              <div key={provider} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs capitalize text-muted-foreground">
                  {provider}
                </span>
                <Input
                  type="password"
                  value={apiKeys[provider] ?? ""}
                  onChange={(e) =>
                    setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                  }
                  placeholder="sk-..."
                  className="h-7 flex-1 text-xs"
                />
                <Button variant="ghost" size="icon-xs" onClick={() => handleSaveApiKey(provider)}>
                  <Check className="size-3" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteApiKey(provider)}>
                  <Trash2 className="size-3" />
                </Button>
                <Button variant="outline" size="xs" onClick={() => handleTestConnection(provider)}>
                  Test
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
