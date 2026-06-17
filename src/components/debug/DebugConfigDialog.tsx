import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDebugStore } from "@/stores/debugStore";
import { useToastStore } from "@/stores/toastStore";

interface DebugConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DebuggerType = "node" | "python";

interface FormState {
  type: DebuggerType;
  name: string;
  program: string;
  args: string;
  cwd: string;
  stopOnEntry: boolean;
  port: string;
}

const DEFAULT_NODE_ADAPTER = "node";
const DEFAULT_NODE_ARGS: string[] = [
  "--inspect-brk",
  "${workspaceFolder}/node_modules/@vscode/js-debug-brk/out/src/bootloader.js",
];

const DEFAULT_PYTHON_ADAPTER = "python";
const DEFAULT_PYTHON_ARGS: string[] = [
  "-m",
  "debugpy.adapter",
];

const ADAPTER_CONFIG: Record<DebuggerType, { adapterPath: string; adapterArgs: string[] }> = {
  node: {
    adapterPath: DEFAULT_NODE_ADAPTER,
    adapterArgs: DEFAULT_NODE_ARGS,
  },
  python: {
    adapterPath: DEFAULT_PYTHON_ADAPTER,
    adapterArgs: DEFAULT_PYTHON_ARGS,
  },
};

function getDefaultName(type: DebuggerType): string {
  switch (type) {
    case "node":
      return "Node.js Launch";
    case "python":
      return "Python Launch";
  }
}

const initialState: FormState = {
  type: "node",
  name: "Node.js Launch",
  program: "",
  args: "",
  cwd: "",
  stopOnEntry: false,
  port: "9229",
};

export function DebugConfigDialog({ open, onOpenChange }: DebugConfigDialogProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [starting, setStarting] = useState(false);
  const startSession = useDebugStore((s) => s.startSession);
  const addToast = useToastStore((s) => s.addToast);

  const handleTypeChange = useCallback((type: string) => {
    const t = type as DebuggerType;
    setForm((prev) => ({
      ...initialState,
      type: t,
      name: getDefaultName(t),
      cwd: prev.cwd,
    }));
  }, []);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleStart = useCallback(async () => {
    const config = ADAPTER_CONFIG[form.type];
    setStarting(true);
    try {
      await startSession({
        type: form.type,
        name: form.name || getDefaultName(form.type),
        request: "launch",
        program: form.program || undefined,
        args: form.args
          ? form.args.split(/\s+/).filter(Boolean)
          : undefined,
        cwd: form.cwd || undefined,
        stopOnEntry: form.stopOnEntry,
        adapterPath: config.adapterPath,
        adapterArgs: config.adapterArgs,
      });
      onOpenChange(false);
    } catch (err) {
      addToast("error", `Debug launch failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStarting(false);
    }
  }, [form, startSession, onOpenChange, addToast]);

  const handleOpenChangeWrapper = useCallback(
    (open: boolean) => {
      if (!open) {
        setForm(initialState);
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeWrapper}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Debugging</DialogTitle>
          <DialogDescription>
            Configure and launch a debug session
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-3">
            <label htmlFor="debug-type" className="text-right text-xs">
              Type
            </label>
            <div className="relative col-span-3">
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger id="debug-type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="node">Node.js</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-3">
            <label htmlFor="debug-name" className="text-right text-xs">
              Name
            </label>
            <Input
              id="debug-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="My Debug Config"
              className="col-span-3 h-8 text-xs"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-4 items-center gap-3">
            <label htmlFor="debug-program" className="text-right text-xs">
              Program
            </label>
            <Input
              id="debug-program"
              value={form.program}
              onChange={(e) => updateField("program", e.target.value)}
              placeholder={
                form.type === "node" ? "app.js or dist/index.js" : "app.py or main.py"
              }
              className="col-span-3 h-8 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-3">
            <label htmlFor="debug-args" className="text-right text-xs">
              Args
            </label>
            <Input
              id="debug-args"
              value={form.args}
              onChange={(e) => updateField("args", e.target.value)}
              placeholder="--port 3000 (space-separated)"
              className="col-span-3 h-8 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-3">
            <label htmlFor="debug-cwd" className="text-right text-xs">
              CWD
            </label>
            <Input
              id="debug-cwd"
              value={form.cwd}
              onChange={(e) => updateField("cwd", e.target.value)}
              placeholder="Working directory (optional)"
              className="col-span-3 h-8 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-3">
            <div className="col-span-4 flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.stopOnEntry}
                  onChange={(e) => updateField("stopOnEntry", e.target.checked)}
                  className="size-3 rounded border-border accent-primary"
                />
                Stop on entry
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChangeWrapper(false)}
            disabled={starting}
          >
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={starting || !form.program.trim()}>
            {starting ? "Starting..." : "Start Debugging"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
