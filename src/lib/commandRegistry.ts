import type { CommandDefinition, CommandCategory } from "@/types/commands";

type CommandProvider = () => CommandDefinition[];

let providers: CommandProvider[] = [];
let cache: CommandDefinition[] | null = null;

export function registerCommandProvider(provider: CommandProvider): () => void {
  providers.push(provider);
  cache = null;
  return () => {
    providers = providers.filter((p) => p !== provider);
    cache = null;
  };
}

export function getAllCommands(): CommandDefinition[] {
  if (!cache) {
    cache = providers.flatMap((p) => p());
  }
  return cache;
}

export function invalidateCache(): void {
  cache = null;
}

export function getCommandsByCategory(): Map<CommandCategory, CommandDefinition[]> {
  const grouped = new Map<CommandCategory, CommandDefinition[]>();
  for (const cmd of getAllCommands()) {
    const list = grouped.get(cmd.category);
    if (list) list.push(cmd);
    else grouped.set(cmd.category, [cmd]);
  }
  return grouped;
}
