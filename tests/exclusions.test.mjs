import test from 'node:test';
import assert from 'node:assert/strict';
import { excludedJobs } from '../scripts/exclusions.mjs';
test('excluded employers include branded recruiter variants', () => {
  const jobs=[{company:'Halian | Managed Services, Recruitment and Contract Staffing Agency'},{company:'Accenture Middle East'},{company:'Example'}];
  assert.equal(excludedJobs(jobs,{excludedCompanies:['Halian','Accenture']}).length,2);
});
test('existing jobs excluded across LinkedIn URL variants and employer links', () => {
  const jobs=[{sourceUrl:'https://ae.linkedin.com/jobs/view/role-123'}, {sourceUrl:'https://linkedin.com/jobs/view/456',links:[{url:'https://example.org/jobs/9?utm_source=test'}]}];
  assert.equal(excludedJobs(jobs,{jobs:[{sourceUrl:'https://www.linkedin.com/jobs/search/?currentJobId=123'}],previousReportLinks:['https://example.org/jobs/9']}).length,2);
});
test('title/employer fallback tolerates punctuation and location; new role retained', () => {
  const old={title:'Programme Manager',company:'Example Ltd',location:'Dubai'};
  assert.equal(excludedJobs([{...old,company:'EXAMPLE LTD.',location:'UAE'}],{jobs:[old]}).length,1);
  assert.equal(excludedJobs([{title:'Product Manager',company:'Example Ltd'}],{jobs:[old]}).length,0);
});
