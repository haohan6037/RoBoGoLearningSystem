# AssemblyStepStudio

3D assembly step editor for robotics education.

## Status

- [x] Phase 1: Initialize project with three-column layout
- [ ] Phase 2: 3D viewer with OrbitControls
- [ ] Phase 3: GLB upload and loading
- [ ] Phase 4: Model object tree parsing
- [ ] Phase 5: Object selection and highlighting
- [ ] Phase 6: Hide / Show objects
- [ ] Phase 7: Move objects (X/Y/Z)
- [ ] Phase 8: Save disassembly steps
- [ ] Phase 9: Step preview
- [ ] Phase 10: Reverse to build steps
- [ ] Phase 11: Export / Import steps.json
- [ ] Phase 12: Local save (localStorage)

## Getting Started

From the repository root:

```bash
npm --prefix apps/assembly-step-studio install
npm run start:assembly
```

Open [http://localhost:3000](http://localhost:3000).

## Manual Test Steps (Phase 1)

1. Run `npm run start:assembly` from the repository root
2. Open http://localhost:3000
3. Verify three-column layout: Object Tree | 3D Viewer | Steps
4. Verify TopBar shows Upload GLB, Import JSON, Export JSON buttons
