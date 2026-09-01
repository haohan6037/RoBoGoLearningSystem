---
document_type: engineering_case_study
document_id: robogo-dual-lift-motorized-claw-v1
title: Dual Lift with a Motorized Claw
date: 2026-08-28
project: apps/assembly-step-studio
reference_model: ai-dual-lift-motorized-claw-001
snapshot:
  parts: 94
  mate_records: 134
  motion_groups: 5
status: geometry_learning_baseline
physical_build_verified: false
load_capacity_verified: false
units:
  pitch_mm: 12.7
tags:
  - vex-iq
  - dual-lift
  - motorized-claw
  - shaft-stack
  - collision-validation
---

# Dual Lift with a Motorized Claw

## Purpose and evidence boundary

This case study records the transition from a single geared lift to two independent, symmetric lift modules synchronized by one continuous shaft and carrying a motorized claw.

It is a useful implementation reference, not the only valid design. Part counts describe the saved data snapshot; they do not prove strength, motion safety, or physical buildability. Statements marked **verified** are supported by project data or the geometry checks recorded during the build. Statements marked **not verified** require further simulation or physical testing.

## Design objectives

1. Place one complete reduction-lift mechanism on each side of the base.
2. Keep the two lift arms mechanically synchronized and provide two separated claw mounting points.
3. Drive each lift with a 12-tooth to 36-tooth gear pair for an ideal `3:1` reduction.
4. Add an independently powered opening-and-closing claw.
5. Keep the claw approximately level and clear of the floor at the lift's lowest working position.
6. Use real holes, connector legs, pins, and shaft insertion. Do not use solid-body overlap as a substitute for a connection.

## Non-negotiable mechanical rules

```yaml
rules:
  - id: pitch-grid
    statement: Use 12.7 mm as one pitch for hole spacing and layout calculations.
  - id: shaft-insertion
    statement: A shaft must physically enter every intended motor, gear, and support hole.
  - id: shaft-stack-first
    statement: Calculate the complete axial stack before choosing shaft length.
  - id: hardware-roles
    statement: Washers and spacers set measured clearance; a collar only prevents a real escape path.
  - id: connection-semantics
    statement: Geometry contact, mate records, and motion groups are separate requirements.
  - id: dynamic-clearance
    statement: Static non-intersection does not prove clearance through the working motion range.
```

## Mechanism definition

A second beam on the same driven gear is not a second lift module. In this design:

- the left side contains a motor, 12T driver, 36T follower, supported lift shaft, and lift arm;
- the right side contains an independently mirrored copy of that mechanism;
- the front ends of the two arms support opposite sides of the claw; and
- a continuous ordinary shaft spans both driver modules and constrains their 12T gears to the same phase.

The important distinction is between increasing the number of parts and creating two spatially independent load paths.

## Shared-shaft synchronization

### Selected component

`14x Pitch Shaft (228-2500-264)`

Two directional motor shafts cannot be joined end-to-end merely because their rendered endpoints touch. They do not form a supported continuous mechanical connection. The selected ordinary shaft:

- passes through both support structures and both 12T gears;
- enters the output position of the left and right motors; and
- constrains both driver gears to rotate together.

### Length calculation

```text
required length =
  left motor insertion
  + left support and gear stack
  + center span
  + right support and gear stack
  + right motor insertion
```

Check insertion at both motors, gear coverage, every support crossing, end-feature interference, and remaining axial play. Fourteen pitch is valid for this snapshot, not a universal dual-lift answer.

### Control limitation

Mechanical coupling does not prove balanced motor current or safe stall behavior. A physical build still requires matched commands, low-load direction testing, travel limits, timeouts, and stall protection.

## Lift modules

Each side follows the same chain:

```text
motor/common driver shaft -> 12T driver -> 36T follower -> pinned lift arm
```

- The driver shaft and lift shaft are parallel, separate axes.
- Gear contact is not sufficient; center distance, coplanarity, tooth phase, and opposite rotation must be checked.
- The 36T square hole transfers shaft torque, while eccentric pins define the rigid gear-to-arm relationship.
- Mirrored modules require independent checks of shaft-end direction, gear plane, pin insertion, and part handedness.

## Supported axial stack

The critical rotating axes are supported between two beams. Record the stack from a fixed reference surface:

```text
support beam -> washer/spacer -> gear or arm -> washer/spacer -> second support beam
```

Observed failure modes:

- a shaft was too short to enter the second support;
- a collar was placed where it neither retained the shaft nor preserved clearance;
- a thick spacer was used where a washer was required;
- all free play was removed, clamping a rotating part against a fixed beam.

Correction rules:

- omit a collar when motors, caps, or surrounding structure already eliminate every escape path;
- keep a retaining collar clear of the fixed support surface; and
- fill slightly less than the measured gap so rotating parts retain deliberate freedom.

## Claw interface and lowest-position geometry

When the arm spacing and claw interface do not match, adjust in this order:

1. gear, washer/spacer, and lift-arm axial placement;
2. claw connection layer and connector orientation;
3. base width only when the first two options cannot work.

A 30-degree angle beam forms the wrist transition so the claw is approximately horizontal at the lowest target lift angle. Its label alone does not determine its orientation. Verify the wrist in the full mechanism pose, including real hole alignment, connector body clearance, and left/right handedness.

## Claw motor and drive shaft

An early motor position below the claw reduced ground access. The motor was moved above and behind the claw interface. Motor placement must account for:

- ground clearance;
- dynamic clearance from the lift arms and wrist connectors;
- output-shaft insertion direction;
- independent anti-rotation mounting; and
- cable and robot-brain space.

The final reference uses `3x Pitch Motor Shaft (228-2500-2236)`. Its motor-specific end enters the claw motor, the shaft passes through its support, and the square section enters the left 36T claw gear. The motor housing is pinned separately; an output shaft is not a motor mount.

## Connector orientation lesson

The wrist was strengthened with `Double 2x Wide, 1x2 Corner Connector (228-2500-271)`. The claw tip uses `2x Wide, 1x2 Corner Connector (228-2500-128)`.

A coordinate mirror did not produce a mechanically valid mirror:

- the first attempt made the bodies touch but did not insert both built-in legs into holes;
- copying the left local pose corrected hole positions but left the right connector plane facing the wrong way;
- the accepted right-side arrangement swaps the built-in-leg hole order and rotates the connector 180 degrees around the shared insertion axis.

The reusable rule is to verify connector centers, axes, insertion depth, body clearance, and load direction after every mirror operation.

## Mate and motion model

The snapshot uses five logical groups:

1. `Fixed · Lift Base and Two Lift Motors`
2. `Lift Driver · Common 14x Shaft and Two 12T`
3. `Lifted Carrier · ... Angle Beams ... Claw`
4. `Claw Driven · ... Right 36T and Jaw`
5. `Claw Driver · 3x Motor Shaft, Left 36T and Jaw`

Mate records describe physical relationships. Motion groups describe parts that move together. A group must never hide a missing mate.

## Reproducible build sequence

1. Read the live project and create a recoverable backup.
2. Resolve actual part IDs, centered STEP dimensions, pitch footprint, holes, and connector normals.
3. Build and validate one double-supported 12T:36T lift module.
4. Build the opposite module and independently verify its mirrored interfaces.
5. Calculate the entire cross-assembly axial stack before selecting the common shaft.
6. Install the common driver shaft, both 12T gears, and both motors; verify insertion at both ends.
7. Install the two 36T gears, lift shafts, arms, and explicit gear-to-arm connections.
8. Size washers and spacers from measured gaps; use a collar only for a real escape path.
9. Set the arm spacing for legal left and right claw attachment points.
10. Design the wrist at the lowest target lift position.
11. Mount connectors from a direction that preserves solid-body clearance.
12. Place the claw motor without consuming ground clearance and install the correct motor shaft.
13. Complete claw mates and motion groups.
14. Validate one claw tip, then derive and revalidate the opposite side instead of blindly mirroring it.
15. Run static STEP collision checks followed by combined lift-and-claw motion sweeps.

## Validation contract

### Static geometry

- [ ] Every shaft is coaxial with and sufficiently inserted into each target hole.
- [ ] Both 12T:36T pairs have the intended center distance, plane, and phase.
- [ ] Washers and spacers preserve rotating clearance.
- [ ] Connector legs and pins enter real holes without unintended solid overlap.
- [ ] The two claw-end connector planes match the design intent.
- [ ] The claw motor preserves lowest-position ground clearance.

### Connection semantics

- [ ] Every motor housing has an anti-rotation attachment.
- [ ] Every motor shaft has its motor-specific end inserted correctly.
- [ ] Gear-to-arm and beam-to-connector relationships have explicit mates.
- [ ] Fixed, lift-driver, lifted-carrier, and claw-motion groups are separated correctly.

### Dynamic behavior

- [ ] Both lift arms remain synchronized across the target range.
- [ ] Each 12T:36T pair counter-rotates at an ideal `3:1` ratio.
- [ ] The claw gears and jaws counter-rotate.
- [ ] The claw remains usable at the lowest position.
- [ ] Intermediate and maximum positions clear motors, shafts, supports, and connectors.
- [ ] Combined lift and claw motion has no collision.

## Verified and unverified claims

### Supported by the saved learning baseline

- two independent side lift modules;
- one continuous shaft synchronizing both driver gears;
- double-supported shafts and explicit axial-stack reasoning;
- a wrist transition and elevated claw motor;
- explicit connector-leg ordering and mate/group separation.

### Not yet verified

- safe lifting mass or structural safety factor;
- long-term two-motor load sharing;
- back-drive or drop prevention;
- beam, shaft, pin, or connector fatigue;
- every combined lift-angle and claw-angle STEP sweep;
- physical wiring, limit detection, controls, or tool accessibility.

## Reusable conclusions

1. Define load paths, motion chains, and axes before selecting parts.
2. Select shaft length from the complete stack, never from appearance.
3. Give collars, washers, and spacers distinct mechanical responsibilities.
4. Validate mirrored mechanisms as independent assemblies.
5. Design around the lowest working pose, not only the presentation pose.
6. Validate after each layer so inaccessible lower-level errors do not accumulate.
7. Preserve failed versions and failure reasons as regression fixtures.
8. Treat this model as a tested learning reference, not a universal or physically certified solution.
