/** Loads fixtures in both browser and Node. */
export async function loadCV() {
  if (typeof window !== 'undefined') return (await fetch('./fixtures/cv_master.sample.json')).json();
  const fs = await import('node:fs/promises');
  return JSON.parse(await fs.readFile(new URL('./cv_master.sample.json', import.meta.url), 'utf8'));
}
export const JD_DELIVERY = `Delivery Manager – Digital Banking
Join Falcon Bank in Dubai, UAE

About the role
We are looking for a Delivery Manager to lead multiple Scrum teams delivering our mobile banking app and digital onboarding journeys. You will own end-to-end delivery, run the steering committee with executive stakeholders and manage third-party vendors.

Requirements
- 8+ years in delivery or programme management, ideally in banking or fintech
- Experience leading Scrum Masters and scaling agile (SAFe or similar)
- Strong stakeholder management with C-level executives
- Track record with flow metrics (cycle time, throughput) and release management
- Vendor management and SLA negotiation

Nice to have
- SAFe SPC certification
- PI planning experience

Apply now
Show more`;
export const JD_DATA = `Senior Data Engineer
Doha, Qatar

Responsibilities
Build and maintain data pipelines in Spark and Airflow. Own the data lake architecture on AWS. Write Python and SQL daily.

Requirements
- 5+ years data engineering
- Python, SQL, Spark, Airflow, AWS
- Arabic mandatory`;
export const GOOD_RESULT = jobId => ({
  schema_version: 'tailor_result_v1', job_id: jobId,
  fit: { verdict: 'good', score: 78,
    matched_requirements: [{ requirement: 'Lead multiple Scrum teams', evidence_bullet_ids: ['b_bank_01', 'b_bank_02'] }],
    missing_requirements: [{ requirement: 'SAFe SPC certification', severity: 'nice', mitigation: 'Lean on SAFe Agilist cert' }],
    keywords_present: ['Scrum', 'release management'], keywords_absent: ['PI planning'], red_flags: [] },
  selection: { summary_variant_id: 'sum_delivery', summary_override: null, bullet_ids_in_order: { exp_bank: ['b_bank_01', 'b_bank_03', 'b_bank_02', 'b_bank_04'], exp_retail: ['b_retail_01', 'b_retail_02'] }, skills_order: ['Agile & Delivery', 'Leadership', 'Tools'], omit_experience_ids: ['exp_consult'] },
  rewrites: [{ bullet_id: 'b_bank_01', text: 'Own end-to-end delivery of the mobile onboarding programme across 6 squads (45 engineers), cutting release lead time from 6 weeks to 2 weeks in 9 months.', reason: 'mirrors "end-to-end delivery"', keywords_injected: ['end-to-end delivery'] }],
  cover_letter: null, ai_notes: [], self_check: { all_ids_exist: true, no_new_numbers: true },
});
