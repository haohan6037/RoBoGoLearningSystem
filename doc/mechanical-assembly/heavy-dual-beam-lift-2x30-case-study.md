---
document_type: engineering_case_study
document_id: robogo-heavy-dual-beam-lift-2x30-v1
title: 2x30 Heavy Dual-Beam Lift
date: 2026-08-29
project: apps/assembly-step-studio
reference_model: ai-heavy-dual-beam-lift-2x30-001
reference_snapshot_name: 2x30 Heavy Dual-Beam Lift - Step 14 Arm Back 1P - 8P Output Shaft
snapshot:
  parts: 72
  mate_records: 98
  motion_groups: 4
status: v1_learning_baseline
physical_build_verified: false
load_capacity_verified: false
units:
  pitch_mm: 12.7
tags:
  - vex-iq
  - heavy-lift
  - four-motor-drive
  - gear-train
  - dynamic-clearance
---

# 2x30 Heavy Dual-Beam Lift

## Purpose and evidence boundary

This document is a failure-aware engineering retrospective and a starting point for a second design. It does not present V1 as a finished load-bearing robot.

Read it with [Dual Lift with a Motorized Claw](dual-lift-motorized-claw-case-study.md). That case focuses on symmetric 12T:36T lifts and a claw. This case focuses on narrow 2x30 arms, four motors, a `24T -> 24T -> 48T` train, 36T torque plates, continuous shafts, and the mistakes discovered during repeated redesign.

Snapshot counts confirm data completeness only. They do not establish strength, safe motion, or physical assembly.

## Requirements

```yaml
requirements:
  arm_structure: two narrow, closed, double-wide 2x30-class arms
  cross_bracing: double-wide connectors with legs engaging both sides
  motor_count: 4
  rear_length_growth: prohibited
  target_lift_rotation: greater_than_100_degrees
  gear_requirements:
    - coplanar gears
    - correct pitch-center distance
    - validated tooth phase
  motor_mount:
    orientation: horizontal
    location: outside frame
    shaft_type: continuous ordinary shaft
    anti_rotation_required: true
  reserved_interfaces: preserve the two lowest mounting holes
```

## V1 structural baseline

### Long arms

Each side uses:

- `2x20 Beam (228-2500-030)` x1;
- `2x10 Beam (228-2500-025)` x1;
- `2x6 Beam (228-2500-021)` x1 across the 20P-to-10P seam; and
- `0x2 Connector Pin (228-2500-086)` at the seam.

The left and right beam center planes are at `Z=-15.875 mm` and `Z=+15.875 mm`. Six `Double 2x Wide, 2x2 Corner Connector (228-2500-220)` parts provide most of the transverse closure. One user-added `Double 2x Wide, 2x2 Double Offset Corner Connector (228-2500-277)` remains in the model.

The connectors are not decorative. They engage two hole rows, resist relative twist, and define an explicit load path between the two arm sides.

### Gearbox frames

Each side uses two `2x12 Beam (228-2500-026)` supports separated by `1P`. `0.5x Pitch Standoff (228-2500-064)` parts close the frame.

The lower standoff must remain in the middle hole of the final row. Moving it to the lowest pair of holes for visual symmetry consumes a reserved future interface.

### Four-motor gear train

The actual per-side relationship is a serial train:

```text
lower 24T -> middle 24T -> upper 48T
```

| Gear | Y position | Direct relationship |
|---|---:|---|
| Lower 24T | `-38.1 mm` | meshes with middle 24T |
| Middle 24T | `-12.7 mm` | meshes with lower 24T and upper 48T |
| Upper 48T | `+25.4 mm` | meshes with middle 24T |

Derived center distances:

- `24T -> 24T = 25.4 mm = 2P`;
- `24T -> 48T = 38.1 mm = 3P`;
- lower `24T -> 48T = 63.5 mm = 5P`, so those two gears do **not** mesh directly.

Two `8x Pitch Shaft (228-2500-124)` parts span the left and right gearboxes. Each shaft has a motor at both ends, for four `VEX IQ Smart Motor (228-2560)` units total. Every motor is mounted horizontally outside the frame and uses two 0.5P standoffs for anti-rotation support.

Control consequence: the lower 24T passes through an extra 24T reversal before reaching the 48T. The middle-shaft and lower-shaft motor commands therefore require opposite directions if their torque is to add at the output. Assigning one sign to all four motors would create conflict.

### Output shaft and torque transfer

The two 48T gears and two 36T torque plates share one continuous `8x Pitch Shaft (228-2500-124)` at:

```yaml
output_axis_mm: { x: -95.25, y: 25.4, z: 0 }
measured_step_length_mm: 99.822
world_z_extent_mm: [-49.911, 49.911]
outer_support_centers_z_mm: [-34.925, 34.925]
```

The 36T part is not another meshing stage. It acts as a torque plate. Two eccentric `1x1 Connector Pin (228-2500-060)` parts transfer rotation into arm holes 3 and 5 while the output shaft passes through hole 4.

### Motion groups

1. `heavy-dual-beam-frame` - arms, transverse connectors, seams, 48T gears, 36T torque plates, torque pins, and output shaft.
2. `redesign-fixed-base` - four 2x12 gearbox supports and fixed standoffs.
3. `driver-common-front` - middle 8P shaft, two 24T gears, two motors, and mounts.
4. `driver-common-rear` - lower 8P shaft, two 24T gears, two motors, and mounts.

Mates express physical connections. Groups express common motion. Neither can replace the other.

## Decisions that improved the design

### Replace visual plausibility with assembly evidence

The model converged when reviews asked whether the load path, gear centerline, shaft insertion, reserved holes, and full motion envelope were physically meaningful. These checks must become input constraints for V2, not late visual corrections.

### Change one subsystem at a time

After simultaneous gear, shaft, beam, and motor changes made the model inconsistent, the recovery sequence became:

```text
gears -> shafts -> beams -> standoffs -> motors
```

Semantic backup names such as `before-horizontal-four-motors` and `before-arm-back-1p-output-8p` recorded why a restore point mattered, which was more useful than timestamps alone.

### Use one continuous ordinary shaft

Two directional motor shafts cannot be joined in the middle to create a reliable shared axis. V1 uses three measured 8P ordinary shafts: two driver shafts and one output shaft. Eight pitch is a result of this stack and available inventory, not a universal answer.

### Put motors outside the motion envelope

External horizontal motors avoided rear overhang and cleared the arm's upward sweep. Each motor requires coaxial output insertion and independent anti-rotation support.

### Use centered STEP geometry as the final geometric evidence

Flipping the root connector looked sufficient but still produced contact with the 36T mesh. The accepted correction kept the gearbox and output axis fixed and moved the complete arm frame back by `1P`:

- root connector X position: `-120.65 -> -133.35 mm`;
- 36T X position remained `-95.25 mm`;
- sampled phase sweep: `0 to 10 degrees` in `0.5-degree` increments;
- minimum measured real-mesh clearance: approximately `11.7917 mm`.

Changing orientation and proving clearance are different operations.

## Failure catalog

| ID | Failed approach | Why it failed | Reusable correction |
|---|---|---|---|
| F-01 | Parallel long beams without enough transverse connectors | Shape existed, but torsional closure and a load path did not | Include structural closure even in concept models |
| F-02 | Changed gear ratios, motors, and supports together | Root causes became untraceable and mates/groups accumulated errors | Freeze the axis diagram, then change one subsystem |
| F-03 | Assumed two 24T gears below a 48T both meshed with it | Gear proximity was mistaken for pitch-circle contact | Calculate each pair's center distance and topology |
| F-04 | Chose motor positions from a static view | Motors blocked a greater-than-100-degree arm sweep or extended the rear envelope | Validate body envelope, sweep, shaft line, mounting, and tool access |
| F-05 | Rotated motors incorrectly or did not insert shafts | Housings overlapped or no torque path existed | Check output center, axis, insertion, body volume, and anti-rotation in order |
| F-06 | Treated washers, spacers, standoffs, and collars as interchangeable | Axial stacks overfilled and moving parts bound against supports | Assign each hardware type one explicit role |
| F-07 | Kept unnecessary 1x1 pins at beam seams | Pins did not connect both intended parts | Use 0x2 pins and verify both physical insertions |
| F-08 | Moved a lower standoff for visual symmetry | Reserved mounting holes were consumed | Treat open holes as interface requirements |
| F-09 | Moved multiple subsystems in one operation | One error invalidated many mates and groups | Make a recoverable backup and change one layer |
| F-10 | Flipped the root connector without checking the gear envelope | The connector still intersected real tooth geometry | Run real-mesh phase and motion sweeps |
| F-11 | Chose shaft length from the part name | Nominal length did not prove stack coverage or motor insertion | Measure the centered STEP and full axial stack |

## V2 build sequence

1. Duplicate V1 into a new project; never overwrite the learning baseline.
2. Create a semantic `before-v2-*` backup and record part/mate/group counts.
3. Create a 2D axis table containing coordinates, gears, supports, motors, and motion groups.
4. Fix the output axis at arm hole 4 and torque pins at holes 3 and 5.
5. Build only one `24T -> 24T -> 48T + 36T torque plate + double 2x12 support` side.
6. Validate center distances, tooth phase, and rotation direction with centered STEP geometry.
7. Complete that side's axial stack while preserving deliberate clearance.
8. Mirror the structure, then independently revalidate shaft ends, faces, connector normals, and motor orientation.
9. Calculate both driver-axis stacks and the output-axis stack before choosing shafts from inventory.
10. Install four external horizontal motors and verify two anti-rotation points per motor.
11. Build one 2x20+2x10 arm seam with a 2x6 beam and 0x2 pins.
12. Build the second arm and close the pair with double-wide 220 connectors.
13. Check the 36T phase envelope before placing the root connector; prefer a whole-pitch arm-frame move when necessary.
14. Complete mates before groups.
15. Run static mesh checks, gear-phase sweeps, full lift sweeps, and combined collision checks.
16. Only then perform low-speed, low-load physical direction tests with limits and stall protection.

## V2 validation contract

### Geometry and assembly

- [ ] 24T:24T center distance is `2P`; 24T:48T is `3P`.
- [ ] Meshing gears are coplanar and rotate without tooth penetration.
- [ ] All three continuous shafts cover supports and effective motor insertion segments.
- [ ] Every motor has at least two anti-rotation connections and no housing overlap.
- [ ] Standoffs close the 2x12 supports without consuming reserved lower holes.
- [ ] 2x6 seam beams and 0x2 pins form real two-part connections.
- [ ] Every built-in leg of each root or transverse connector enters a real hole.
- [ ] Rotating parts have only the required washer/spacer stack and retain clearance.

### Motion and control

- [ ] Motor directions account for the additional 24T-to-24T reversal.
- [ ] Left and right sides share ordinary continuous shafts, not joined motor shafts.
- [ ] The arm sweeps from its lowest position past 100 degrees without collision.
- [ ] The root connector has positive clearance from the complete 36T phase envelope.
- [ ] Low-load physical tests show no motor opposition, desynchronization, or abnormal current.

### Strength and safety

- [ ] Payload mass, center-of-mass distance, and maximum arm length are known.
- [ ] Output torque is calculated with losses and safety margin; the ideal ratio is not used as payload proof.
- [ ] Shaft twist, arm deflection, pin shear, connector release, and back-drive are evaluated.
- [ ] Mechanical or software limits, timeout, stall protection, and power-loss descent strategy exist.

## Verification status

### Verified for V1

- saved data references are complete at `72 parts / 98 mates / 4 groups`;
- 20 arm-frame components moved back by exactly 1P without moving the fixed gearbox;
- the measured 8P output shaft covers the current axial stack;
- sampled root-connector/36T phase checks found no contact;
- all 72 STEP parts loaded in the browser.

### Not verified

- continuous multi-turn phase behavior of the complete gear train;
- four-motor directions, current sharing, and stall risk on hardware;
- a complete real-mesh arm sweep beyond 100 degrees;
- loaded deflection, torsion, pin shear, or connector strength;
- back-drive, limits, wiring, brain placement, vehicle envelope, or tool access.

## Reusable conclusions

1. Fix load paths, motion chains, and axes before placing parts.
2. Upgrade every “it fits” claim into evidence for holes, insertion, center distance, direction, and sweep.
3. Preserve the distinct roles of ordinary shafts, motor shafts, washers, spacers, standoffs, collars, and pins.
4. Validate each side of a symmetric mechanism independently.
5. More motors add possible torque and additional control, twist, and stall failure modes.
6. Record failed alternatives as carefully as accepted states.
7. Use real STEP geometry and dynamic sweeps as geometric evidence; screenshots are not enough.
8. Use V1 as a better starting point, then revalidate V2 instead of copying it blindly.
