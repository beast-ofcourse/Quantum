import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VariablesPanel } from "./VariablesPanel";
import { CallStackPanel } from "./CallStackPanel";
import { BreakpointsPanel } from "./BreakpointsPanel";
import { WatchPanel } from "./WatchPanel";
import {
  Code2,
  ArrowUpFromLine,
  Ban,
  Eye,
} from "lucide-react";

const TABS = [
  { id: "variables", label: "Variables", icon: Code2 },
  { id: "callstack", label: "Call Stack", icon: ArrowUpFromLine },
  { id: "breakpoints", label: "Breakpoints", icon: Ban },
  { id: "watch", label: "Watch", icon: Eye },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DebugSidebar() {
  const [activeTab, setActiveTab] = useState<TabId>("variables");

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as TabId)}
      className="flex h-full flex-col"
    >
      <TabsList variant="line" className="w-full justify-start rounded-none border-b border-border bg-transparent px-1">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="relative text-[11px] data-[state=active]:after:opacity-100"
          >
            <tab.icon className="size-3" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex-1 overflow-hidden">
        {TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="h-full data-[state=active]:flex data-[state=inactive]:hidden">
            {tab.id === "variables" && <VariablesPanel />}
            {tab.id === "callstack" && <CallStackPanel />}
            {tab.id === "breakpoints" && <BreakpointsPanel />}
            {tab.id === "watch" && <WatchPanel />}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
