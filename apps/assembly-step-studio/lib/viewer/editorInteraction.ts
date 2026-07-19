import * as THREE from 'three';

export type ViewerInteractionVariant = 'editor' | 'presentation';

export function buildInstructionPartDisplayName(name: string): string {
  return name
    .replace(/\s*\(\d{3}-\d{4}-\d{3,4}\)\s*$/, '')
    .replace(/_\d+$/, '')
    .replaceAll('_', ' ')
    .trim() || 'Unnamed part';
}

export function viewerMouseButtons(variant: ViewerInteractionVariant) {
  return {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: variant === 'presentation' ? THREE.MOUSE.DOLLY : THREE.MOUSE.PAN,
    RIGHT: variant === 'presentation' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
  };
}

export function editorDragObjectUuids(
  activePartUuid: string | null,
  selectedObjectUuids: string[],
): string[] {
  return activePartUuid && selectedObjectUuids.includes(activePartUuid)
    ? [activePartUuid]
    : [];
}

export function findEditorPart(object: THREE.Object3D): THREE.Object3D {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.robogoInstanceId === 'string') return current;
    current = current.parent;
  }

  current = object;
  while (current && current.parent) {
    if (current instanceof THREE.Group && current.name && current.type !== 'Scene') {
      return current;
    }
    current = current.parent;
  }

  return object;
}
