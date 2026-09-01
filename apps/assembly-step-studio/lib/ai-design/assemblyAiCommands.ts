export type LocalAssemblyCommand = {
  type: 'replace-with-rectangular-chassis' | 'replace-with-gear-driven-claw';
  title: string;
  summary: string;
  details: string[];
  warnings: string[];
  replacesCurrentAssembly: true;
};

export type LocalAssemblyRequestResult =
  | { status: 'ready'; command: LocalAssemblyCommand }
  | { status: 'unsupported'; message: string };

export function interpretLocalAssemblyRequest(input: string): LocalAssemblyRequestResult {
  const normalized = input.trim().toLocaleLowerCase();
  const asksForClaw = normalized.includes('claw')
    || normalized.includes('夹爪')
    || normalized.includes('爪子');
  const asksForGearDrive = normalized.includes('齿轮') || normalized.includes('gear');
  const asksForOpeningMotion = normalized.includes('开合')
    || normalized.includes('打开')
    || normalized.includes('闭合')
    || normalized.includes('open')
    || normalized.includes('close');
  if (asksForClaw && asksForGearDrive && asksForOpeningMotion) {
    return {
      status: 'ready',
      command: {
        type: 'replace-with-gear-driven-claw',
        title: 'Create a gear-driven Claw',
        summary: '2 × 23T crank gears + 2 corner-beam jaws + 2 shafts + 2 support beams',
        details: [
          'Two 1x4 Crank Arms with 23 Tooth Gears mesh at 2P center spacing',
          'The driving gear counter-rotates the driven gear so both jaws open and close symmetrically',
          'The two 2x1 Corner Beams form the gripping tips and sit on a separate layer from the crank gears to prevent overlap',
          'Two shafts pass through the gears\' center square holes; the red shaft marks the drive input',
          'Eight main parts; the deterministic Validator checks center spacing, square-hole shaft alignment, symmetry, and layer overlap',
        ],
        warnings: [
          'Applying this design replaces the current Assembly canvas. Save any model you want to keep first.',
          'This is a static open pose, not a dynamics simulation; the opening and closing motion will not play automatically.',
          'Motor, Bushing, Pin, and Spacer parts are not included yet. Verify clearance and strength before a physical build.',
          'Parts remain independently editable. Use Make Group manually after confirming the structure.',
        ],
        replacesCurrentAssembly: true,
      },
    };
  }
  const asksForChassis = normalized.includes('底盘') || normalized.includes('chassis');
  const asksForSupportedShape = normalized.includes('窄')
    || normalized.includes('矩形')
    || normalized.includes('narrow')
    || normalized.includes('rectangular');

  if (!asksForChassis || !asksForSupportedShape) {
    return {
      status: 'unsupported',
      message: 'This experiment currently supports “Create a narrow rectangular chassis” and “Create a gear-driven Claw.” Other structures will not be assembled speculatively.',
    };
  }

  return {
    status: 'ready',
    command: {
      type: 'replace-with-rectangular-chassis',
      title: 'Create a narrow rectangular chassis',
      summary: '2 long beams + 2 cross beams + 4 corner connectors',
      details: [
        '2 × 1x11 Beams form the side rails',
        '2 × 1x5 Beams form the front and rear crossbars',
        '4 × Large Chassis Corner Connectors join beams running in different directions',
        'Eight main parts and eight connection records; all parts remain independently editable',
      ],
      warnings: [
        'Applying this design replaces the current Assembly canvas.',
        'Small connectors such as Pins and Spacers are omitted and require manual adjustment.',
        'To move the chassis as one unit, select its parts and use Make Group.',
      ],
      replacesCurrentAssembly: true,
    },
  };
}
