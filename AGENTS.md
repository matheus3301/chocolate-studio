# Chocolate Studio engineering

- Read the workspace and host instructions. Consult the configured Knowledge Base with its skill; do not publish private memory, user configuration dumps, orchestration transcripts or credentials.
- TypeScript strict. pnpm workspace. Core protocol code must not depend on React, UI translations or application storage.
- Product is 100% client-side and bilingual (`pt-BR`, `en`). Generic destination profiles; no hard-coded M5/TONEX product workflow.
- Develop Chocolate Plus protocol from our own CubeSuite observations. Do not copy OpenChocolate code, tables, offsets or protocol definitions. Unobserved capabilities remain unsupported.
- All hardware access belongs to the coordinating agent. Workers must not send MIDI, change hardware, use the desktop, or access deployment services unless explicitly assigned.
- Each worker owns a separate worktree. Commit only assigned changes. Do not merge, tag, release, push or deploy unless assigned; coordinator validates and integrates.
- Preserve opaque data; imported files are untrusted. Never claim verified state on send alone. Separate draft, read and verified state.
- Use meaningful codec/session tests. Fixtures require provenance and cannot be copied from the user's private baseline into published assets.
- No firmware flashing or factory reset based on a guess. Recovery must be demonstrated.
- Deploy through the existing Coolify skill with a Dockerfile. Do not add backend application services.
