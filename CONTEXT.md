# RoBoGo Learning System

RoBoGo Learning System helps educators create robot models and turn completed models into student-facing building guidance.

## Language

**Assembly Project**:
A saved editable robot model made from library parts, including each part's placement and connection relationships.
_Avoid_: Assembly tool, model project

**Build Instructions Project**:
A project that starts from a completed model and contains its disassembly sequence plus the generated student build sequence.
_Avoid_: Disassembly project, steps project, assembly project

**Start Build Instructions**:
The transition that creates a new independent Build Instructions Project from the current Assembly Project. The source Assembly Project remains unchanged.
_Avoid_: Convert project, open disassembly

## Example dialogue

> Educator: I finished the robot in my Assembly Project.
>
> Developer: Use Start Build Instructions. It creates a separate Build Instructions Project, where you can define the disassembly sequence and generate the student build sequence.
