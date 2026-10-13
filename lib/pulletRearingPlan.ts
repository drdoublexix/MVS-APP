import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { MVS_LOGO_DATA_URI } from './mvsLogoData';

type PulletRearingPlanOptions = {
  birds: number;
  clientName?: string;
};

type PlanItem = {
  item: string;
  quantity: (birds: number) => string;
};

const WEBSITE = 'www.mvsc.com.ng';
const BIRDS_PER_ESTIMATE = 100;
const numberFormat = new Intl.NumberFormat('en-NG');
const scale = (amount: number, birds: number) => Math.ceil((amount * birds) / BIRDS_PER_ESTIMATE);
const blank = '________________';
const noBorders = {
  top: { style: BorderStyle.NIL },
  bottom: { style: BorderStyle.NIL },
  left: { style: BorderStyle.NIL },
  right: { style: BorderStyle.NIL },
  insideHorizontal: { style: BorderStyle.NIL },
  insideVertical: { style: BorderStyle.NIL },
} as const;
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '777777' },
} as const;

const capitalItems: PlanItem[] = [
  { item: 'Pen/house construction (deep litter)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} unit(s)` },
  { item: 'Brooder heat source (infrared bulb / charcoal pot)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)` },
  { item: 'Chick feeder trays', quantity: (birds) => numberFormat.format(scale(5, birds)) },
  { item: 'Chick drinkers (0.75 L)', quantity: (birds) => numberFormat.format(scale(5, birds)) },
  { item: 'Hanging feeders (grower/adult stage)', quantity: (birds) => numberFormat.format(scale(4, birds)) },
  { item: 'Hanging drinkers (grower/adult stage)', quantity: (birds) => numberFormat.format(scale(4, birds)) },
  { item: 'Lighting (bulbs and wiring)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)` },
  { item: 'Litter material (wood shavings, first batch)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} batch(es)` },
  { item: 'Miscellaneous (weighing scale, rake, record book, wheelbarrow)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)` },
];

const recurringItems: PlanItem[] = [
  { item: 'Day-old layer chicks', quantity: (birds) => `${numberFormat.format(birds)} chicks` },
  { item: 'Feed — chick and grower mash', quantity: (birds) => `${numberFormat.format(scale(10, birds) + scale(33, birds))} bags (25 kg)` },
  { item: 'Vaccines and medication', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)` },
  { item: 'Litter top-up/replacement', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)` },
  { item: 'Labour (if hired, approximately 4.5 months)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)` },
  { item: 'Utilities (water and brooding fuel)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)` },
];

const heading = (text: string, size = 24) => new Paragraph({
  children: [new TextRun({ text, bold: true, color: '315F3B', size })],
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '315F3B', space: 4 } },
  keepNext: true,
  spacing: { before: 260, after: 100 },
});

const planTable = (headers: string[], rows: string[][]) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  layout: 'autofit',
  borders: cellBorders,
  rows: [headers, ...rows].map((cells, rowIndex) => new TableRow({
    tableHeader: rowIndex === 0,
    cantSplit: true,
    children: cells.map((cell) => new TableCell({
      borders: cellBorders,
      ...(rowIndex === 0
        ? { shading: { fill: '91410C' } }
        : rowIndex % 2 === 0 ? { shading: { fill: 'EAF0EA' } } : {}),
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      children: [new Paragraph({
        children: [new TextRun({
          text: cell,
          bold: rowIndex === 0,
          color: rowIndex === 0 ? 'FFFFFF' : '202020',
          size: 18,
        })],
      })],
    })),
  })),
});

const budgetRows = (items: PlanItem[], birds: number) => items.map((item) => [
  item.item,
  item.quantity(birds),
  blank,
  blank,
]);

export function createPulletRearingPlanDocx({ birds, clientName }: PulletRearingPlanOptions) {
  const flockSize = numberFormat.format(birds);
  const children: (Paragraph | Table)[] = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [1900, 8192],
      borders: noBorders,
      rows: [new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 1900, type: WidthType.DXA },
            borders: noBorders,
            verticalAlign: 'center',
            margins: { top: 0, bottom: 0, left: 0, right: 180 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({
                data: MVS_LOGO_DATA_URI,
                transformation: { width: 92, height: 94 },
                type: 'jpg',
                altText: { name: 'MVS logo', description: 'Mobile Veterinary Services logo', title: 'MVS logo' },
              })],
            })],
          }),
          new TableCell({
            width: { size: 8192, type: WidthType.DXA },
            borders: noBorders,
            verticalAlign: 'center',
            margins: { top: 0, bottom: 0, left: 100, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'MOBILE VETERINARY SERVICES', bold: true, color: '315F3B', size: 30 })],
                spacing: { after: 60 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Veterinary Care on Demand, Right Next to You', bold: true, color: '91410C', size: 20 })],
                spacing: { after: 40 },
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: WEBSITE, color: '555555', size: 18 })],
              }),
            ],
          }),
        ],
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'MVS PULLET REARING PLAN', bold: true, color: '202020', size: 32 })],
      spacing: { before: 240, after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Day-Old Chick to Point of Lay — ${flockSize} Bird Flock`, bold: true, size: 20 })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `${clientName ? `Prepared for ${clientName} | ` : ''}Currency: Nigerian Naira (₦)`,
        italics: true,
        color: '555555',
        size: 18,
      })],
      spacing: { after: 180 },
    }),
    heading('1. Overview'),
    new Paragraph({
      text: `This plan outlines the housing, equipment, feeding, health, and financial requirements to raise ${flockSize} day-old layer pullets to point of lay (POL) — the stage at which the birds begin egg production, typically around 18 to 20 weeks of age. It is structured in three management phases and closes with a flock-scaled cost breakdown.`,
      spacing: { after: 120 },
    }),
    heading('2. Production Timeline & Management Phases'),
    planTable(['Phase', 'Age (Weeks)', 'Key Focus'], [
      ['Brooding', 'Day-old – Week 8', 'Heat, biosecurity, chick mash, close monitoring'],
      ['Growing', 'Week 9 – Week 17', 'Frame and skeletal development on grower mash; transition off supplemental heat'],
      ['Pre-Lay / Point of Lay', 'Week 18 – Week 20', 'Transition to layer feed; nest box introduction; onset of lay'],
    ]),
    heading('3. Housing & Equipment (Capital Requirements)'),
    new Paragraph({
      children: [new TextRun({
        text: `One-time setup quantities for a deep-litter housing system sized for this ${flockSize}-bird flock. Existing structures may reduce requirements.`,
        italics: true,
        color: '555555',
      })],
      spacing: { after: 100 },
    }),
    planTable(['Item', 'Qty', 'Est. Unit Cost (₦)', 'Est. Total (₦)'], budgetRows(capitalItems, birds)),
    new Paragraph({
      children: [new TextRun({ text: `Capital Subtotal: ${blank}`, bold: true, color: '315F3B' })],
      spacing: { before: 60 },
    }),
    heading('4. Feeding Program'),
    planTable(['Phase', 'Feed Type', 'Cumulative Intake/Bird', `Total for ${flockSize} Birds`, 'Est. Bags (25 kg)', 'Est. Cost (₦)'], [
      ['Week 0–8', 'Chick mash', '~2.5 kg', `~${numberFormat.format(scale(10, birds) * 25)} kg`, `~${numberFormat.format(scale(10, birds))} bags`, blank],
      ['Week 9–20', 'Grower mash', '~8.25 kg', `~${numberFormat.format(scale(33, birds) * 25)} kg`, `~${numberFormat.format(scale(33, birds))} bags`, blank],
    ]),
    new Paragraph({
      children: [new TextRun({ text: `Feed Subtotal: ${blank}`, bold: true, color: '315F3B' })],
      spacing: { before: 60 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'NOTE: In Nigeria, point of lay sometimes spans 16–20 weeks, so it is prudent to plan feed through week 20. Feed typically accounts for 55–65% of total production cost. Confirm current bag prices with your supplier before finalizing the budget.',
        italics: true,
        color: 'B42318',
      })],
      spacing: { before: 80, after: 100 },
    }),
    heading('5. Health & Vaccination Schedule'),
    planTable(['Age', 'Vaccine / Treatment', 'Route'], [
      ['Day 1', 'Marek’s Disease (usually given at hatchery)', 'Subcutaneous'],
      ['Day 7–10', '1st dose Newcastle Disease (Lasota) + Infectious Bronchitis', 'Eye drop / drinking water'],
      ['Day 14–18', '1st dose Gumboro (IBD), 1st dose', 'Drinking water'],
      ['Day 21', '2nd dose Newcastle Disease booster (Lasota)', 'Drinking water'],
      ['Day 28', '2nd dose Gumboro (IBD), 2nd dose', 'Drinking water'],
      ['Week 6–8', 'Fowl Pox', 'Wing web stab'],
      ['Week 9–14', 'Newcastle Disease (Komarov/Killed)', 'Intramuscular'],
      ['Throughout', 'Vitamins, electrolytes and dewormers as needed', 'Drinking water'],
    ]),
    new Paragraph({
      children: [new TextRun({
        text: 'This is a general guide — confirm the exact schedule and dosages with your state or attending veterinarian, as vaccination schedules vary by region, disease pressure and hatchery recommendations.',
        italics: true,
        color: '555555',
      })],
      spacing: { before: 120, after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Vaccination & Medication Cost (${flockSize} birds, 18 weeks): ${blank}`, bold: true, color: '315F3B' })],
      spacing: { after: 80 },
    }),
    heading('6. Financial Summary'),
    heading('6.1 Capital (One-Time) Costs', 22),
    planTable(['Item', 'Amount (₦)'], [
      ['Housing and equipment (Section 3)', blank],
    ]),
    heading('6.2 Recurring Costs (Day-Old to Point of Lay)', 22),
    planTable(['Item', 'Qty', 'Amount (₦)'], recurringItems.map((item) => [item.item, item.quantity(birds), blank])),
    heading('6.3 Total Investment', 22),
    planTable(['Item', 'Amount (₦)'], [
      ['Capital costs', blank],
      ['Recurring costs', blank],
      ['Subtotal', blank],
      ['Contingency (10%)', blank],
    ]),
    new Paragraph({
      children: [new TextRun({ text: `TOTAL INVESTMENT: ${blank}`, bold: true, color: '315F3B', size: 22 })],
      spacing: { before: 100, after: 40 },
    }),
    heading('7. Notes & Assumptions'),
    new Paragraph({ text: '• All price fields have intentionally been left blank. Obtain current quotations from local Nigerian suppliers before finalizing your budget.' }),
    new Paragraph({ text: '• Housing quantities assume a deep-litter system; using an existing structure may reduce requirements.' }),
    new Paragraph({ text: '• Labour is optional and can be removed if you as the client will manage the flock personally.' }),
    new Paragraph({ text: '• Mortality is not separately budgeted; maintain good brooding and biosecurity practices and allow for contingency in the budget.' }),
    new Paragraph({ text: '• This plan ends at point of lay. Prepare a separate budget for the laying phase, including layer mash, egg trays, crates and ongoing veterinary care.' }),
    new Paragraph({ text: `• Quantities are calculated for this ${flockSize}-bird flock and rounded up where whole equipment units or feed bags are required.` }),
    new Paragraph({
      children: [new TextRun({ text: 'Successful poultry farming starts with planning, not guessing.', bold: true })],
      spacing: { before: 220, after: 100 },
    }),
    new Paragraph({ text: `Thank you for choosing Mobile Veterinary Services. Visit ${WEBSITE} to learn more about our services.` }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `MOBILE VETERINARY SERVICES ©${new Date().getFullYear()} | ${WEBSITE}`, bold: true, color: '315F3B' })],
      spacing: { before: 260 },
    }),
  ];

  return new Document({
    title: 'MVS Pullet Rearing Plan',
    subject: `Layer flock plan for ${flockSize} birds`,
    creator: 'Mobile Veterinary Services',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20, color: '202020' },
          paragraph: { spacing: { after: 80 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1020, right: 907, bottom: 1020, left: 907 },
        },
      },
      children,
    }],
  });
}
