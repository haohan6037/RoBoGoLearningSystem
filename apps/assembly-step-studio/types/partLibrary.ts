export type PartLibraryItem = {
  id: string;
  name: string;
  partNumber: string;
  category: string;
  sourceFile: string;
  thumbnailUrl: string | null;
};

export type PartLibraryCatalog = {
  version: number;
  generatedAt: string;
  sourceDirectory: string;
  total: number;
  categories: string[];
  parts: PartLibraryItem[];
};
