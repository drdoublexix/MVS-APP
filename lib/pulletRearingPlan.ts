import { MVS_LOGO_DATA_URI } from './mvsLogoData';

type PulletRearingPlanOptions = {
  birds: number;
  clientName?: string;
  includeEstimatedPrices: boolean;
};

type BudgetItem = {
  item: string;
  quantity: (birds: number) => string;
  unitCost: number;
  total: (birds: number) => number;
};

const WEBSITE = 'www.mvsc.com.ng';
const BIRDS_PER_ESTIMATE = 100;
const numberFormat = new Intl.NumberFormat('en-NG');
const money = (amount: number) => `₦${numberFormat.format(amount)}`;
const scale = (amount: number, birds: number) => Math.ceil((amount * birds) / BIRDS_PER_ESTIMATE);
const feedBagCount = (birds: number) => scale(10, birds) + scale(33, birds);
const feedCost = (birds: number) => feedBagCount(birds) * 25000;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

const encodeQuotedPrintable = (bytes: Uint8Array) => {
  const lines: string[] = [];
  let line = '';
  for (const byte of bytes) {
    const token = byte >= 33 && byte <= 60 || byte >= 62 && byte <= 126
      ? String.fromCharCode(byte)
      : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    if (line.length + token.length > 75) {
      lines.push(`${line}=`);
      line = '';
    }
    line += token;
  }
  lines.push(line);
  return lines.join('\r\n');
};

const capitalItems: BudgetItem[] = [
  { item: 'Pen/house construction (deep litter)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} unit(s)`, unitCost: 200000, total: (birds) => scale(200000, birds) },
  { item: 'Brooder heat source (infrared bulb / charcoal pot)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)`, unitCost: 15000, total: (birds) => scale(15000, birds) },
  { item: 'Chick feeder trays', quantity: (birds) => numberFormat.format(scale(5, birds)), unitCost: 1500, total: (birds) => scale(7500, birds) },
  { item: 'Chick drinkers (0.75 L)', quantity: (birds) => numberFormat.format(scale(5, birds)), unitCost: 2000, total: (birds) => scale(10000, birds) },
  { item: 'Hanging feeders (grower/adult stage)', quantity: (birds) => numberFormat.format(scale(4, birds)), unitCost: 5000, total: (birds) => scale(20000, birds) },
  { item: 'Hanging drinkers (grower/adult stage)', quantity: (birds) => numberFormat.format(scale(4, birds)), unitCost: 6000, total: (birds) => scale(24000, birds) },
  { item: 'Lighting (bulbs and wiring)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)`, unitCost: 10000, total: (birds) => scale(10000, birds) },
  { item: 'Litter material (wood shavings, first batch)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} batch(es)`, unitCost: 15000, total: (birds) => scale(15000, birds) },
  { item: 'Miscellaneous (weighing scale, rake, record book, wheelbarrow)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} set(s)`, unitCost: 55000, total: (birds) => scale(55000, birds) },
];

const recurringItems: BudgetItem[] = [
  { item: 'Day-old layer chicks', quantity: (birds) => `${numberFormat.format(birds)} chicks`, unitCost: 1300, total: (birds) => birds * 1300 },
  { item: 'Feed — chick and grower mash', quantity: (birds) => `${numberFormat.format(feedBagCount(birds))} bags (25 kg)`, unitCost: 25000, total: feedCost },
  { item: 'Vaccines and medication', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)`, unitCost: 50000, total: (birds) => scale(50000, birds) },
  { item: 'Litter top-up/replacement', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)`, unitCost: 10000, total: (birds) => scale(10000, birds) },
  { item: 'Labour (if hired, approximately 4.5 months)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)`, unitCost: 100000, total: (birds) => scale(100000, birds) },
  { item: 'Utilities (water and brooding fuel)', quantity: (birds) => `${numberFormat.format(Math.ceil(birds / BIRDS_PER_ESTIMATE))} flock estimate(s)`, unitCost: 20000, total: (birds) => scale(20000, birds) },
];

const table = (headers: string[], rows: string[][]) => `
  <table>
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;

const budgetRows = (items: BudgetItem[], birds: number, withQuantity: boolean, includePrices: boolean) => items.map((item) => {
  const blank = '<span class="blank">&nbsp;</span>';
  const cells = [item.item];
  if (withQuantity) cells.push(item.quantity(birds));
  cells.push(includePrices ? money(item.unitCost) : blank);
  cells.push(includePrices ? money(item.total(birds)) : blank);
  return cells;
});

const amountRow = (label: string, amount: number, includePrices: boolean) => [label, includePrices ? money(amount) : '<span class="blank">&nbsp;</span>'];

export function createPulletRearingPlanMhtml({ birds, clientName, includeEstimatedPrices }: PulletRearingPlanOptions) {
  const flockSize = numberFormat.format(birds);
  const capitalTotal = capitalItems.reduce((total, item) => total + item.total(birds), 0);
  const recurringTotal = recurringItems.reduce((total, item) => total + item.total(birds), 0);
  const subtotal = capitalTotal + recurringTotal;
  const contingency = Math.round(subtotal * 0.1);
  const totalInvestment = subtotal + contingency;
  const feedRows = [
    ['Week 0–8', 'Chick mash', '~2.5 kg', `~${numberFormat.format(scale(10, birds) * 25)} kg`, `~${numberFormat.format(scale(10, birds))} bags`, includeEstimatedPrices ? money(scale(10, birds) * 25000) : '<span class="blank">&nbsp;</span>'],
    ['Week 9–20', 'Grower mash', '~8.25 kg', `~${numberFormat.format(scale(33, birds) * 25)} kg`, `~${numberFormat.format(scale(33, birds))} bags`, includeEstimatedPrices ? money(scale(33, birds) * 25000) : '<span class="blank">&nbsp;</span>'],
  ];
  const vaccineRows = [
    ['Day 1', 'Marek’s Disease (usually given at hatchery)', 'Subcutaneous'],
    ['Day 7–10', '1st dose Newcastle Disease (Lasota) + Infectious Bronchitis', 'Eye drop / drinking water'],
    ['Day 14–18', '1st dose Gumboro (IBD), 1st dose', 'Drinking water'],
    ['Day 21', '2nd dose Newcastle Disease booster (Lasota)', 'Drinking water'],
    ['Day 28', '2nd dose Gumboro (IBD), 2nd dose', 'Drinking water'],
    ['Week 6–8', 'Fowl Pox', 'Wing web stab'],
    ['Week 9–14', 'Newcastle Disease (Komarov/Killed)', 'Intramuscular'],
    ['Throughout', 'Vitamins, electrolytes and dewormers as needed', 'Drinking water'],
  ];
  const clientLine = clientName ? `<p class="prepared">Prepared for ${escapeHtml(clientName)} | Currency: Nigerian Naira (₦)</p>` : '<p class="prepared">Currency: Nigerian Naira (₦)</p>';
  const priceNotice = includeEstimatedPrices
    ? 'Budget figures are indicative estimates from the supplied planning template. Confirm current chick, feed, vaccine and material prices with local suppliers before purchasing.'
    : 'Price fields are intentionally blank for current local quotations. Confirm current chick, feed, vaccine and material prices with local suppliers before finalizing the budget.';
  const financialSummary = includeEstimatedPrices
    ? table(['Item', 'Amount (₦)'], [
      amountRow('Housing and equipment (Section 3)', capitalTotal, true),
      amountRow('Recurring costs (Sections 4 and 6.2)', recurringTotal, true),
      amountRow('Subtotal', subtotal, true),
      amountRow('Contingency (10%)', contingency, true),
    ])
    : table(['Item', 'Amount (₦)'], [
      amountRow('Housing and equipment (Section 3)', 0, false),
      amountRow('Recurring costs (Sections 4 and 6.2)', 0, false),
      amountRow('Subtotal', 0, false),
      amountRow('Contingency (10%)', 0, false),
    ]);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MVS Layer Poultry Production Plan</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { color: #202020; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.42; margin: 0 auto; max-width: 820px; }
    .brand { border-bottom: 2px solid #315f3b; margin-bottom: 24px; padding: 8px 0 12px; }
    .brand-table { margin: 0 auto; width: auto; }
    .brand-table td { border: 0; padding: 0 9px; vertical-align: middle; }
    .brand-logo { height: 88px; object-fit: contain; width: 88px; }
    .brand-copy { text-align: center; }
    .brand-name { color: #315f3b; font-size: 17pt; font-weight: bold; margin: 0; }
    .tagline { color: #91410c; font-weight: bold; margin: 4px 0; }
    .website { color: #555; font-size: 9pt; margin: 0; }
    h1 { font-size: 16pt; margin: 22px 0 4px; text-align: center; }
    .subtitle, .prepared { margin: 3px 0; text-align: center; }
    .prepared { color: #555; font-size: 9pt; font-style: italic; margin-bottom: 20px; }
    h2 { border-bottom: 1px solid #315f3b; color: #315f3b; font-size: 13pt; margin: 22px 0 9px; padding-bottom: 4px; }
    h3 { color: #315f3b; font-size: 11pt; margin: 15px 0 7px; }
    p { margin: 7px 0; }
    table { border-collapse: collapse; font-size: 9pt; margin: 8px 0 5px; width: 100%; }
    th { background: #91410c; color: #fff; font-weight: bold; text-align: left; }
    th, td { border: 1px solid #777; padding: 6px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #eaf0ea; }
    .note { color: #b42318; font-style: italic; margin: 9px 0; }
    .muted { color: #555; font-style: italic; }
    .subtotal, .total { color: #315f3b; font-weight: bold; }
    .blank { display: inline-block; min-width: 60px; }
    ul { padding-left: 22px; }
    li { margin: 5px 0; }
    .closing { font-weight: bold; margin-top: 20px; }
    .footer { border-top: 1px solid #315f3b; color: #315f3b; font-weight: bold; margin-top: 24px; padding-top: 9px; text-align: center; }
    tr { page-break-inside: avoid; }
    @media print { body { max-width: none; } }
  </style>
</head>
<body>
  <header class="brand">
    <table class="brand-table" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; width: auto;">
      <tr>
        <td style="border: 0; padding: 0 9px; vertical-align: middle;">
          <img class="brand-logo" src="cid:mvs-logo@mvsc.com.ng" alt="Mobile Veterinary Services logo" width="88" height="88" style="display: block; width: 88px; height: 88px;">
        </td>
        <td class="brand-copy" align="center" style="border: 0; padding: 0 9px; text-align: center; vertical-align: middle;">
          <p class="brand-name" style="text-align: center;">MOBILE VETERINARY SERVICES</p>
          <p class="tagline" style="text-align: center;">Veterinary Care on Demand, Right Next to You</p>
          <p class="website" style="text-align: center;">${WEBSITE}</p>
        </td>
      </tr>
    </table>
  </header>
  <h1>LAYER POULTRY PRODUCTION PLAN</h1>
  <p class="subtitle">Day-Old Chick to Point of Lay — ${flockSize} Bird Flock</p>
  ${clientLine}

  <h2>1. Overview</h2>
  <p>This plan outlines the housing, equipment, feeding, health, and financial requirements to raise ${flockSize} day-old layer pullets to point of lay (POL), typically around 18 to 20 weeks of age. It is structured in three management phases and closes with a flock-scaled cost breakdown.</p>

  <h2>2. Production Timeline &amp; Management Phases</h2>
  ${table(['Phase', 'Age (Weeks)', 'Key Focus'], [
    ['Brooding', 'Day-old – Week 8', 'Heat, biosecurity, chick mash, close monitoring'],
    ['Growing', 'Week 9 – Week 17', 'Frame and skeletal development on grower mash; transition off supplemental heat'],
    ['Pre-Lay / Point of Lay', 'Week 18 – Week 20', 'Transition to layer feed; nest box introduction; onset of lay'],
  ])}

  <h2>3. Housing &amp; Equipment (Capital Requirements)</h2>
  <p class="muted">One-time setup costs for a deep-litter housing system sized for this ${flockSize}-bird flock. Existing structures may reduce construction costs. Quantities are scaled for this flock size.</p>
  ${table(['Item', 'Qty', 'Est. Unit Cost (₦)', 'Est. Total (₦)'], budgetRows(capitalItems, birds, true, includeEstimatedPrices))}
  <p class="subtotal">Capital Subtotal: ${includeEstimatedPrices ? money(capitalTotal) : '________________'}</p>

  <h2>4. Feeding Program</h2>
  ${table(['Phase', 'Feed Type', 'Cumulative Intake/Bird', `Total for ${flockSize} Birds`, 'Est. Bags (25 kg)', 'Est. Cost (₦)'], feedRows)}
  <p class="subtotal">Feed Subtotal: ${includeEstimatedPrices ? money(feedCost(birds)) : '________________'}</p>
  <p class="note">NOTE: In Nigeria, point of lay sometimes spans 16–20 weeks, so it is prudent to plan feed through week 20. Feed typically accounts for 55–65% of total production cost. Confirm current bag prices with your supplier before finalizing the budget.</p>

  <h2>5. Health &amp; Vaccination Schedule</h2>
  ${table(['Age', 'Vaccine / Treatment', 'Route'], vaccineRows)}
  <p class="muted">This is a general guide — confirm the exact schedule and dosages with your state or attending veterinarian, as vaccination schedules vary by region, disease pressure and hatchery recommendations.</p>
  <p class="subtotal">Estimated Vaccination &amp; Medication Cost (${flockSize} birds, 18 weeks): ${includeEstimatedPrices ? money(scale(50000, birds)) : '________________'}</p>

  <h2>6. Financial Summary</h2>
  <h3>6.1 Capital (One-Time) Costs</h3>
  ${table(['Item', 'Amount (₦)'], [amountRow('Housing and equipment (Section 3)', capitalTotal, includeEstimatedPrices)])}
  <h3>6.2 Recurring Costs (Day-Old to Point of Lay)</h3>
  ${table(['Item', 'Qty', 'Est. Unit Cost (₦)', 'Amount (₦)'], budgetRows(recurringItems, birds, true, includeEstimatedPrices))}
  <h3>6.3 Total Investment</h3>
  ${financialSummary}
  <p class="total">ESTIMATED TOTAL INVESTMENT: ${includeEstimatedPrices ? money(totalInvestment) : '________________'}</p>
  ${includeEstimatedPrices ? `<p class="muted">Estimated cost per bird, day-old to point of lay: ${money(totalInvestment / birds)}.</p>` : ''}

  <h2>7. Notes &amp; Assumptions</h2>
  <ul>
    <li>${priceNotice}</li>
    <li>Housing estimates assume new construction with local materials; using an existing structure may reduce capital costs significantly.</li>
    <li>Labour is optional and can be removed if you "the client" will manage the flock personally.</li>
    <li>Mortality is not separately budgeted; maintain good brooding and biosecurity practices and allow for contingency in the budget.</li>
    <li>This plan ends at point of lay. Prepare a separate budget for the laying phase, including layer mash, egg trays, crates and ongoing veterinary care.</li>
    <li>Quantities and estimates are calculated for this ${flockSize}-bird flock and rounded up where whole equipment units or feed bags are required.</li>
  </ul>
  <p class="closing">Successful poultry farming starts with planning, not guessing.</p>
  <p>Thank you for choosing Mobile Veterinary Services. Visit ${WEBSITE} to learn more about our services.</p>
  <footer class="footer">MOBILE VETERINARY SERVICES ©${new Date().getFullYear()}<br>${WEBSITE}</footer>
</body>
</html>`;

  const boundary = `----=_MVS_Pullet_Plan_${Date.now()}`;
  const htmlBytes = new TextEncoder().encode(html);
  const quotedPrintableHtml = encodeQuotedPrintable(htmlBytes);
  const logoBase64 = MVS_LOGO_DATA_URI.slice('data:image/jpeg;base64,'.length).replace(/.{1,76}/g, '$&\r\n');

  return [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    'Content-Location: file:///mvs-pullet-rearing-plan.html',
    '',
    quotedPrintableHtml,
    `--${boundary}`,
    'Content-Type: image/jpeg',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <mvs-logo@mvsc.com.ng>',
    'Content-Location: file:///mvs-logo.jpeg',
    '',
    logoBase64,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
