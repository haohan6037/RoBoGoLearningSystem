export interface NamedPart {
  name: string;
  partNumber: string;
}

const partNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function normalizePartSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/(?<=\d)\s*[x×*]\s*(?=\d)/gi, '*');
}

export function comparePartsByName(a: NamedPart, b: NamedPart): number {
  return partNameCollator.compare(a.name, b.name)
    || partNameCollator.compare(a.partNumber, b.partNumber);
}
