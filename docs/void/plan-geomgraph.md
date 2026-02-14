# Void Geometry Graph Plan (Surfaces + Boundaries)

## Progress Checkpoint (2026-02-13)

1. Completed:
2. `GeometryStore` is persisted in document state and populated from solids runtime snapshots.
3. Selection pipeline was split to `interact/selection_resolver.js` and now emits typed candidates (`profile/solid-face/solid-edge`) with canonical entity descriptors.
4. Extrude targets carry `region_id`; chamfer edge refs carry `boundary_segment_id` + entity metadata.
5. New canonical mapping bridge is active in solids selection:
6. face key -> canonical `surface` id
7. edge key -> canonical `boundary-segment` id
8. loop edge key -> canonical `boundary` id
9. Resolver now consumes these mappings (`resolveCanonicalFaceEntity`, `resolveCanonicalEdgeEntity`) as primary IDs.

## Resume Pointers

1. Canonical mapping source:
2. `src/void/api/solids.js`:
3. `buildGeometryStoreSnapshot()` map population
4. `resolveCanonicalFaceEntity()`
5. `resolveCanonicalEdgeEntity()`
6. Canonical mapping consumer:
7. `src/void/interact/selection_resolver.js`
8. `resolvePrimarySurfaceHit()` entity assignment for face/edge candidates.
9. Canonical hard cutover completed:
10. Extrude profile refs resolve via `region_id` only.
11. Chamfer refs resolve via canonical `segment:*` / `boundary:*` ids only.
12. `input.solids` compatibility branches removed from solid-op edit paths.
13. Boundary-hover correction applied:
14. Face-edge resolution now prioritizes hovered-face boundary lookup before global solid edge intersections.
15. Boundary extraction uses the same crease threshold as rendered edges (`SOLID_CREASE_ANGLE_DEG`) to reduce partial/extra loop mismatches.
16. `getFaceEdgeHit()` now prefers closed-loop boundaries over open seam chains when both are near cursor.
17. Follow-up TODO:
18. During sketch editing, `Use (u)` should derive from other visible sketch entities (not only solids).

## Target Architecture

1. Adopt a single geometric graph centered on `surfaces` and `boundaries`, with solids as derived artifacts only.
2. Treat every selectable thing as one of:
3. `SurfaceRegion` (planar/non-planar bounded patch).
4. `Boundary` (closed loop on a surface).
5. `BoundarySegment` (line/arc/spline edge piece inside a boundary).
6. `BoundaryPoint` (segment endpoint, midpoint, center, intersection, projected point).

## Core Data Model

1. Add `GeometryStore` (document-persisted, versioned):
2. `surface_id`, `type` (`planar|curved`), `frame` (for planar), `source` provenance.
3. `boundary_id`, `surface_id`, ordered `segment_ids`, orientation, closure, area sign, nesting depth.
4. `segment_id`, `kind` (`line|arc|circle|polyline|nurbs`), param data, `owner_boundary_id`.
5. `point_id`, world/local coords, role (`endpoint|midpoint|center|derived|intersection`), references.
6. `region_id`, `surface_id`, boundary rings (`outer + holes`), selectable extrusion/chamfer profile token.
7. Add stable identity layer:
8. Every entity gets deterministic `geom_sig` + persistent `id`.
9. Derived entities keep `origin_ref` and dependency chain for rebind/rebuild.
10. Add `TopologyIndex` (runtime cache):
11. Maps solid mesh triangles/edges to source `surface_id` and `boundary_segment_id`.
12. Supports nearest-hit resolution with tolerance and tie-break rules.

## Selection and Hover System

1. Replace mode-specific picking with one `SelectionResolver` pipeline.
2. Input: ray hits + current mode + intent mask.
3. Output: ranked candidates of `point/segment/boundary/surface/region`.
4. Ranking rules:
5. Point proximity always wins near threshold.
6. Segment wins next when distance-to-curve below threshold.
7. Boundary/region wins when inside region and not near point/segment.
8. Surface wins otherwise.
9. Add per-mode intent masks:
10. Sketch mode: `point,segment,boundary,surface(region projection)`.
11. Extrude mode: `region` only.
12. Chamfer mode: `segment` only (plus face-to-edge expansion helper).
13. Boolean mode: `surface/body` selection groups.
14. Add consistent multi-select semantics:
15. Plain click toggles in active picker.
16. `space/esc` clear picker-local selection.
17. No cross-picker stealing while dialog active.

## Geometry Build Pipeline

1. Introduce staged rebuild in worker:
2. Stage A: Feature evaluation -> sketch geometry on target surfaces.
3. Stage B: Boundary graph build per surface (loop extraction, splitting, nesting).
4. Stage C: Region synthesis (`outer/holes`) with fill-rule consistency.
5. Stage D: Solid operations (extrude/boolean/chamfer) from region/surface references.
6. Stage E: Topology annotation back into `GeometryStore` for interaction.
7. Cache keys:
8. `feature_sig`, `surface_sig`, `boundary_sig`, `region_sig`.
9. Recompute only invalidated downstream stages.

## Sketch Integration

1. Sketches bind to `surface_id` + local frame, not transient face index.
2. `Use (u)` creates `derived segment/point` referencing source `segment_id/point_id`.
3. Derived geometry stores transform relation to host surface frame.
4. Midpoints become first-class `point_id` with constraint targetability.
5. Closed-area detection uses `boundary/region` graph directly (no separate ad-hoc fill path).

## Extrude Integration

1. Extrude input stores selected `region_id`s, not ad-hoc loops.
2. Region hover/selection always from boundary graph.
3. Live preview reads from current region snapshots.
4. Targets/tools in add/subtract reference resulting body ids, but source remains region-driven.

## Chamfer Integration

1. Chamfer input stores `boundary_segment_id`s (or section ids for partial edges).
2. Face click expands to boundary segments by adjacency policy.
3. No selection against regenerated transient mesh during edit.
4. Preview and final solve read same boundary refs to avoid drift.

## Projection / Derive Reliability

1. Stop pre-projecting everything.
2. Resolve hovered source entity first.
3. Project only selected/hovered entity into current sketch frame.
4. Keep source and projected visuals separate but linked by shared entity id.

## Planar/Non-Planar Classification

1. Surface classification at creation:
2. Planar stores orthonormal frame and scalar offset.
3. Curved stores param evaluator and principal directions where available.
4. Boundary segments on curved surfaces can still be selected/extruded/chamfered as references.
5. Sketch-on-face initially allowed only on planar surfaces; curved support can be staged later.

## Document Persistence

1. Persist `GeometryStore` plus feature list and timeline.
2. Persist only canonical geometry entities, not transient mesh selections.
3. Add schema version bump and hard reset path (allowed in this project stage).
4. Undo/redo stores deltas against `GeometryStore` entities for atomic operations.

## Migration Strategy

1. Phase 0: Add new store in parallel, keep existing runtime behavior.
2. Phase 1: Route hover/selection to `SelectionResolver` while existing builders stay.
3. Phase 2: Route sketch profiles/areas to `boundary/region`.
4. Phase 3: Route extrude inputs to `region_id`.
5. Phase 4: Route chamfer inputs to `segment_id`.
6. Phase 5: Remove legacy face/edge ad-hoc paths.
7. Forward-only: remove rollout toggles and legacy branching once parity is reached.

## Performance and Worker Plan

1. Keep all heavy geometry graph and topology steps in worker.
2. Main thread receives compact immutable snapshots and draw buffers.
3. Use incremental invalidation by dependency DAG from edited feature forward.
4. Add rebuild budget logging per stage to catch regressions early.

## Testing Plan

1. Unit tests:
2. Boundary extraction and nesting.
3. Region fill-rule behavior (self-intersecting + nested bulls-eye cases).
4. Selection ranking with tolerance.
5. Projection correctness for points/segments/surfaces.
6. Integration tests:
7. Sketch-on-face propagation after upstream edits.
8. Extrude profile row hover maps to produced solids.
9. Chamfer edit stability with multi-select.
10. Undo/redo atomicity in dialogs.
11. Fuzz tests:
12. Random sketch mutations + constraints + rebuild consistency checks.
13. Determinism check: same doc state yields same entity ids/topology signatures.

## Deliverables Sequence

1. `GeometryStore` + ids + schema.
2. `SelectionResolver` + mode masks.
3. `BoundaryGraphBuilder` + `RegionBuilder`.
4. Extrude refactor to `region_id`.
5. Chamfer refactor to `segment_id`.
6. Projection/use refactor to source-first selection.
7. Legacy path removal and cleanup docs.

## Acceptance Criteria

1. Hover/select behavior is identical and predictable across sketch/solid/chamfer modes.
2. Derived sketches follow upstream changes without requiring manual edit-open.
3. Extrude/chamfer operate on stable references, not transient mesh hits.
4. Nested/self-intersecting regions behave correctly for selection and extrusion.
5. No mode where selection silently switches entity class unexpectedly.
