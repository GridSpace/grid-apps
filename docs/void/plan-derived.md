# Void Derived Sketch Entities Plan

## Goal

Make derived sketch entities deterministic, immutable references that rebuild from upstream geometry, like solids rebuild from sketches.

## Core Model

- Derived entities are read-only projections of upstream geometry.
- Upstream geometry is the source of truth.
- Derived entities store source links and projection metadata.

## Source Links

Each derived entity should keep:

- `source_kind` (`sketch-entity`, `solid-boundary`, `solid-face-loop`, etc.)
- `source_feature_id`
- `source_object_id` (entity/boundary/loop id)
- `target_sketch_id`
- projection mode/settings (including tessellation preference version)

## Immutability Rules

- Allowed: hover, select, delete/unlink.
- Disallowed: drag/move/reshape directly.
- Solver should not treat derived entities as DOF-driving geometry.

## Rebuild Rules

- On upstream change, mark dependent sketches dirty.
- Rebuild derived entities in dependency order.
- Regeneration is deterministic from source links + target sketch plane.

## Projection Policy

- For arcs/circles from non-coplanar sources, derive as projected polyline chains using sketch tessellation prefs.
- Do not force preserving source parametric arc/circle form across projection angles.
- For coplanar sources, preserving native type can be added later as an optimization.

## Interaction Rules

- Derived geometry has distinct visual style/state.
- Attempts to edit derived geometry should be blocked with clear UI feedback.
- Deleting derived geometry removes the link and generated entities.

## Failure Handling

- No silent degenerate fallbacks.
- If source cannot be resolved, mark stale/error and surface user-visible status.
- Keep structured diagnostic logging for source resolution failures.

## Pipeline Integration

- Reuse the existing feature rebuild pipeline model used by solids.
- Derived-geometry regeneration should happen as part of sketch feature rebuild.
- Dependents downstream of updated sketches should rebuild from regenerated derived geometry.

## Implementation Phases

1. Add explicit derived-link schema and immutable behavior gates.
2. Route derived entities through rebuild pass (not interactive mutation path).
3. Remove fallback editing/solver paths for derived entities.
4. Add stale/error UI and repair actions (rebind, delete link).

## Status

- Current state: planned, not implemented end-to-end.
- Existing behavior: mixed interactive derive paths with mutable outcomes and fallback logic.
- Known pain points: unstable derive outcomes, degenerates, and inconsistent rebuild coupling.

## Next Milestone

1. Introduce derived-link schema in sketch entity storage.
2. Enforce immutability in interaction layer (block drag/edit, allow select/delete).
3. Rebuild derived entities from links during sketch rebuild.
4. Verify with regression scenario:
   - Sketch A -> Extrude A
   - Sketch B derived from A/solid boundaries
   - Edit Sketch A
   - Confirm Sketch B derived entities and downstream solids update deterministically.
