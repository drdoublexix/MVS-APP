import { supabase } from './supabase';

export type PassportMedicalRecord = {
  id: string;
  treatment_type: string;
  title: string;
  administered_date: string;
  next_due_date: string | null;
  dose_series_number: number | null;
  total_series_doses: number | null;
  dosage: string | null;
  notes: string | null;
  status: string | null;
  follow_up_status: string;
  vet_name: string;
  vet_email: string | null;
  vet_verified: boolean;
};

export type PassportSoapRecord = {
  id: string;
  created_at: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  tentative_diagnosis: string | null;
  plan: string | null;
  weight_kg: number | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  vet_name: string;
  vet_email: string | null;
  vet_verified: boolean;
};

export type DigitalPassport = {
  id: string;
  record_type: 'pet' | 'farm';
  name: string;
  species: string;
  breed: string | null;
  species_verified: boolean;
  breed_verified: boolean;
  species_verified_by: { name: string | null; email: string | null } | null;
  breed_verified_by: { name: string | null; email: string | null } | null;
  owner_name: string;
  flock_size?: number | null;
  vaccination_status_reported?: string | null;
  active_medical_status: string;
  medical_records: PassportMedicalRecord[];
  soap_records: PassportSoapRecord[];
  record_details: {
    date_of_birth?: string | null;
    medical_notes?: string | null;
    location?: string | null;
    restock_date?: string | null;
    medical_log?: string | null;
    production_summary?: string | null;
  };
  issued_at: string;
};

export const getPublicDigitalPassport = async (passportId: string, accessToken: string) => {
  const { data, error } = await supabase.rpc('get_complete_public_digital_passport', {
    p_passport_id: passportId,
    p_access_token: accessToken,
  });
  if (error) throw error;
  return data as DigitalPassport | null;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] || character));

const formatPassportDate = (date: string) => new Date(date).toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export const createDigitalPassportHtml = (
  passport: DigitalPassport,
  passportUrl: string,
  qrCodeBase64?: string,
) => {
  const info = [
    ['Record type', passport.record_type === 'pet' ? 'Pet record' : 'Farm / livestock record'],
    ['Owner', passport.owner_name],
    ['Current medical status', passport.active_medical_status],
    ...(passport.flock_size ? [['Recorded herd / flock size', String(passport.flock_size)]] : []),
    ...(passport.vaccination_status_reported ? [['Owner-reported vaccination status', passport.vaccination_status_reported]] : []),
    ...(passport.record_details.date_of_birth ? [['Date of birth', formatPassportDate(passport.record_details.date_of_birth)]] : []),
    ...(passport.record_details.medical_notes ? [['Medical notes', passport.record_details.medical_notes]] : []),
    ...(passport.record_details.location ? [['Location', passport.record_details.location]] : []),
    ...(passport.record_details.restock_date ? [['Restock date', formatPassportDate(passport.record_details.restock_date)]] : []),
    ...(passport.record_details.medical_log ? [['Medical log', passport.record_details.medical_log]] : []),
    ...(passport.record_details.production_summary ? [['Production summary', passport.record_details.production_summary]] : []),
  ];
  const infoHtml = info.map(([label, value]) =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('');
  const recordsHtml = passport.medical_records.length
    ? passport.medical_records.map((record) => `
      <section class="record">
        <h2>${escapeHtml(record.title)}</h2>
        <p>${escapeHtml(record.treatment_type)} · Administered ${formatPassportDate(record.administered_date)}</p>
        ${record.dose_series_number && record.total_series_doses
          ? `<p>Dose ${record.dose_series_number} of ${record.total_series_doses}</p>` : ''}
        ${record.dosage ? `<p>Dosage: ${escapeHtml(record.dosage)}</p>` : ''}
        ${record.next_due_date ? `<p>Next due: ${formatPassportDate(record.next_due_date)}</p>` : ''}
        ${record.status ? `<p>Status: ${escapeHtml(record.status)}</p>` : ''}
        <p>Follow-up: ${escapeHtml(record.follow_up_status)}</p>
        ${record.notes ? `<p>Notes: ${escapeHtml(record.notes)}</p>` : ''}
        <p>Veterinarian: ${escapeHtml(record.vet_name)}</p>
        ${record.vet_email ? `<p>Email: ${escapeHtml(record.vet_email)}</p>` : ''}
        ${record.vet_verified ? '<p>MVS verified veterinarian</p>' : ''}
      </section>`).join('')
    : '<p>No veterinarian-entered treatment, vaccination, or deworming records are recorded.</p>';

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body{font-family:Arial,sans-serif;color:#0f172a;padding:28px;line-height:1.45}
      h1{color:#047857;margin-bottom:4px}h2{font-size:16px;margin:0 0 6px}
      .badge{color:#047857;font-weight:bold}.record{border-top:1px solid #cbd5e1;padding:12px 0}
      .qr{width:160px;height:160px;margin:12px 0}.link{word-break:break-all}
      @media print{body{padding:0}}
    </style></head><body>
      <h1>MVS Digital Health Passport</h1>
      <p class="badge">MVS verified passport record</p>
      ${qrCodeBase64 ? `<img class="qr" src="data:image/png;base64,${qrCodeBase64}" alt="Passport QR code">` : ''}
      <h2>${escapeHtml(passport.name)}</h2>
      <p>Species: ${escapeHtml(passport.species)} · Breed: ${escapeHtml(passport.breed || 'Not recorded')}</p>
      <p>Species ${passport.species_verified ? 'verified' : 'not yet verified'}; breed ${passport.breed_verified ? 'verified' : 'not yet verified'}.</p>
      ${infoHtml}
      <h2>Medical and treatment timeline</h2>
      ${recordsHtml}
      <p class="link">Secure passport: <a href="${escapeHtml(passportUrl)}">${escapeHtml(passportUrl)}</a></p>
      <p>Generated ${formatPassportDate(new Date().toISOString())}. MVS verifies this record; it does not replace professional veterinary advice.</p>
    </body></html>`;
};

export const verifyDigitalPassportDetails = async (recordType: 'pet' | 'farm', recordId: string) => {
  const recordColumn = recordType === 'pet' ? 'pet_id' : 'farm_record_id';
  const { data, error } = await supabase
    .from('digital_passports')
    .select('id')
    .eq(recordColumn, recordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The digital passport is not available yet. Try again shortly.');

  const { error: verificationError } = await supabase.rpc('verify_digital_passport_animal_details', {
    p_passport_id: data.id,
  });
  if (verificationError) throw verificationError;
};
