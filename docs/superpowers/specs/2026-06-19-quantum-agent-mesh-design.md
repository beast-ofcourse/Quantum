# Deprecated

Replaced by **[docs/swarm-design.md](../../swarm-design.md)** — the combined, minimal, production-grade multi-agent coordination plan.

This Superpowers Mesh spec was merged with `agent-coords.md` into a single unified design. Key changes:
- Sidecar IPC (per-agent `context.md` + `manifest.json`) adopted from this spec
- Git branch isolation adopted from Swarn critique
- Central swarm.json agent protocol dropped (unreliable with unmodified agents)
