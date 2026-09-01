---
document_type: engineering_learning_log
document_id: robogo-assembly-structure-learning-2026-08-28
title: Assembly Structure Learning Log
date: 2026-08-28
period: 2026-08-27/2026-08-28
project: apps/assembly-step-studio
topics:
  - gear-driven-claw
  - dual-motor-chassis
  - geared-lift
  - mechanical-validation
physical_build_verified: false
units:
  pitch_mm: 12.7
---

# Assembly Structure Learning Log

## Executive summary

The main result of this two-day cycle was not three robot-shaped models. It was a more reliable method for deciding whether a VEX IQ assembly is mechanically meaningful.

The initial models relied heavily on coordinates and visual proximity. The revised standard uses real part dimensions, pitch spacing, holes, axial stacks, mate records, motion groups, centered STEP geometry, and collision sweeps. The question changed from “does this look like a robot?” to “what creates the load and torque paths, can the parts be assembled, and can they move without penetration?”

## Learning artifacts

### Gear-driven claw

Purpose: establish the basic relationship between gears, shafts, jaws, and rigid motion.

Lessons:

- a gear's square center hole, shaft, and support holes must share one real axis;
- meshing gears require the correct center distance, opposite rotation, and valid tooth phase;
- a gear and jaw need an explicit rigid relationship rather than coordinate proximity;
- fixed frame, rotating axes, and moving jaws need separate semantic roles; and
- a collision-free static pose does not prove a safe opening-and-closing range.

### Dual-motor chassis

Purpose: turn a BaseBot-like visual arrangement into an assembly with explicit mechanical relationships.

Lessons:

- double-wide side beams provide legal motor, axle, and expansion interfaces;
- without gearing, the motor shaft should pass through the support and drive the wheel directly;
- wheel plane, beam face, washer/spacer gap, shaft, and motor output must be coaxial;
- motor placement must preserve front and rear corner/pin connections;
- mirrored sides must match in holes and connection semantics, not only appearance;
- cross braces require real connectors and pins rather than intersecting beam solids; and
- more 2x12 beams do not automatically create a stronger chassis.

### 12T:36T geared lift

Purpose: progress from direct drive to reduction gearing and double-supported lift axes.

Mechanism:

```yaml
driver_gear_teeth: 12
follower_gear_teeth: 36
ideal_reduction: 3:1
ideal_output_speed: one_third_motor_speed
ideal_output_torque: three_times_motor_torque_before_losses
driver_axis_and_lift_axis: separate_parallel_axes
gear_to_arm_connection: two_eccentric_pins
```

The gear and arm assembly is held between two parallel 2x12 supports so the shaft has a second bearing point. The second support must connect to the base through real corners and pins at legal pitch positions.

Hardware roles:

- **Collar:** prevents a shaft from leaving through an actual escape path.
- **Washer:** provides a thin bearing gap or friction-reduction surface.
- **Spacer:** fills a measured larger axial gap without overfilling it.
- **Capped or motor shaft end:** may already eliminate an escape path and therefore remove the need for a collar.

Recorded result: the no-collar reference contained `31 parts / 43 mate records / 3 motion groups`. Its centered-STEP static check and a recorded `0-90 degree` linked `3:1` sweep found no unintended collision. This is geometry evidence, not a physical load test.

## Reusable rule set

```yaml
mechanical_rules:
  - id: frame-before-motion
    input: mechanism concept
    requirement: establish the load-bearing frame before shafts and moving parts
  - id: axial-stack-before-shaft
    input: supports, gears, wheels, washers, spacers, motor insertion
    requirement: calculate the complete axial stack before selecting shaft length
  - id: collar-by-escape-path
    input: shaft end constraints
    requirement: add a collar only when the shaft can physically escape
  - id: gap-based-hardware
    input: measured axial gap and target free play
    requirement: choose washer and spacer quantities from measurement
  - id: gear-mesh
    input: tooth counts, pitch, centers, plane, and phase
    requirement: validate center distance, coplanarity, phase, ratio, and direction
  - id: semantic-completeness
    input: assembly project
    requirement: generate physical mates and motion groups; neither may substitute for the other
  - id: full-range-collision
    input: planned joint range and transmission ratio
    requirement: test the complete linked motion range, not only the saved pose
```

## Candidate automated checks

1. Detect unintended positive-volume solid intersections.
2. Verify that every shaft enters each declared motor, gear, wheel, and support hole.
3. Verify that a collar is coaxial with its shaft and that a real retention need exists.
4. Compare total washer/spacer thickness with the measured gap and allowed free play.
5. Verify gear center distance, plane, phase, tooth ratio, and opposite rotation.
6. Verify that every part belongs to an appropriate fixed or moving group.
7. Detect fixed and moving parts incorrectly placed in the same rigid group.
8. Run collision checks across the complete planned range with linked transmission motion.
9. Detect mates whose rendered solids do not form the declared physical insertion.

## Educational progression

The three mechanisms form a useful learning sequence:

1. **Claw:** axes, gear mesh, and rigid moving groups.
2. **Chassis:** motors, wheel shafts, mirrored structure, and frame bracing.
3. **Lift:** torque, reduction, double support, and axial-clearance management.

Failed versions should be retained as invalid examples. Explaining why a plausible-looking mechanism cannot be assembled teaches more engineering judgment than presenting only a final pose.

## Gaps and next engineering steps

### Move knowledge into the repository

Conversation memory is useful for continuity, but project rules, tests, and documentation must remain the authoritative source accessible to every developer and model.

### Unify centered STEP geometry

The Studio centers imported STEP geometry using its bounding box. Offline tools that use original file coordinates can disagree about shaft ends and connector axes. Rendering, connector generation, collision checks, and stack calculation should share one geometry-loading convention.

### Complete real connector data

Frequently used beams, motors, gears, wheels, shafts, and hardware need verified hole centers, hole types, normals, and compatibility rules. Hand-inferred semantic connectors should be replaced with checked data where possible.

### Add an axial-stack calculator

Inputs:

- fixed support surfaces;
- rotating-part thicknesses;
- motor insertion requirements;
- allowed free play; and
- available washer/spacer inventory.

Output: valid low-part-count combinations that fit the measured gap without clamping the moving parts.

### Add mechanical-semantic validation

Collision detection alone cannot prove connection. The validator should answer whether a motor transfers torque to a shaft, a square shaft drives a gear, a wheel or arm is axially retained, a second support covers enough shaft length, and a pin enters both target parts.

### Progress from geometry to load analysis

Still required for a physical robot:

- available motor torque after drivetrain losses;
- payload, center-of-mass distance, and safety factor;
- shaft twist and beam deflection;
- pin shear and connector load paths;
- back-drive and drop prevention; and
- mechanical limits, software limits, timeout, and stall handling.

## Prioritized backlog

1. Encode the confirmed shaft, collar, washer/spacer, gear, and collision rules in project documentation and tests.
2. Share one centered-STEP geometry service between rendering and validation.
3. Implement an axial-stack and shaft-length calculator.
4. Complete connector data for common structural and motion parts.
5. Create automated regression projects for the claw, chassis, and lift.
6. Only then extend the learning set to four-bar, synchronized dual-lift, and more complex transmissions.

## Final learning loop

```text
real part dimensions and holes
  -> structural plan
  -> mates and motion groups
  -> static collision check
  -> transmission-linked motion sweep
  -> recorded failure reason
  -> updated reusable rule
```

The next goal is to turn this manual loop into executable project capability so later mechanisms inherit validated constraints instead of repeating visually plausible mistakes.
