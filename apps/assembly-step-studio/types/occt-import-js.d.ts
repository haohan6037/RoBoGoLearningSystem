declare module 'occt-import-js' {
  type OcctMesh = {
    name: string;
    color?: [number, number, number];
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index: { array: number[] };
  };

  type OcctResult = {
    success: boolean;
    meshes: OcctMesh[];
  };

  type OcctInstance = {
    ReadStepFile(content: Uint8Array, options: object | null): OcctResult;
  };

  export default function createOcct(options: {
    locateFile(fileName: string): string;
  }): Promise<OcctInstance>;
}
