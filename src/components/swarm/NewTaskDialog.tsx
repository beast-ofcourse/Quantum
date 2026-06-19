import { useState } from "react";
import { Plus } from "lucide-react";
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
import type { AgentType, TaskSpec } from "@/types/swarm";

const AGENT_TYPES: AgentType[] = ["opencode", "kilocode"];

interface NewTaskDialogProps {
  size?: "default" | "sm" | "xs";
}

export function NewTaskDialog({ size }: NewTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("opencode");
  const [model, setModel] = useState("");

  const config = useSwarmStore((s) => s.state?.config);

  const handleSubmit = () => {
    if (!description.trim()) return;
    const task: TaskSpec = {
      description: description.trim(),
      agentType,
      model: model || config?.defaultModel || "",
      dependsOn: [],
    };
    console.log("[NewTaskDialog] create task:", task);
    setOpen(false);
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size ?? "sm"}>
          <Plus className="size-3.5" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Define a task for an AI agent to execute.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Refactor the auth module"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Agent</label>
              <Select value={agentType} onValueChange={(v) => setAgentType(v as AgentType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Model</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={config?.defaultModel ?? "gpt-4o"}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!description.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
