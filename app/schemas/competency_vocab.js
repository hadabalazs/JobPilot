/**
 * Default competency vocabulary: themes a job ad might name, with the words ads actually use.
 * Used only to give an imported CV usable aliases for keyword matching. Contains no personal facts.
 * Users can edit, add or delete these after import.
 */
export const DEFAULT_COMPETENCIES = [
  { id: 'c_delivery', label: 'Delivery management', aliases: ['delivery management', 'end-to-end delivery', 'programme delivery', 'program delivery', 'project delivery', 'technical delivery'], tags: ['delivery', 'delivery-management', 'e2e-delivery', 'pm'] },
  { id: 'c_release', label: 'Release management', aliases: ['release management', 'release cadence', 'release train', 'deployment', 'go-live'], tags: ['release-management', 'release-cadence', 'release'] },
  { id: 'c_program', label: 'Programme & portfolio management', aliases: ['programme management', 'program management', 'portfolio management', 'PMO', 'roadmap planning'], tags: ['program-management', 'planning', 'pmo'] },
  { id: 'c_agile_scaling', label: 'Agile at scale', aliases: ['SAFe', 'LeSS', 'scaled agile', 'agile transformation', 'agile coaching', 'agile ways of working'], tags: ['safe', 'scaling-agile', 'agile-transformation', 'agile-coaching'] },
  { id: 'c_scrum', label: 'Scrum leadership', aliases: ['Scrum Master', 'scrum', 'sprint planning', 'retrospectives', 'backlog refinement', 'ceremonies'], tags: ['scrum', 'scrum-master', 'chapter-lead'] },
  { id: 'c_product', label: 'Product ownership', aliases: ['product owner', 'product management', 'backlog ownership', 'user stories', 'prioritisation', 'prioritization', 'roadmap'], tags: ['product-owner', 'product'] },
  { id: 'c_discovery', label: 'Discovery & validation', aliases: ['discovery', 'design thinking', 'user research', 'experimentation', 'A/B testing', 'validation'], tags: ['discovery', 'design-thinking', 'design'] },
  { id: 'c_stakeholders', label: 'Stakeholder management', aliases: ['stakeholder management', 'executive stakeholders', 'steering committee', 'C-level', 'client facing', 'client relationship'], tags: ['client-facing', 'engagement-management', 'cross-team', 'account-growth'] },
  { id: 'c_people', label: 'People leadership', aliases: ['line management', 'people management', 'team leadership', 'coaching', 'mentoring', 'hiring', 'capability building'], tags: ['team-scaling', 'evangelism', 'workshops', 'turnaround'] },
  { id: 'c_vendor', label: 'Vendor & partner management', aliases: ['vendor management', 'third party', 'outsourcing', 'SLA', 'supplier'], tags: ['vendor', 'partner'] },
  { id: 'c_budget', label: 'Budget & resource management', aliases: ['budget', 'cost management', 'resource allocation', 'capacity planning', 'P&L'], tags: ['budget', 'resource-management'] },
  { id: 'c_risk', label: 'Risk & compliance', aliases: ['risk management', 'compliance', 'regulatory', 'KYC', 'governance', 'audit'], tags: ['risk', 'compliance', 'regulatory'] },
  { id: 'c_metrics', label: 'Metrics & reporting', aliases: ['flow metrics', 'cycle time', 'throughput', 'KPIs', 'OKRs', 'dashboards', 'reporting', 'BI', 'data-driven'], tags: ['metrics', 'reporting', 'metric-strong'] },
  { id: 'c_mobile', label: 'Mobile delivery', aliases: ['mobile app', 'iOS', 'Android', 'App Store', 'mobile banking', 'cross-platform'], tags: ['mobile', 'ios', 'android', 'app-store'] },
  { id: 'c_web', label: 'Web & SaaS platforms', aliases: ['SaaS', 'web platform', 'e-commerce', 'checkout', 'search', 'loyalty'], tags: ['web', 'saas', 'ecommerce', 'checkout', 'search', 'loyalty'] },
  { id: 'c_banking', label: 'Banking & financial services', aliases: ['banking', 'fintech', 'financial services', 'payments', 'lending', 'digital banking'], tags: ['banking', 'fintech', 'finance'] },
  { id: 'c_retail', label: 'Retail & consumer', aliases: ['retail', 'e-commerce', 'consumer app', 'marketplace'], tags: ['retail'] },
  { id: 'c_consulting', label: 'Consulting & engagements', aliases: ['consulting', 'client engagements', 'engagement management', 'presales', 'proposals'], tags: ['consulting', 'concurrent-engagements', 'mckinsey', 'international'] },
  { id: 'c_technical', label: 'Technical fluency', aliases: ['technical background', 'hands-on', 'engineering', 'architecture', 'API', 'software development'], tags: ['technical-fluency', 'solo-shipping', 'swift', 'swiftui'] },
  { id: 'c_ai', label: 'AI tooling & automation', aliases: ['AI tools', 'AI fluency', 'automation', 'LLM', 'GenAI', 'AI-assisted'], tags: ['ai', 'ai-tooling', 'automation'] },
  { id: 'c_scale', label: 'Delivering at scale', aliases: ['at scale', 'large organisation', 'multiple teams', 'cross-functional', 'distributed teams'], tags: ['scale', 'cross-team'] },
];

/** tag → competency id lookup, built from the table above. */
export const TAG_TO_COMPETENCY = (() => {
  const m = new Map();
  for (const c of DEFAULT_COMPETENCIES) {
    for (const t of c.tags) m.set(t.toLowerCase(), c.id);
    m.set(c.label.toLowerCase(), c.id);
    for (const a of c.aliases) m.set(a.toLowerCase(), c.id);
  }
  return m;
})();
