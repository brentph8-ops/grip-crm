function cloneDefault(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneDefault(fallback);
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? cloneDefault(fallback) : parsed;
  } catch (error) {
    console.warn(`GRIP ignored unreadable browser storage for ${key}.`, error);
    return cloneDefault(fallback);
  }
}

function openDialog(dialogOrId) {
  const dialog = typeof dialogOrId === "string" ? byId(dialogOrId) : dialogOrId;
  if (!dialog) return;
  if (dialog.open) return;
  dialog.showModal();
}

const baseData = window.CRM_DATA || { accounts: [], projects: [], proposals: [], meta: {} };
const savedCrm = readStorageJson("garlandCrmData", { accounts: [], proposals: [], contractors: [] });
if (!Array.isArray(savedCrm.accounts)) savedCrm.accounts = [];
if (!Array.isArray(savedCrm.projects)) savedCrm.projects = [];
if (!Array.isArray(savedCrm.proposals)) savedCrm.proposals = [];
if (!Array.isArray(savedCrm.contractors)) savedCrm.contractors = [];
if (!Array.isArray(savedCrm.deleted)) savedCrm.deleted = [];
if (!Array.isArray(savedCrm.archived)) savedCrm.archived = [];
if (!savedCrm.edits) savedCrm.edits = { accounts: {}, projects: {}, proposals: {} };
if (!savedCrm.edits.accounts) savedCrm.edits.accounts = {};
if (!savedCrm.edits.projects) savedCrm.edits.projects = {};
if (!savedCrm.edits.proposals) savedCrm.edits.proposals = {};

// ── Seed locally-created accounts ────────────────────────────────
(function seedAccounts() {
  const _seed = [
    {
      id: "local-account-seed-waller",
      sourceRow: "Local", clientRanking: "Prospecting",
      client: "City of Waller", entity: "Municipal", county: "Waller", state: "TX",
      poc: "Daniel Wilson", title: "Public Works Director",
      phone: "(936) 372-3880", email: "dwilson@wallertexas.gov",
      address: "1218 Farr St, Waller, TX 77484",
      action: "", nextStep: "", activity: new Date().toISOString(),
    },
    {
      id: "local-account-seed-sealyisd",
      sourceRow: "Local", clientRanking: "Prospecting",
      client: "Sealy ISD", entity: "K-12", county: "Austin", state: "TX",
      poc: "Michael Zapalac", title: "Project Manager",
      phone: "(979) 885-3516", email: "mzapalac@sealyisd.com",
      address: "939 Tiger Ln, Sealy, TX 77474",
      action: "", nextStep: "", activity: new Date().toISOString(),
    },
    {
      id: "local-account-seed-hempstead",
      sourceRow: "Local", clientRanking: "Prospecting",
      client: "City of Hempstead", entity: "Municipal", county: "Waller", state: "TX",
      poc: "James Glover", title: "Park & Recreation Director",
      phone: "(979) 826-2486", email: "",
      address: "1125 Austin St, Hempstead, TX 77445",
      action: "", nextStep: "", activity: new Date().toISOString(),
    },
  ];
  const existing = new Set(savedCrm.accounts.map(a => a.id));
  let changed = false;
  _seed.forEach(acct => { if (!existing.has(acct.id)) { savedCrm.accounts.push(acct); changed = true; } });
  if (changed) try { localStorage.setItem("garlandCrmData", JSON.stringify(savedCrm)); } catch(e) {}
})();
savedCrm.contractors = savedCrm.contractors.map((contractor) =>
  typeof contractor === "string"
    ? {
        id: `contractor-${normalize(contractor)}`,
        companyName: contractor,
        poc: "",
        title: "",
        phone: "",
        email: "",
        color: "#0057a8",
        address: "",
        supportContacts: [],
      }
    : { color: "#0057a8", supportContacts: [], ...contractor }
);
const proposalUpdates = readStorageJson("garlandProposalUpdates", {});
const territorySettings = readStorageJson("garlandTerritorySettings", {
  entities: [],
  counties: [],
  hiddenEntities: [],
  hiddenCounties: [],
  goals: { material: 0, commission: 0, wise: 0 },
});
if (!Array.isArray(territorySettings.entities)) territorySettings.entities = [];
if (!Array.isArray(territorySettings.counties)) territorySettings.counties = [];
if (!Array.isArray(territorySettings.hiddenEntities)) territorySettings.hiddenEntities = [];
if (!Array.isArray(territorySettings.hiddenCounties)) territorySettings.hiddenCounties = [];
if (!territorySettings.goals) territorySettings.goals = { material: 0, commission: 0, wise: 0 };
if (!territorySettings.colors) territorySettings.colors = { entity: {}, county: {} };
if (!territorySettings.colors.entity) territorySettings.colors.entity = {};
if (!territorySettings.colors.county) territorySettings.colors.county = {};
if (!territorySettings.rep) territorySettings.rep = { name: "Brent Phillips", phone: "", email: "" };
if (!territorySettings.state) territorySettings.state = "";
if (territorySettings.population === undefined) territorySettings.population = "";
const data = {
  ...baseData,
  accounts: [...baseData.accounts.map((record) => ({ ...record, ...(savedCrm.edits.accounts[record.id] || {}) })), ...(savedCrm.accounts || [])],
  projects: [...baseData.projects.map((record) => ({ ...record, ...(savedCrm.edits.projects[record.id] || {}) })), ...(savedCrm.projects || [])],
  proposals: [...baseData.proposals, ...(savedCrm.proposals || [])].map((proposal) => ({
    ...proposal,
    ...(savedCrm.edits.proposals[proposal.id] || {}),
    ...(proposalUpdates[proposal.id] || {}),
  })),
};

const proposalStages = [
  "Working on Ramp & SOW",
  "Sent Ramp & Budget to Client",
  "Budget Approved",
  "Proposals Requested",
  "Proposals Sent to Client",
  "Proposals Approved",
  "PO Received",
  "Waiting On Material Order",
  "Material Ordered",
  "Work Scheduled",
  "Work Completed",
  "Proposal Rejected",
];

const projectStages = [
  "Prospecting",
  "Budget Approved",
  "Pre Bid Scheduled",
  "Contractors Bidding",
  "Bids Reviewed",
  "Project Awarded",
  "Waiting On Material Order",
  "Material Ordered",
  "Work Scheduled",
  "Work Completed",
  "On Hold",
  "Proposal Rejected",
];

const abcScores = ["Job Won", "A (90%)", "B (50%)", "C (25%)"];
const accountRankOptions = ["Prospecting", "In Progress", "Meeting", "C", "B", "A", "Dead End"];
const defaultProjectType = "New Roof/Reroof";
const projectTypes = ["New Roof/Reroof", "Recover", "Restoration"];
const contractorWarrantyOptions = ["Not selected", "2-year contractor warranty", "3-year contractor warranty", "4-year contractor warranty", "5-year contractor warranty"];
const windUpliftUrl = "https://winduplift.garlandhq.com/index-dashboard.php";
const taskTypes = ["Call", "Email", "Follow-Up", "Project Related", "Proposal Related"];
const taskPriorities = ["Low", "Normal", "High", "Urgent"];
const taskStatuses = ["Open", "In Progress", "Waiting", "Completed", "Cancelled"];
const taskNextActions = [
  "Call Contact",
  "Send Email",
  "Follow Up on Proposal",
  "Schedule Site Visit",
  "Send Photos/Report",
  "Review Scope",
  "Prepare Proposal",
  "Coordinate Contractor",
  "Inspect Roof",
  "Warranty Follow-Up",
];
const taskReminderTypes = ["None", "Same Day", "1 Day Before", "Custom Date/Time"];
const taskRecurringTypes = ["None", "Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Custom Repeat"];
const taskCompletedOutcomes = [
  "Spoke with Contact",
  "Left Voicemail",
  "Sent Email",
  "Waiting on Response",
  "Proposal Sent",
  "Site Visit Scheduled",
  "Inspection Completed",
  "Contractor Coordinated",
];
const taskTemplates = {
  "Follow Up on Proposal": { task_type: "Follow-Up", priority: "High", next_action: "Follow Up on Proposal", description: "Check proposal status, confirm next decision step, and log outcome." },
  "Schedule Roof Walk": { task_type: "Call", priority: "Normal", next_action: "Schedule Site Visit", description: "Coordinate date/time for roof walk and confirm site access." },
  "Send Scope of Work": { task_type: "Email", priority: "High", next_action: "Send Email", description: "Send scope of work and request pricing by the required due date." },
  "Call Contractor": { task_type: "Call", priority: "Normal", next_action: "Coordinate Contractor", description: "Call contractor for proposal status, site visit needs, or clarifications." },
  "Check Leak Status": { task_type: "Follow-Up", priority: "Urgent", next_action: "Call Contact", description: "Confirm whether leak is active, where it is occurring, and whether temporary repair is needed." },
  "Send Warranty Info": { task_type: "Email", priority: "Normal", next_action: "Warranty Follow-Up", description: "Send warranty information and confirm requested warranty direction." },
  "OAC Follow-Up": { task_type: "Follow-Up", priority: "High", next_action: "Follow Up on Proposal", description: "Follow up after OAC meeting and confirm action items." },
  "Project Site Visit": { task_type: "Project Related", priority: "Normal", next_action: "Inspect Roof", description: "Complete site visit, photos, checklist notes, and project next steps." },
  "Capital Planning Follow-Up": { task_type: "Follow-Up", priority: "Normal", next_action: "Call Contact", description: "Discuss capital plan timing, budget, and upcoming roofing priorities." },
};
const punchListStatuses = ["Draft", "Running Punch List", "Sent to Contractor", "Contractor Submitted", "Under Review", "Approved", "Rejected / Needs Correction", "Closed"];
const punchItemStatuses = ["Open", "Pending Contractor Response", "Submitted for Review", "Approved", "Rejected", "Needs Additional Correction", "Closed"];
const punchListTypes = ["Roofing Project", "Warranty Project", "Leak Repair", "Capital Project", "Closeout Inspection", "OAC Walkthrough"];
const punchCategories = ["Flashing", "Drainage", "Membrane", "Metal Edge", "Coating", "Penetration", "Cleanup", "Safety", "Workmanship", "Warranty Item", "Other"];
const punchSeverities = ["Warranty Critical", "Leak Risk", "Safety Issue", "Cosmetic", "Cleanup"];
const punchWaterStatuses = ["Not Required", "Water Test Required", "Water Test Passed", "Water Test Failed", "Manufacturer Reviewed"];
const punchRejectionReasons = ["Not Corrected", "Photo Does Not Show Correction", "Workmanship Issue Remains", "Needs Manufacturer Review", "Needs Water Test"];
const punchCloseoutChecks = ["Punch List Complete", "Drain Test Complete", "Photos Uploaded", "Warranty Items Resolved", "Final Walkthrough Completed", "Owner Sign-Off Received"];
const productReferenceLinks = [
  { match: "cool sil eliminator", label: "Cool-Sil Eliminator", url: "https://www.garlandco.com/products/coatings/restoration-systems/Cool-Sil-Eliminator" },
  { match: "cool sil bleed block primer", label: "Cool-Sil Bleed Block Primer", url: "https://www.garlandco.com/products/coatings/restoration-systems/Cool-Sil" },
  { match: "cool sil single ply primer", label: "Cool-Sil Single Ply Primer", url: "https://www.garlandco.com/products/coatings/restoration-systems/Cool-Sil" },
  { match: "stressply iv plus", label: "StressPly IV Plus", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-IV-Plus-UV-Mineral" },
  { match: "stressply legacy", label: "StressPly Legacy", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/stressply-legacy-fr-mineral" },
  { match: "stressply euv", label: "StressPly EUV", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-EUV-FR-Mineral" },
  { match: "stressply max", label: "StressPly Max", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-Max-FR-Mineral" },
  { match: "stressply sa", label: "StressPly SA", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-SA-FR-Mineral" },
  { match: "stressply plus", label: "StressPly Plus", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-Plus-FR-Mineral" },
  { match: "stressply", label: "StressPly FR Mineral", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/StressPly-FR-Mineral" },
  { match: "optimax", label: "OptiMax", url: "https://www.garlandco.com/products/membranes-and-capsheets/modified-bitumen/Optimax" },
  { match: "kee-stone fb 60", label: "KEE-Stone FB 60", url: "https://www.garlandco.com/products/membranes-and-capsheets/kee-thermoplastic/KEE-Stone-FB-60-2-Ply-KEE-Roof-System" },
  { match: "kee stone fb 60", label: "KEE-Stone FB 60", url: "https://www.garlandco.com/products/membranes-and-capsheets/kee-thermoplastic/KEE-Stone-FB-60-2-Ply-KEE-Roof-System" },
  { match: "kee-stone hp", label: "KEE-Stone HP", url: "https://www.garlandco.com/products/membranes-and-capsheets/kee-thermoplastic/kee-stone-hp" },
  { match: "kee stone hp", label: "KEE-Stone HP", url: "https://www.garlandco.com/products/membranes-and-capsheets/kee-thermoplastic/kee-stone-hp" },
  { match: "versiply", label: "VersiPly 80 / VersiPly Mineral", url: "https://www.garlandco.com/products/roll-goods/versiply-80-mineral-modified-roofing-membrane" },
  { match: "ultra shield torch", label: "Ultra-Shield Torch Base", url: "https://www.garlandco.com/products/base-and-ply-sheets/Ultra-Shield" },
  { match: "hpr torchbase", label: "HPR Torch Base", url: "https://www.garlandco.com/products/roll-goods/hpr-torch-applied-base-sheet-for-torch-down-roofing" },
  { match: "sa base iv", label: "SA Base IV", url: "https://www.garlandco.com/products/base-and-ply-sheets/SA-Base-IV" },
  { match: "stressbase 80 plus", label: "StressBase 80 Plus", url: "https://www.garlandco.com/products/base-and-ply-sheets/StressBase-80-Plus" },
  { match: "stressbase 80", label: "StressBase 80/120", url: "https://www.garlandco.com/products/base-and-ply-sheets/StressBase-80-120" },
  { match: "flexbase plus e 80", label: "FlexBase Plus E 80", url: "https://www.garlandco.com/products/base-and-ply-sheets/FlexBase-E-80" },
  { match: "flexbase plus 80", label: "FlexBase Plus 80", url: "https://www.garlandco.com/products/base-and-ply-sheets/FlexBase-Plus-80" },
  { match: "flexbase e 80", label: "FlexBase E 80", url: "https://www.garlandco.com/products/roll-goods/flexbase-e-80-base-sheet-roofing" },
  { match: "flexbase 80", label: "FlexBase 80", url: "https://www.garlandco.com/products/roll-goods/flexbase-80-base-sheet-roofing" },
  { match: "hpr premium glasbase", label: "HPR Glasbase / Premium Glasbase", url: "https://www.garlandco.com/products/base-and-ply-sheets/HPR-Glasbase" },
  { match: "hpr glasbase", label: "HPR Glasbase / Premium Glasbase", url: "https://www.garlandco.com/products/base-and-ply-sheets/HPR-Glasbase" },
  { match: "hpr glasfelt", label: "HPR Glasfelt", url: "https://www.garlandco.com/products/base-and-ply-sheets/HPR-Glasfelt" },
  { match: "hpr tri-base premium", label: "HPR Tri-Base Premium", url: "https://www.garlandco.com/products/base-and-ply-sheets/HPR-Tri-Base-Premium" },
  { match: "hpr sa fr base sheet", label: "HPR SA FR Base Sheet", url: "https://www.garlandco.com/products/base-and-ply-sheets/HPR-SA-FR-Base-Sheet" },
  { match: "green lock plus", label: "Green-Lock Plus", url: "https://www.garlandco.com/products/adhesives/green-lock-plus" },
  { match: "weatherking plus wc", label: "Weatherking / Plus WC", url: "https://www.garlandco.com/products/adhesives/Weatherking-Plus-WC" },
  { match: "weatherking", label: "Weatherking / Plus WC", url: "https://www.garlandco.com/products/adhesives/Weatherking-Plus-WC" },
  { match: "garlastic km plus", label: "Garlastic KM Plus", url: "https://www.garlandco.com/products/adhesives/Garlastic-KM-Plus" },
  { match: "kee-lock spatter spray", label: "KEE-Lock Spatter Spray", url: "https://www.garlandco.com/products/adhesives/KEE-Lock-Spatter-Spray" },
  { match: "kee lock spatter spray", label: "KEE-Lock Spatter Spray", url: "https://www.garlandco.com/products/adhesives/KEE-Lock-Spatter-Spray" },
  { match: "kee-lock foam", label: "KEE-Lock Foam", url: "https://www.garlandco.com/products/adhesives/KEE-Lock-Foam" },
  { match: "kee lock foam", label: "KEE-Lock Foam", url: "https://www.garlandco.com/products/adhesives/KEE-Lock-Foam" },
  { match: "garla-block 2k", label: "Garla-Block 2K", url: "https://www.garlandco.com/products/primers/Garla-Block-2k" },
  { match: "garla block 2k", label: "Garla-Block 2K", url: "https://www.garlandco.com/products/primers/Garla-Block-2k" },
  { match: "garla-block", label: "Garla-Block", url: "https://www.garlandco.com/products/primers/Garla-Block" },
  { match: "garla block", label: "Garla-Block", url: "https://www.garlandco.com/products/primers/Garla-Block" },
  { match: "garla-prime", label: "Garla-Prime", url: "https://www.garlandco.com/products/primers/Garla-Prime" },
  { match: "garla prime", label: "Garla-Prime", url: "https://www.garlandco.com/products/primers/Garla-Prime" },
  { match: "black-knight primer", label: "Black-Knight / Black-Stallion Primer", url: "https://www.garlandco.com/products/primers/Black-Knight-Black-Stallion-Primer" },
  { match: "black knight primer", label: "Black-Knight / Black-Stallion Primer", url: "https://www.garlandco.com/products/primers/Black-Knight-Black-Stallion-Primer" },
  { match: "metal roof primer", label: "Metal Roof Primer", url: "https://www.garlandco.com/products/primers/Metal-Roof-Primer" },
  { match: "r mer shield", label: "R-Mer Shield", url: "https://www.garlandco.com/products/metal/standing-seam-metal-roofing/R-Mer-Shield" },
  { match: "r mer loc", label: "R-Mer Loc", url: "https://www.garlandco.com/products/metal/standing-seam-metal-roofing/R-Mer-Loc" },
  { match: "r mer wall pan", label: "R-Mer Wall-Pan", url: "https://www.garlandco.com/products/metal/wall-panels-and-rainscreens/R-Mer-Wall-Pan" },
  { match: "r mer seal", label: "R-Mer Seal", url: "https://www.garlandco.com/products/underlayments/R-Mer-Seal" },
  { match: "r mer ss", label: "R-Mer SS Flat Stock", url: "https://www.garlandco.com/products/accessories/R-Mer-SS" },
  { match: "intelliwrap underlayment", label: "IntelliWrap Underlayment", url: "https://imetco.com/wp-content/uploads/2017/08/IntelliWrap-LTVP_air_barriers_from_IMETCO.pdf" },
  { match: "white-knight plus", label: "White-Knight Plus / White-Stallion Plus", url: "https://www.garlandco.com/products/membranes-and-capsheets/fluid-applied/White-Knight-White-Stallion-Plus" },
  { match: "white knight plus", label: "White-Knight Plus / White-Stallion Plus", url: "https://www.garlandco.com/products/membranes-and-capsheets/fluid-applied/White-Knight-White-Stallion-Plus" },
  { match: "white knight", label: "White-Knight Plus / White-Stallion Plus", url: "https://www.garlandco.com/products/membranes-and-capsheets/fluid-applied/White-Knight-White-Stallion-Plus" },
  { match: "liquitec", label: "LiquiTec", url: "https://www.garlandco.com/products/coatings/restoration-systems/LiquiTec" },
  { match: "cool sil", label: "Cool-Sil", url: "https://www.garlandco.com/products/coatings/restoration-systems/Cool-Sil" },
  { match: "black-knight cold", label: "Black-Knight / Black-Stallion Cold", url: "https://www.garlandco.com/products/coatings/built-up-roof/Black-Knight-Cold-Tar" },
  { match: "black knight cold", label: "Black-Knight / Black-Stallion Cold", url: "https://www.garlandco.com/products/coatings/built-up-roof/Black-Knight-Cold-Tar" },
  { match: "black-stallion cold", label: "Black-Knight / Black-Stallion Cold", url: "https://www.garlandco.com/products/coatings/built-up-roof/Black-Knight-Cold-Tar" },
  { match: "black stallion cold", label: "Black-Knight / Black-Stallion Cold", url: "https://www.garlandco.com/products/coatings/built-up-roof/Black-Knight-Cold-Tar" },
  { match: "weatherscreen", label: "WeatherScreen", url: "https://www.garlandco.com/products/coatings/built-up-roof/weatherscreen" },
  { match: "revitalizer metal", label: "Revitalizer Metal", url: "https://www.garlandco.com/products/coatings/metal/Revitalizer-Metal" },
  { match: "revitalizer", label: "Revitalizer", url: "https://www.garlandco.com/products/coatings/built-up-roof/Revitalizer" },
  { match: "pyramic plus lo", label: "Pyramic Plus LO", url: "https://www.garlandco.com/products/coatings/built-up-roof/Pyramic-plus-LO" },
  { match: "pyramic", label: "Pyramic", url: "https://www.garlandco.com/products/coatings---primers/pyramic-reflective-roof-coating" },
  { match: "stratamax", label: "StrataMax", url: "https://www.garlandco.com/products/coatings/built-up-roof/stratamax" },
  { match: "garla-brite", label: "Garla-Brite", url: "https://www.garlandco.com/products/coatings/built-up-roof/garla-brite" },
  { match: "garla brite", label: "Garla-Brite", url: "https://www.garlandco.com/products/coatings/built-up-roof/garla-brite" },
  { match: "silver-shield", label: "Silver-Shield", url: "https://www.garlandco.com/products/coatings/built-up-roof/silver-shield" },
  { match: "silver shield", label: "Silver-Shield", url: "https://www.garlandco.com/products/coatings/built-up-roof/silver-shield" },
  { match: "cpr", label: "CPR White Coating", url: "https://www.garlandco.com/products/coatings/metal/CPR-White-Coating" },
];

const mappedProductNumbers = [
  { match: "optimax fr mineral", number: "4702", source: "2026 Roll Goods" },
  { match: "optimax", number: "4701", source: "2026 Roll Goods" },
  { match: "stressply iv plus uv mineral", number: "4385-W", source: "2026 Roll Goods" },
  { match: "stressply iv plus mineral", number: "4384", source: "2026 Roll Goods" },
  { match: "stressply iv plus", number: "4383", source: "2026 Roll Goods" },
  { match: "stressply plus fr min sunburst", number: "4377-G-P-80", source: "2026 Roll Goods" },
  { match: "stressply plus fr mineral", number: "4377", source: "2026 Roll Goods" },
  { match: "stressply plus", number: "4376", source: "2026 Roll Goods" },
  { match: "stressply legacy", number: "4901", source: "2026 Roll Goods" },
  { match: "stressply euv fr mineral", number: "4358-W", source: "2026 Roll Goods" },
  { match: "stressply euv", number: "4357", source: "2026 Roll Goods" },
  { match: "stressply max fr mineral", number: "4951-W", source: "2026 Roll Goods" },
  { match: "stressply max", number: "4950", source: "2026 Roll Goods" },
  { match: "stressply sa fr mineral", number: "4125", source: "2026 Roll Goods" },
  { match: "stressply fr mineral", number: "4365", source: "2026 Roll Goods" },
  { match: "stressply", number: "4360", source: "2026 Roll Goods" },
  { match: "versiply mineral", number: "4369", source: "2026 Roll Goods" },
  { match: "versiply 80", number: "4364", source: "2026 Roll Goods" },
  { match: "kee-stone fb 60 25 ft", number: "9500-25", source: "2026 Roll Goods" },
  { match: "kee stone fb 60 25 ft", number: "9500-25", source: "2026 Roll Goods" },
  { match: "kee-stone fb 60 50 ft", number: "9500-50", source: "2026 Roll Goods" },
  { match: "kee stone fb 60 50 ft", number: "9500-50", source: "2026 Roll Goods" },
  { match: "kee-stone fb 60 gray", number: "9525", source: "2026 Roll Goods" },
  { match: "kee stone fb 60 gray", number: "9525", source: "2026 Roll Goods" },
  { match: "kee-stone fb 60", number: "9500", source: "2026 Roll Goods" },
  { match: "kee stone fb 60", number: "9500", source: "2026 Roll Goods" },
  { match: "kee-stone hp nf flashing", number: "9601-NF", source: "2026 Roll Goods" },
  { match: "kee stone hp nf flashing", number: "9601-NF", source: "2026 Roll Goods" },
  { match: "kee-stone hp 50 ft", number: "9600-50", source: "2026 Roll Goods" },
  { match: "kee stone hp 50 ft", number: "9600-50", source: "2026 Roll Goods" },
  { match: "kee-stone hp", number: "9600", source: "2026 Roll Goods" },
  { match: "kee stone hp", number: "9600", source: "2026 Roll Goods" },
  { match: "kee-stone legacy flashing", number: "9701-NF", source: "2026 Roll Goods" },
  { match: "kee stone legacy flashing", number: "9701-NF", source: "2026 Roll Goods" },
  { match: "kee-stone legacy 50 ft", number: "9700-50", source: "2026 Roll Goods" },
  { match: "kee stone legacy 50 ft", number: "9700-50", source: "2026 Roll Goods" },
  { match: "kee-stone legacy", number: "9700", source: "2026 Roll Goods" },
  { match: "kee stone legacy", number: "9700", source: "2026 Roll Goods" },
  { match: "kee-stone 24 detail roll", number: "9504-24", source: "2026 Roll Goods" },
  { match: "kee stone 24 detail roll", number: "9504-24", source: "2026 Roll Goods" },
  { match: "hpr torchbase", number: "4113-P", source: "2026 Roll Goods" },
  { match: "hpr torch base", number: "4113-P", source: "2026 Roll Goods" },
  { match: "ultra-shield torch base", number: "51-5411", source: "2026 WPG" },
  { match: "ultra shield torch base", number: "51-5411", source: "2026 WPG" },
  { match: "flexbase plus 80", number: "4144-80-P", source: "2026 Roll Goods" },
  { match: "flexbase e 80", number: "4145-80-P", source: "2026 Roll Goods" },
  { match: "flexbase 80", number: "4143-80-P", source: "2026 Roll Goods" },
  { match: "hpr premium glasbase", number: "4116", source: "2026 Roll Goods" },
  { match: "hpr glasbase", number: "4112", source: "2026 Roll Goods" },
  { match: "hpr glasfelt", number: "4122", source: "2026 Roll Goods" },
  { match: "hpr tri-base premium", number: "4121", source: "2026 Roll Goods" },
  { match: "hpr sa fr base sheet", number: "4114", source: "2026 Roll Goods" },
  { match: "stressbase 80 plus", number: "4411-80-PRM", source: "2026 Roll Goods" },
  { match: "stressbase 120", number: "4411-120", source: "2026 Roll Goods" },
  { match: "stressbase 80", number: "4411-80", source: "2026 WPG" },
  { match: "grip polyester firm 12", number: "4879-12", source: "2026 Roll Goods" },
  { match: "grip polyester firm", number: "4879", source: "2026 Roll Goods" },
  { match: "grip polyester soft 12", number: "4876-12", source: "2026 Roll Goods" },
  { match: "grip polyester soft 6", number: "4876-6", source: "2026 Roll Goods" },
  { match: "grip polyester soft 4", number: "4876-4", source: "2026 Roll Goods" },
  { match: "grip polyester soft", number: "4876", source: "2026 Roll Goods" },
  { match: "r-mer seal", number: "4133", source: "2026 Roll Goods" },
  { match: "r mer seal", number: "4133", source: "2026 Roll Goods" },
  { match: "green-lock plus membrane adhesive", number: "7305-5-S", source: "2026 Coatings" },
  { match: "green lock plus membrane adhesive", number: "7305-5-S", source: "2026 Coatings" },
  { match: "green-lock plus", number: "7305-5-S", source: "2026 Coatings" },
  { match: "green lock plus", number: "7305-5-S", source: "2026 Coatings" },
  { match: "hpr all-temp asphalt", number: "7340", source: "2026 Coatings" },
  { match: "hpr all temp asphalt", number: "7340", source: "2026 Coatings" },
  { match: "black-knight cold", number: "7343-5", source: "2026 Coatings" },
  { match: "black knight cold", number: "7343-5", source: "2026 Coatings" },
  { match: "black-knight mastic", number: "7824-5", source: "2026 Coatings" },
  { match: "black knight mastic", number: "7824-5", source: "2026 Coatings" },
  { match: "black-knight primer", number: "7616-5", source: "2026 Coatings" },
  { match: "black knight primer", number: "7616-5", source: "2026 Coatings" },
  { match: "garla-prime voc", number: "7619-55", source: "2026 Coatings" },
  { match: "garla prime voc", number: "7619-55", source: "2026 Coatings" },
  { match: "garla-prime", number: "7612-5", source: "2026 Coatings" },
  { match: "garla prime", number: "7612-5", source: "2026 Coatings" },
  { match: "cool-sil gray", number: "21145-G", source: "2026 Coatings" },
  { match: "cool sil gray", number: "21145-G", source: "2026 Coatings" },
  { match: "cool-sil white", number: "21155-G", source: "2026 Coatings" },
  { match: "cool sil white", number: "21155-G", source: "2026 Coatings" },
  { match: "cool-sil", number: "21155-G", source: "2026 Coatings" },
  { match: "cool sil", number: "21155-G", source: "2026 Coatings" },
  { match: "weatherking plus wc", number: "7339-5", source: "2026 Coatings" },
  { match: "weatherking", number: "7336-5", source: "2026 Coatings" },
  { match: "weatherscreen", number: "7342-5", source: "2026 Coatings" },
  { match: "pyramic plus lo base coat", number: "7476-5-U", source: "2026 Coatings" },
  { match: "pyramic plus lo", number: "7475-5-U", source: "2026 Coatings" },
  { match: "pyramic base coat", number: "7476-5-U", source: "2026 Coatings" },
  { match: "pyramic", number: "7475-5-U", source: "2026 Coatings" },
  { match: "stratamax gray", number: "7485-5-U", source: "2026 Coatings" },
  { match: "stratamax white", number: "7480-5-U", source: "2026 Coatings" },
  { match: "white-knight plus wc base coat", number: "7839-5-U", source: "2026 Coatings" },
  { match: "white knight plus wc base coat", number: "7839-5-U", source: "2026 Coatings" },
  { match: "white-knight plus base coat", number: "7837-5-U", source: "2026 Coatings" },
  { match: "white knight plus base coat", number: "7837-5-U", source: "2026 Coatings" },
  { match: "white-knight plus wc", number: "7838-5-U", source: "2026 Coatings" },
  { match: "white knight plus wc", number: "7838-5-U", source: "2026 Coatings" },
  { match: "white-knight wc", number: "7835", source: "2026 Coatings" },
  { match: "white knight wc", number: "7835", source: "2026 Coatings" },
  { match: "white-knight plus", number: "7828-5-U", source: "2026 Coatings" },
  { match: "white knight plus", number: "7828-5-U", source: "2026 Coatings" },
  { match: "all-sil black 20", number: "2144-20-BLK", source: "2026 Sealants" },
  { match: "all sil black 20", number: "2144-20-BLK", source: "2026 Sealants" },
  { match: "all-sil black", number: "2144-BLK", source: "2026 Sealants" },
  { match: "all sil black", number: "2144-BLK", source: "2026 Sealants" },
  { match: "all-sil clear", number: "2144", source: "2026 Sealants" },
  { match: "all sil clear", number: "2144", source: "2026 Sealants" },
  { match: "butyl sealing tape", number: "6341", source: "2026 Sealants" },
  { match: "cool-sil skylight sealer", number: "21070-G", source: "2026 Sealants" },
  { match: "cool sil skylight sealer", number: "21070-G", source: "2026 Sealants" },
  { match: "garla-flex", number: "9332-CR", source: "2026 Sealants" },
  { match: "garla flex", number: "9332-CR", source: "2026 Sealants" },
  { match: "gar-rock", number: "1650-5", source: "2026 Sealants" },
  { match: "gar rock", number: "1650-5", source: "2026 Sealants" },
  { match: "green-lock sealant xl", number: "2139-3", source: "2026 Sealants" },
  { match: "green lock sealant xl", number: "2139-3", source: "2026 Sealants" },
  { match: "kee-stone inside corner", number: "95-C-IC-1", source: "2026 Sealants" },
  { match: "kee stone inside corner", number: "95-C-IC-1", source: "2026 Sealants" },
  { match: "kee-stone outside corner", number: "95-C-OC-1", source: "2026 Sealants" },
  { match: "kee stone outside corner", number: "95-C-OC-1", source: "2026 Sealants" },
].sort((a, b) => b.match.length - a.match.length);

const productNumberDetails = {
  "4701": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 635, coopPrice: 628.65 },
  "4702": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 663, coopPrice: 656.37 },
  "4360": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 356, coopPrice: 352.44 },
  "4365": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 367, coopPrice: 363.33 },
  "4376": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 349, coopPrice: 345.51 },
  "4377": { coverage: "75 sq. ft./roll", perPallet: "30", size: "26' 2\" x 3' 3\"", seriesPrice: 327, coopPrice: 323.73 },
  "4377-G-P-80": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 408, coopPrice: 403.92 },
  "4383": { coverage: "75 sq. ft./roll", perPallet: "20", size: "26' 2\" x 3' 3\"", seriesPrice: 429, coopPrice: 424.71 },
  "4384": { coverage: "75 sq. ft./roll", perPallet: "20", size: "26' 2\" x 3' 3\"", seriesPrice: 453, coopPrice: 448.47 },
  "4385-W": { coverage: "75 sq. ft./roll", perPallet: "20", size: "26' 2\" x 3' 3\"", seriesPrice: 506, coopPrice: 500.94 },
  "4901": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 456, coopPrice: 451.44 },
  "4902-S": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 503, coopPrice: 497.97 },
  "4902": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 481, coopPrice: 476.19 },
  "4357": { coverage: "100 sq. ft./roll", perPallet: "20", size: "34' 8\" x 3' 3\"", seriesPrice: 488, coopPrice: 483.12 },
  "4358-W": { coverage: "75 sq. ft./roll", perPallet: "25", size: "26' 2\" x 3' 3\"", seriesPrice: 560, coopPrice: 554.40 },
  "4950": { coverage: "100 sq. ft./roll", perPallet: "20", size: "34' 8\" x 3' 3\"", seriesPrice: 563, coopPrice: 557.37 },
  "4951-W": { coverage: "75 sq. ft./roll", perPallet: "20", size: "26' 2\" x 3' 3\"", seriesPrice: 613, coopPrice: 606.87 },
  "4125": { coverage: "100 sq. ft./roll", perPallet: "20", size: "34' 8\" x 3' 3\"", seriesPrice: 448, coopPrice: 443.52 },
  "4364": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 319, coopPrice: 315.81 },
  "4369": { coverage: "75 sq. ft./roll", perPallet: "30", size: "26' 2\" x 3' 3\"", seriesPrice: 297, coopPrice: 294.03 },
  "9504-24": { coverage: "150 sq. ft./roll", perPallet: "40", size: "24\" x 100'", seriesPrice: 1779, coopPrice: 1761.21 },
  "9904-24": { coverage: "150 sq. ft./roll", perPallet: "40", size: "24\" x 100'", seriesPrice: 1894, coopPrice: 1875.06 },
  "9500-25": { coverage: "200 sq. ft./roll", perPallet: "15", size: "8' x 25'", seriesPrice: 1734, coopPrice: 1716.66 },
  "9500": { coverage: "800 sq. ft./roll", perPallet: "6", size: "8' x 100'", seriesPrice: 6932, coopPrice: 6862.68 },
  "9525": { coverage: "800 sq. ft./roll", perPallet: "6", size: "8' x 100'", seriesPrice: 7265, coopPrice: 7192.35 },
  "9525-50": { coverage: "400 sq. ft./roll", perPallet: "6", size: "8' x 50'", seriesPrice: 3634, coopPrice: 3597.66 },
  "9500-50": { coverage: "400 sq. ft./roll", perPallet: "10", size: "8' x 50'", seriesPrice: 3470, coopPrice: 3435.30 },
  "9501-NF": { coverage: "75 sq. ft./roll", perPallet: "10", size: "24\" x 50'", seriesPrice: 1813, coopPrice: 1794.87 },
  "9901-NF": { coverage: "75 sq. ft./roll", perPallet: "10", size: "24\" x 50'", seriesPrice: 2351, coopPrice: 2327.49 },
  "9504-R": { coverage: "Utility roll", perPallet: "96", size: "Verify", seriesPrice: 466, coopPrice: 461.34 },
  "9904-R": { coverage: "Utility roll", perPallet: "96", size: "Verify", seriesPrice: 567, coopPrice: 561.33 },
  "9600": { coverage: "800 sq. ft./roll", perPallet: "6", size: "8' x 100'", seriesPrice: 8736, coopPrice: 8648.64 },
  "9600-50": { coverage: "400 sq. ft./roll", perPallet: "10", size: "8' x 50'", seriesPrice: 4368, coopPrice: 4324.32 },
  "9601-NF": { coverage: "75 sq. ft./roll", perPallet: "10", size: "24\" x 50'", seriesPrice: 3042, coopPrice: 3011.58 },
  "9700": { coverage: "800 sq. ft./roll", perPallet: "6", size: "8' x 100'", seriesPrice: 7832, coopPrice: 7753.68 },
  "9700-50": { coverage: "400 sq. ft./roll", perPallet: "10", size: "8' x 50'", seriesPrice: 3916, coopPrice: 3876.84 },
  "9701-NF": { coverage: "75 sq. ft./roll", perPallet: "10", size: "24\" x 50'", seriesPrice: 2444, coopPrice: 2419.56 },
  "4113-P": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 346, coopPrice: 342.54 },
  "4143-80-P": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 284, coopPrice: 281.16 },
  "4145-80-P": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 395, coopPrice: 391.05 },
  "4144-80-P": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 297, coopPrice: 294.03 },
  "4112": { coverage: "300 sq. ft./roll", perPallet: "20", size: "108' x 3'", seriesPrice: 197, coopPrice: 195.03 },
  "4116": { coverage: "200 sq. ft./roll", perPallet: "25", size: "72' x 3'", seriesPrice: 206, coopPrice: 203.94 },
  "4122": { coverage: "500 sq. ft./roll", perPallet: "20", size: "180' x 3'", seriesPrice: 201, coopPrice: 198.99 },
  "4121": { coverage: "200 sq. ft./roll", perPallet: "25", size: "68' 7\" x 3' 3\"", seriesPrice: 368, coopPrice: 364.32 },
  "4114": { coverage: "150 sq. ft./roll", perPallet: "20", size: "51' x 3' 3\"", seriesPrice: 387, coopPrice: 383.13 },
  "4411-120": { coverage: "100 sq. ft./roll", perPallet: "25", size: "34' 8\" x 3' 3\"", seriesPrice: 279, coopPrice: 276.21 },
  "4411-80-PRM": { coverage: "150 sq. ft./roll", perPallet: "24", size: "51' 4\" x 3' 3\"", seriesPrice: 334, coopPrice: 330.66 },
  "4411-80": { coverage: "150 sq. ft./roll", perPallet: "25", size: "51' 4\" x 3' 3\"", seriesPrice: 229.46, coopPrice: 229.46 },
  "51-5411": { coverage: "100 sq. ft./roll", perPallet: "Verify", size: "34' 8\" x 3' 3\"", seriesPrice: 206.96, coopPrice: 206.96 },
  "4879": { coverage: "1,000 sq. ft./roll", perPallet: "25", size: "324' x 3' 4\"" },
  "4876": { coverage: "1,000 sq. ft./roll", perPallet: "25", size: "324' x 3' 4\"" },
  "7343-5": { coverage: "FC 4-5 gal./sq.; RST 6-8 gal./sq.", perPallet: "36", size: "5 gal. pail", application: "Cold-applied coal tar adhesive", seriesPrice: 337, coopPrice: 333.63 },
  "7824-5": { coverage: "5-6 gal./100 sq. ft.; flashing approx. 7 LF/gal. at 8 in. x 1/4 in.", perPallet: "36", size: "5 gal. pail", application: "Trowel-grade flashing mastic", wetMil: "Thickness-based; typical 1/4 in. when specified", seriesPrice: 292, coopPrice: 289.08 },
  "7616-5": { coverage: "0.5 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Asphalt/coal tar primer", seriesPrice: 215, coopPrice: 212.85 },
  "7612-5": { coverage: "0.5 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Asphaltic primer", seriesPrice: 177, coopPrice: 175.23 },
  "7612-55": { coverage: "0.5 gal./100 sq. ft.", perPallet: "4", size: "55 gal. drum", application: "Asphaltic primer", seriesPrice: 1839, coopPrice: 1820.61 },
  "7619-5": { coverage: "0.50-1.0 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Low-VOC asphaltic primer", seriesPrice: 181, coopPrice: 179.19 },
  "7619-55": { coverage: "0.50-1.0 gal./100 sq. ft.", perPallet: "4", size: "55 gal. drum", application: "Low-VOC asphaltic primer", seriesPrice: 1766, coopPrice: 1748.34 },
  "21110-G": { coverage: "1 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Cool-Sil bleed blocker primer", seriesPrice: 532, coopPrice: 526.68 },
  "21100-G": { coverage: "Reference Technical Data Sheet", perPallet: "36", size: "5 gal. pail", application: "Cool-Sil Eliminator", seriesPrice: 539, coopPrice: 533.61 },
  "21105-G": { coverage: "Reference Technical Data Sheet", perPallet: "4", size: "50 gal. drum", application: "Cool-Sil Eliminator", seriesPrice: 5377, coopPrice: 5323.23 },
  "21030-G": { coverage: "1/3 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Cool-Sil single-ply primer", seriesPrice: 1038, coopPrice: 1027.62 },
  "21155-G": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "Cool-Sil spray white", seriesPrice: 887, coopPrice: 878.13, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "21145-G": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "Cool-Sil spray gray", seriesPrice: 887, coopPrice: 878.13, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "21055-G": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "Cool-Sil spray white", seriesPrice: 9732, coopPrice: 9634.68 },
  "21055-G-GRY": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "Cool-Sil spray gray", seriesPrice: 9732, coopPrice: 9634.68 },
  "21070-G": { coverage: "Localized detail use: 1.5-2.0 gal./sq.", perPallet: "Verify", size: "5 gal. pail", application: "Cool-Sil Skylight Sealer", seriesPrice: 1396, coopPrice: 1382.04 },
  "7828-5-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "White-Knight Plus white", seriesPrice: 1010, coopPrice: 999.90, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7828-55-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "White-Knight Plus white", seriesPrice: 10990, coopPrice: 10880.10 },
  "7837-5-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "White-Knight Plus base coat", seriesPrice: 1010, coopPrice: 999.90, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7837-55-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "White-Knight Plus base coat", seriesPrice: 10990, coopPrice: 10880.10 },
  "7838-5-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "White-Knight Plus WC", seriesPrice: 1079, coopPrice: 1068.21, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7838-55-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "White-Knight Plus WC", seriesPrice: 11722, coopPrice: 11604.78 },
  "7839-5-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "White-Knight Plus WC base coat", seriesPrice: 1078, coopPrice: 1067.22, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7839-55-U": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "4", size: "55 gal. drum", application: "White-Knight Plus WC base coat", seriesPrice: 11709, coopPrice: 11591.91 },
  "7835": { coverage: "Reference Application Guide; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "Verify", size: "Verify", application: "White-Knight WC" },
  "7336-5": { coverage: "IP 2-2.5 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Cold-process adhesive", seriesPrice: 169, coopPrice: 167.31 },
  "7339-5": { coverage: "IP 2-2.5 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Cold-process adhesive", seriesPrice: 169, coopPrice: 167.31 },
  "7342-5": { coverage: "Reference Data Sheet", perPallet: "36", size: "5 gal. pail", application: "Protective coating", seriesPrice: 177, coopPrice: 175.23 },
  "7476-5-U": { coverage: "Reference Data Sheet; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "Pyramic Plus LO base coat", seriesPrice: 535, coopPrice: 529.65, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7475-5-U": { coverage: "Reference Data Sheet; system rates typically 1.5-2.0 gal./sq. per coat", perPallet: "36", size: "5 gal. pail", application: "Pyramic Plus LO", seriesPrice: 535, coopPrice: 529.65, wetMil: "Typical equivalent: 24-32 wet mils/coat before solids adjustment" },
  "7480-5-U": { coverage: "Reference Data Sheet; total system typically 2.0-3.5 gal./sq.", perPallet: "36", size: "5 gal. pail", application: "StrataMax White", seriesPrice: 586, coopPrice: 580.14, wetMil: "Typical equivalent: 32-56 wet mils total before solids adjustment" },
  "7485-5-U": { coverage: "Reference Data Sheet; total system typically 2.0-3.5 gal./sq.", perPallet: "36", size: "5 gal. pail", application: "StrataMax Gray", seriesPrice: 586, coopPrice: 580.14, wetMil: "Typical equivalent: 32-56 wet mils total before solids adjustment" },
  "7411-5": { coverage: "0.5-0.75 gal./100 sq. ft. two coats", perPallet: "36", size: "5 gal. pail", application: "Garla-Brite aluminum roof coating", seriesPrice: 336, coopPrice: 332.64 },
  "7421-5": { coverage: "2 gal./100 sq. ft.", perPallet: "36", size: "5 gal. pail", application: "Silver Shield aluminum asphalt roof coating", seriesPrice: 397, coopPrice: 393.03 },
  "9332-CR": { coverage: "Thickness dependent; typical 1/16-1/8 in.; approx. 1 gal. per 100-200 LF depending on joint width", perPallet: "Verify", size: "Cartridge", application: "Asphalt mastic/sealant", seriesPrice: 13, coopPrice: 12.87, wetMil: "Thickness-based; typical 1/16-1/8 in. application" },
  "2139-3": { coverage: "Approx. 20-30 LF per tube at 1/4 in. bead", perPallet: "Verify", size: "Tube", application: "Tube sealant" },
  "7305-5-S": { coverage: "IP 2-2.5 gal./sq.; FC 4-5 gal./sq.", perPallet: "36", size: "5 gal. pail", seriesPrice: 542, coopPrice: 536.58 },
  "7340": { coverage: "IP 25 lb./sq.; FC 60 lb./sq.", perPallet: "18", size: "100 lb. keg", seriesPrice: 200, coopPrice: 198.00 },
};

mappedProductNumbers.forEach((item) => Object.assign(item, productNumberDetails[item.number] || {}));

const productChoiceVariants = {
  optimax: ["OptiMax", "OptiMax FR Mineral"],
  stressply: ["StressPly", "StressPly FR Mineral"],
  "stressply plus": ["StressPly Plus", "StressPly Plus FR Mineral", "StressPly Plus FR Min Sunburst"],
  "stressply iv plus": ["StressPly IV Plus", "StressPly IV Plus Mineral", "StressPly IV Plus UV Mineral"],
  "stressply legacy": ["StressPly Legacy"],
  "stressply euv": ["StressPly EUV", "StressPly EUV FR Mineral"],
  "stressply max": ["StressPly Max", "StressPly Max FR Mineral"],
  "stressply sa": ["StressPly SA FR Mineral"],
  versiply: ["VersiPly 80", "VersiPly Mineral"],
  "kee stone fb 60": ["KEE-Stone FB 60 25 ft", "KEE-Stone FB 60", "KEE-Stone FB 60 50 ft", "KEE-Stone FB 60 Gray"],
  "kee stone hp": ["KEE-Stone HP", "KEE-Stone HP 50 ft"],
  "green lock plus": ["Green-Lock Plus Membrane Adhesive"],
  "hot asphalt": ["Generic Hot Asphalt", "HPR All-Temp Asphalt"],
};

const standardCoverageSpecLanguage = [
  "Apply all materials in strict accordance with manufacturer published technical data sheets. Coverage rates shall be as follows unless otherwise required by substrate conditions:",
  "- Primers: 0.5-1.0 gal./sq.",
  "- Adhesives: 1.5-2.0 gal./sq.",
  "- Coating systems: 3.0-4.0 gal./sq. total",
  "- Mastics: 2-3 gal./sq. or thickness-based application",
  "- Flood coats (coal tar): 4.0-8.0 gal./sq. depending on condition",
  "- Garland intentionally varies coverage based on substrate absorption; confirm final rates with current technical data and Garland representative when required.",
].join("\n");

const localStorageLargeFileLimit = 1500000;
const systemBuilderCatalog = {
  Restoration: {
    warrantyTypes: ["Garland Limited Restoration Warranty"],
    materials: [
      {
        name: "Gravel",
        systems: [
          { product: "Black-Knight Cold", terms: [10], primer: "Black-Knight Primer", description: "6.0-8.0 gal./sq. Black-Knight Cold with gravel" },
          { product: "WeatherScreen", terms: [10], primer: "Garla-Prime", description: "6.0-8.0 gal./sq. plus gravel" },
          { product: "Cool-Sil Gravel-Surfaced Roof Restoration", terms: [15], primer: "Garla-Block 2K", description: "Cool-Sil Eliminator 8.0 gal./sq.; Cool-Sil 2.0 gal./sq." },
        ],
      },
      {
        name: "Granule Modified Bitumen",
        systems: [
          { product: "White-Knight Plus - Partially Reinforced", terms: [10], primer: "Garla-Block", description: "Membrane laps with Unibond or 3-course; field 4.0 gal./sq." },
          { product: "Cool-Sil - Partially Reinforced", terms: [10], primer: "Cool-Sil Bleed Block Primer", description: "Membrane laps with Unibond or 3-course; field 4.0 gal./sq." },
          { product: "White-Knight Plus - Fully Reinforced", terms: [15], primer: "Garla-Block", description: "4.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
          { product: "LiquiTec - Partially Reinforced", terms: [15], primer: "Garla-Block", description: "Membrane laps with Unibond or 3-course; field 4.0 gal./sq." },
          { product: "LiquiTec - Fully Reinforced", terms: [20], primer: "Garla-Block", description: "4.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
        ],
      },
      {
        name: "Smooth Modified Bitumen",
        systems: [
          { product: "White-Knight Plus - Partially Reinforced", terms: [10], primer: "Garla-Block", description: "Membrane laps with Unibond or 3-course; field 3.5 gal./sq." },
          { product: "Cool-Sil - Partially Reinforced", terms: [10], primer: "Cool-Sil Bleed Block Primer", description: "Membrane laps with Unibond or 3-course; field 3.5 gal./sq." },
          { product: "White-Knight Plus - Fully Reinforced", terms: [15], primer: "Garla-Block", description: "3.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
          { product: "LiquiTec - Partially Reinforced", terms: [15], primer: "Garla-Block", description: "Membrane laps with Unibond or 3-course; field 3.5 gal./sq." },
          { product: "LiquiTec - Fully Reinforced", terms: [20], primer: "Garla-Block", description: "3.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
        ],
      },
      {
        name: "Single Ply",
        systems: [
          { product: "White-Knight Plus - Not Fabric Reinforced", terms: [10], primer: "Not required", description: "Membrane seams 2.0 gal./sq.; field 2.5 gal./sq." },
          { product: "LiquiTec - Not Fabric Reinforced", terms: [10], primer: "Not required", description: "Membrane seams 2.0 gal./sq.; field 2.5 gal./sq." },
          { product: "Cool-Sil - Not Fabric Reinforced", terms: [10], primer: "Cool-Sil Single Ply Primer", description: "Membrane seams 2.0 gal./sq.; field 2.5 gal./sq." },
          { product: "White-Knight Plus - Partially Reinforced", terms: [10], primer: "Not required", description: "Membrane laps with Unibond or 3-course; field 2.5 gal./sq." },
          { product: "Cool-Sil - Partially Reinforced", terms: [10], primer: "Cool-Sil Single Ply Primer", description: "Membrane laps with Unibond or 3-course; field 2.5 gal./sq." },
          { product: "White-Knight Plus - Fully Reinforced", terms: [15], primer: "Not required", description: "3.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
          { product: "LiquiTec - Partially Reinforced", terms: [15], primer: "Not required", description: "Membrane laps with Unibond or 3-course; field 2.5 gal./sq." },
          { product: "LiquiTec - Fully Reinforced", terms: [20], primer: "Not required", description: "3.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat" },
        ],
      },
      {
        name: "Metal",
        systems: [
          { product: "Revitalizer Metal - Fully Reinforced", terms: [10], primer: "Metal Roof Primer, spot primed on rust", description: "5.0 gal./sq. full fabric and reflective coating" },
          { product: "CPR", terms: [10], primer: "Not required", description: "Side laps CPR Seam Sealer; end laps UniBond or 3-course CPR; field 3.0 gal./sq." },
          { product: "Cool-Sil over Metal", terms: [10], primer: "Metal Roof Primer", description: "Side laps 1.5 gal./sq.; end laps UniBond or 3-course; field 2.5 gal./sq." },
          { product: "LiquiTec over Metal", terms: [10], primer: "Metal Roof Primer", description: "Side laps 1.5 gal./sq.; end laps UniBond or 3-course; field 2.5 gal./sq." },
        ],
      },
    ],
  },
  Recover: {
    warrantyTypes: ["Garland Standard Warranty"],
    materials: [
      {
        name: "Recover / Retrofit over Existing Roof",
        systems: [
          {
            product: "New Garland Roof System over Existing Roof",
            terms: [15, 20, 25, 30],
            capSheets: ["Optimax", "StressPly Legacy", "StressPly EUV", "StressPly Max", "StressPly", "StressPly Plus", "StressPly IV Plus", "KEE-Stone FB 60", "KEE-Stone HP"],
            capAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt", "Torch Applied where applicable"],
            baseSheets: ["StressBase 80", "FlexBase 80", "StressBase 80 Plus", "FlexBase E 80", "FlexBase Plus 80", "HPR Torchbase", "Ultra-Shield Torchbase"],
            baseAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt"],
            surfacing: ["Cool-Sil", "Pyramic", "Pyramic Plus LO", "StrataMax", "Garla-Brite", "Silver-Shield", "Flood & Gravel", "Mineral Surface", "No surfacing"],
            description: "Requires structural evaluation and infrared scan per warranty chart.",
          },
        ],
      },
    ],
  },
  "New Roof/Reroof": {
    warrantyTypes: ["Garland Standard Warranty", "Garland System NDL", "Garland Premium NDL"],
    materials: [
      {
        name: "Low Slope Modified Bitumen",
        systems: [
          {
            product: "Optimax / FlexBase Premium Assembly",
            terms: [20, 25, 30, 35, 40],
            capSheets: ["Optimax"],
            capAdhesives: ["Green-Lock Plus", "Weatherking", "Garlastic KM Plus"],
            baseSheets: ["FlexBase E 80", "FlexBase Plus E 80"],
            baseAdhesives: ["Green-Lock Plus", "Weatherking", "Garlastic KM Plus"],
            surfacing: ["Pyramic", "Pyramic Plus LO", "StrataMax", "Garla-Brite", "Silver-Shield", "Flood & Gravel"],
          },
          {
            product: "StressPly Premium Assembly",
            terms: [20, 25, 30, 35],
            capSheets: ["StressPly Legacy", "StressPly EUV", "StressPly Max"],
            capAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Garlastic KM Plus"],
            baseSheets: ["FlexBase E 80", "FlexBase Plus 80"],
            baseAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Garlastic KM Plus"],
            surfacing: ["Cool-Sil", "Pyramic", "Pyramic Plus LO", "StrataMax", "Garla-Brite", "Silver-Shield", "Flood & Gravel"],
          },
          {
            product: "StressPly Standard/System NDL Assembly",
            terms: [20, 25, 30],
            capSheets: ["Optimax", "StressPly Legacy", "StressPly EUV", "StressPly Max", "StressPly", "StressPly Plus", "StressPly IV Plus"],
            capAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt", "Torch Applied where applicable"],
            baseSheets: ["StressBase 80", "FlexBase 80", "StressBase 80 Plus", "HPR Glasfelt", "HPR Premium Glasbase", "HPR Tri-Base Premium", "HPR Torchbase", "Ultra-Shield Torchbase", "SA Base IV"],
            baseAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt"],
            surfacing: ["Cool-Sil", "Pyramic", "Pyramic Plus LO", "StrataMax", "Garla-Brite", "Silver-Shield", "Flood & Gravel", "Mineral Surface"],
          },
          {
            product: "Self-Adhering / VersiPly Assembly",
            terms: [20, 25],
            capSheets: ["StressPly SA", "VersiPly"],
            capAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt"],
            baseSheets: ["StressBase 80", "FlexBase 80", "StressBase 80 Plus", "HPR Glasfelt", "HPR Premium Glasbase", "HPR Tri-Base Premium", "HPR SA FR Base Sheet"],
            baseAdhesives: ["Green-Lock Plus", "Weatherking", "Weatherking Plus WC", "Hot Asphalt"],
            surfacing: ["Cool-Sil", "Pyramic", "Pyramic Plus LO", "StrataMax", "Garla-Brite", "Silver-Shield", "Flood & Gravel", "Mineral Surface"],
          },
        ],
      },
      {
        name: "KEE Hybrid",
        systems: [
          {
            product: "KEE-Stone HP Premium Assembly",
            terms: [20, 25, 30, 35, 40],
            capSheets: ["KEE-Stone HP"],
            capAdhesives: ["KEE-Lock Foam", "KEE-Lock Spatter Spray"],
            baseSheets: ["FlexBase E 80", "FlexBase Plus 80", "HPR Torchbase"],
            baseAdhesives: ["Green-Lock Plus", "Torch Applied for HPR Torchbase"],
            surfacing: ["No surfacing"],
          },
          {
            product: "KEE-Stone FB 60 / HP Standard Assembly",
            terms: [20, 25, 30],
            capSheets: ["KEE-Stone FB 60", "KEE-Stone HP"],
            capAdhesives: ["KEE-Lock Foam", "KEE-Lock Spatter Spray", "Hot Asphalt"],
            baseSheets: ["FlexBase 80", "FlexBase E 80", "FlexBase Plus 80", "StressBase 80", "StressBase 80 Plus", "HPR Torchbase", "Ultra-Shield Torchbase"],
            baseAdhesives: ["Green-Lock Plus", "Hot Asphalt"],
            surfacing: ["No surfacing"],
          },
        ],
      },
      {
        name: "BUR with Gravel Surface",
        systems: [
          {
            product: "BUR with Gravel Surface",
            terms: [15, 20, 25, 30],
            capSheets: ["Garland Plies"],
            capAdhesives: ["Garland Adhesive"],
            baseSheets: ["Garland Plies"],
            baseAdhesives: ["Garland Adhesive"],
            surfacing: ["Black-Knight Cold Flood Coat", "Black-Stallion Cold Flood Coat", "WeatherScreen Flood Coat", "Garlastic KM Plus Flood Coat"],
          },
        ],
      },
      {
        name: "Metal Systems",
        systems: [
          {
            product: "Garland Select 40-year NDL R-Mer Shield",
            terms: [40],
            capSheets: ["R-Mer Shield"],
            capAdhesives: ["Mechanically seamed metal panel"],
            baseSheets: ["R-Mer Seal"],
            baseAdhesives: ["Self-Adhered"],
            surfacing: ["30-year limited fluorocarbon paint finish"],
            description: "Panel: R-Mer Shield; underlayment: R-Mer Seal; shop drawings required; seamer rental required; 2:12 minimum slope.",
          },
          {
            product: "Garland Preferred 30-year NDL R-Mer Shield",
            terms: [30],
            capSheets: ["R-Mer Shield"],
            capAdhesives: ["Mechanically seamed metal panel"],
            baseSheets: ["R-Mer Seal", "Non-Garland Underlayment", "Open framing"],
            baseAdhesives: ["Self-Adhered", "Mechanical fastening / open framing"],
            surfacing: ["30-year limited fluorocarbon paint finish"],
            description: "Panel: R-Mer Shield; R-Mer Seal, non-Garland underlayment, or open framing; shop drawings required; seamer rental required; 1/4:12 minimum slope.",
          },
          {
            product: "30-year Limited R-Mer Loc",
            terms: [30],
            capSheets: ["R-Mer Loc"],
            capAdhesives: ["Mechanically seamed metal panel"],
            baseSheets: ["R-Mer Seal", "Non-Garland Underlayment", "Open framing"],
            baseAdhesives: ["Self-Adhered", "Mechanical fastening / open framing"],
            surfacing: ["30-year limited fluorocarbon paint finish"],
            description: "Panel: R-Mer Loc; R-Mer Seal, non-Garland underlayment, or open framing; shop drawings required; seamer rental required; 3:12 minimum slope.",
          },
          {
            product: "20-year Limited R-Mer Loc",
            terms: [20],
            capSheets: ["R-Mer Loc"],
            capAdhesives: ["Mechanically seamed metal panel"],
            baseSheets: ["R-Mer Seal", "Non-Garland Underlayment"],
            baseAdhesives: ["Self-Adhered", "Mechanical fastening"],
            surfacing: ["30-year limited fluorocarbon paint finish"],
            description: "Panel: R-Mer Loc; R-Mer Seal or non-Garland underlayment; shop drawings required; seamer rental required; 1-1/2:12 to 3:12 slope.",
          },
          {
            product: "10-year Limited R-Mer Wall-Pan",
            terms: [10],
            capSheets: ["R-Mer Wall-Pan"],
            capAdhesives: ["Fastened wall panel"],
            baseSheets: ["R-Mer Seal", "Intelliwrap Underlayment"],
            baseAdhesives: ["Self-Adhered", "Mechanical fastening"],
            surfacing: ["30-year limited fluorocarbon paint finish"],
            description: "Panel: R-Mer Wall-Pan; R-Mer Seal or Intelliwrap underlayment; shop drawings not required per chart; seamer rental required; slope not applicable.",
          },
        ],
      },
    ],
  },
};
const stateAbbreviations = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];
const roofSlopeSourceOptions = ["Deck", "Insulation", "Lightweight concrete", "Tapered insulation", "Structural framing", "Existing roof system", "Other"];
const roofSlopeOptions = ["Flat/unknown", "Positive drainage", "1/16:12", "1/8:12", "1/4:12", "1/2:12", "1:12", "2:12", "3:12+", "Other"];
const projectChecklistItems = [
  { id: "coreSample", number: "1", label: "Core sample conducted", type: "checkbox", photo: true, description: true },
  { id: "slopeSource", number: "2", label: "Identified source of slope", type: "select", options: roofSlopeSourceOptions },
  { id: "recordedSlope", number: "3", label: "Recorded slope", type: "select", options: roofSlopeOptions },
  { id: "underDeckVerified", number: "4", label: "Verified under the deck if possible to ensure no fire or conduit lines are present", type: "checkbox" },
  { id: "deckReplacement", number: "5", label: "If metal, gypsum, tectum or wood deck, do we anticipate any deck replacement?", type: "yesno", photo: true },
  { id: "woodFasciaReplacement", number: "6", label: "Do we anticipate any wood fascia replacement?", type: "yesno" },
  { id: "parapetWall", number: "7", label: "Parapet wall height? Is it continuous? If so, is it over 36 inches?", type: "parapet" },
  { id: "curbHeight", number: "8", label: "Curb height", type: "number", suffix: "inches" },
  { id: "conduitLines", number: "9", label: "Conduit/Chiller lines present? What is the height at the lowest point?", type: "yesnoNumber", suffix: "inches" },
  { id: "copingWidth", number: "10", label: "Coping cap/parapet wall width", type: "number", suffix: "inches" },
  { id: "dripEdgeWidth", number: "11", label: "Drip edge or fascia face width", type: "number", suffix: "inches" },
  { id: "primaryDrains", number: "12", label: "Number of Primary Drains? Diameter?", type: "countDiameter" },
  { id: "primaryScuppers", number: "13", label: "Number of Primary Scuppers? Width and height?", type: "countWidthHeight" },
  { id: "overflowDrains", number: "14", label: "Number of overflow drains? Diameter?", type: "countDiameter" },
  { id: "thruWallScuppers", number: "15", label: "Number of thru wall scuppers? Width and diameter?", type: "countWidthDiameter" },
  { id: "surfaceCounterFlashing", number: "16", label: "Surface mounted counter flashing present?", type: "yesno", photo: true },
  { id: "thruWallCounterFlashing", number: "17", label: "Thru wall counter flashing present?", type: "yesno", photo: true },
  { id: "curbsRaised", number: "18", label: "If increased slope is required, will any curbs need to be raised?", type: "yesno" },
  { id: "vacantCurbs", number: "19", label: "Vacant curbs present? If so, are we removing?", type: "yesno", photo: true },
  { id: "expansionJoint", number: "20", label: "Is an expansion joint present?", type: "yesno", photo: true },
  { id: "internalGutters", number: "21", label: "Internal gutters present?", type: "yesno", photo: true },
  { id: "saltChemicalDistance", number: "22", label: "How close is the building to salt water or chemicals in the air?", type: "number", suffix: "miles" },
  { id: "drainageCalculations", number: "23", label: "Drainage Calculations", type: "yesno", photo: true },
  { id: "windUpliftCalculations", number: "24", label: "Wind Uplift calculations", type: "yesno", photo: true },
  { id: "pullTestNeeded", number: "25", label: "Pull test needed for deck or LWC?", type: "yesno", photo: true },
  { id: "moistureScanNeeded", number: "26", label: "Moisture scan needed?", type: "yesno", photo: true },
  { id: "extraWeight", number: "27", label: "Extra weight concerns?", type: "yesno", photo: true },
  { id: "freshAirIntakes", number: "28", label: "Fresh air intakes on the roof or close by?", type: "yesno", photo: true },
  { id: "skyviewEagleview", number: "29", label: "Do you have a SkyView or EagleView?", type: "yesno", photo: true },
  { id: "odorConcerns", number: "30", label: "Odor concerns?", type: "yesno" },
  { id: "noiseConcerns", number: "31", label: "Noise concerns?", type: "yesno" },
  { id: "openFlameConcerns", number: "32", label: "Open flame concerns?", type: "yesno" },
  { id: "woodColdFlashings", number: "33", label: "Do we believe wood is present on the project? Should you set the flashings in cold?", type: "doubleYesNo", labels: ["Wood present", "Set flashings in cold"] },
  { id: "dbsInsurance", number: "34", label: "If DBS, did you ensure all contractors have the proper insurance coverage?", type: "yesno" },
  { id: "factoryMutual", number: "43", label: "Is the client Factory Mutual Insured?", type: "yesno" },
  { id: "safetyRequirements", number: "44", label: "Does the client have any special safety requirements?", type: "yesnoDescription" },
  { id: "timeRestrictions", number: "45", label: "Does the client have any time restrictions for work?", type: "yesnoDescription" },
  { id: "completionDeadline", number: "46", label: "Is there a completion deadline we must hit?", type: "yesnoDate" },
  { id: "liquidatedDamages", number: "47", label: "Are there liquidated damages? If so, how much per day/week/month?", type: "yesnoDescription" },
  { id: "interiorProtection", number: "48", label: "Is interior protection needed on any portion of your project? Did you ask the client or just assume?", type: "yesnoDescription" },
  { id: "approvalNumber", number: "49", label: "What is your Florida Product Approval/NOA/FM Assembly Number?", type: "yesnoDescription" },
  { id: "classAFireRating", number: "50", label: "What is your Class A Fire Rating approval number?", type: "yesnoDescription" },
  { id: "publicOrDbs", number: "51", label: "Is your project going out public or through DBS?", type: "yesnoDescription" },
  { id: "architect", number: "52", label: "Is there an architect on the project?", type: "yesnoDescription" },
  { id: "threeCourseSeams", number: "54", label: "Did you remember to call out in your specification to three-course the vertical flashing seams?", type: "yesnoDescription" },
  { id: "componentCompatibility", number: "55", label: "Did you ensure all of your components are compatible?", type: "yesno" },
  { id: "lightningProtection", number: "56", label: "Do you need to include lighting protection installation?", type: "yesno" },
  { id: "specSections", number: "57", label: "Did you include sections 01100, 00720, 072200, 076200, and 061000?", type: "sectionChecks" },
  { id: "plansNeeded", number: "58", label: "Do you need plans for this project?", type: "yesno" },
  { id: "biddersRequired", number: "59", label: "How many bidders are required per your client?", type: "number" },
  { id: "minorityParticipation", number: "60", label: "Did you need any minority participation?", type: "yesno" },
  { id: "clientContractors", number: "61", label: "Does your client have any contractors they currently work with that they would like included? If yes, have you vetted them and had them fill out proper paperwork/insurance requirements?", type: "yesnoDescription" },
  { id: "projectCenterUpload", number: "62", label: "Have you uploaded everything into Project Center and included all applicable parties?", type: "projectCenterCosts" },
  { id: "warrantyRequirements", number: "63", label: "Did you ensure your specified system meets the new Garland Warranty Requirements?", type: "yesno" },
];
const sheetActivityImportKey = "garlandSheetActivitiesImportedV2";

const state = {
  view: "today",
  search: "",
  filters: {
    rank: "All rankings",
    entity: "All entities",
    county: "All counties",
    projectStage: "All project stages",
    projectRank: "All project rankings",
    proposalStage: "All proposal stages",
    contractor: "All contractors",
    contractorSort: "name",
    accountActivity: "All activity",
    projectContractor: "All contractors",
    proposalBidStatus: "All bid statuses",
    proposalAging: "all",
    dataQuality: "all",
    contractorWin: "all",
    accountSort: "client",
    accountDirection: "asc",
    activityAccount: "All accounts",
    activityEntity: "All entities",
    activityCounty: "All counties",
    activityRep: "All reps",
    activityDate: "all",
    activityDirection: "desc",
    callListSort: "name",
    callListDirection: "asc",
    projectSort: "stage",
    projectDirection: "asc",
    proposalDirection: "asc",
    contractorDirection: "asc",
    scopeCategory: "All categories",
    scopeSearch: "",
    scopeSort: "savedAt",
    scopeDirection: "desc",
    takeoffProject: "All projects",
    takeoffSearch: "",
    takeoffSort: "savedAt",
    takeoffDirection: "desc",
    takeoffPricingType: "Series Pricing",
    takeoffPricingYear: String(new Date().getFullYear()),
    queueType: "all",
    queueUrgency: "all",
    taskDue: "all",
    taskAccount: "All accounts",
    taskType: "All task types",
    taskPriority: "All priorities",
    taskStatus: "Open tasks",
    taskAssigned: "All users",
    taskSort: "dueDate",
    taskDirection: "asc",
    taskSearch: "",
    punchProject: "All projects",
    punchContractor: "All contractors",
    punchStatus: "All statuses",
    punchSeverity: "All severities",
    punchCategory: "All categories",
    punchSort: "updatedAt",
    punchDirection: "desc",
    punchSearch: "",
  },
  proposalSort: "stage",
  notes: readStorageJson("garlandCrmNotes", {}),
  activities: readStorageJson("garlandAccountActivities", {}),
  attachments: readStorageJson("garlandProposalAttachments", {}),
  projectChecklists: readStorageJson("garlandProjectChecklists", {}),
  scopeDatabase: readStorageJson("garlandScopeDatabase", []),
  takeoffEstimates: readStorageJson("garlandTakeoffEstimates", []),
  takeoffManualProducts: readStorageJson("garlandTakeoffManualProducts", []),
  favoriteSystems: readStorageJson("garlandFavoriteSystems", []),
  priceBooks: readStorageJson("garlandPriceBooks", []),
  priceBookProducts: readStorageJson("garlandPriceBookProducts", []),
  callLists: readStorageJson("garlandCallLists", { rules: [], completed: {} }),
  tasks: readStorageJson("garlandTasks", []),
  punchLists: readStorageJson("garlandPunchLists", []),
  taskDraftFiles: [],
  punchDraftFiles: { before: [], after: [] },
  punchKeepOpen: false,
  selectedContractors: [],
  selectedProjectContractors: [],
  detailsHidden: false,
  callListMode: "today",
  callListDay: todayCallDay(),
  takeoffMode: "builder",
  activeTakeoffEstimateId: "",
  accountMode: "browse",
  layouts: {
    accounts: "tile",
    projects: "tile",
    proposals: "tile",
    scopeDatabase: "tile",
    contractors: "tile",
    callList: "tile",
    takeoffEstimates: "tile",
    tasks: "tile",
    punchLists: "tile",
  },
  phoneMode: false,
  mobilePreview: false,
  desktopLayoutsBeforePhone: null,
};
if (!Array.isArray(state.scopeDatabase)) state.scopeDatabase = [];
if (!Array.isArray(state.takeoffEstimates)) state.takeoffEstimates = [];
if (!Array.isArray(state.takeoffManualProducts)) state.takeoffManualProducts = [];
if (!Array.isArray(state.favoriteSystems)) state.favoriteSystems = [];
if (!Array.isArray(state.priceBooks)) state.priceBooks = [];
if (!Array.isArray(state.priceBookProducts)) state.priceBookProducts = [];
if (!Array.isArray(state.tasks)) state.tasks = [];
if (!Array.isArray(state.punchLists)) state.punchLists = [];
if (!Array.isArray(state.taskDraftFiles)) state.taskDraftFiles = [];
if (!state.punchDraftFiles || Array.isArray(state.punchDraftFiles)) state.punchDraftFiles = { before: [], after: [] };
if (!state.notes || Array.isArray(state.notes)) state.notes = {};
if (!state.activities || Array.isArray(state.activities)) state.activities = {};
if (!state.attachments || Array.isArray(state.attachments)) state.attachments = {};
if (!state.callLists || Array.isArray(state.callLists)) state.callLists = { rules: [], completed: {} };

const byId = (id) => document.getElementById(id);

// ── Inline modal helpers (replace native alert/confirm/prompt) ────
function gripConfirm(message, yesLabel = "OK", noLabel = "Cancel") {
  return new Promise((resolve) => {
    const d = byId("gripConfirmDialog");
    byId("gripConfirmMessage").textContent = message;
    byId("gripConfirmYes").textContent = yesLabel;
    byId("gripConfirmNo").textContent = noLabel;
    const cleanup = (val) => { d.close(); resolve(val); };
    byId("gripConfirmYes").onclick = () => cleanup(true);
    byId("gripConfirmNo").onclick  = () => cleanup(false);
    d.oncancel = () => cleanup(false);
    d.showModal();
  });
}

function gripPrompt(message, defaultValue = "", placeholder = "") {
  return new Promise((resolve) => {
    const d = byId("gripPromptDialog");
    byId("gripPromptMessage").textContent = message;
    const inp = byId("gripPromptInput");
    inp.value = defaultValue;
    inp.placeholder = placeholder;
    const cleanup = (val) => { d.close(); resolve(val); };
    byId("gripPromptOk").onclick     = () => cleanup(inp.value.trim() || null);
    byId("gripPromptCancel").onclick = () => cleanup(null);
    d.oncancel = () => cleanup(null);
    d.showModal();
    setTimeout(() => inp.focus(), 50);
  });
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyWithCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const today = new Date();
if (!Array.isArray(state.callLists.rules)) state.callLists.rules = [];
if (!state.callLists.completed) state.callLists.completed = {};
if (!state.projectChecklists || Array.isArray(state.projectChecklists)) state.projectChecklists = {};

const priceBookTypes = [
  "Roll Goods",
  "Coatings, Mastics & Adhesives",
  "Sealants & Accessories",
  "Metal / Edge Metal",
  "Standing Seam",
  "WPG",
  "Warranty",
  "Other",
];
const pricingPrograms = ["Series Pricing", "Co-op Pricing"];

function formatPopulation(value) {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  return numeric ? numeric.toLocaleString() : "";
}

function goalMoney(value) {
  return money.format(Math.ceil(Number(value) || 0));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeStageLabel(value) {
  return normalize(value) === "waiting contractor on material order" ? "Waiting On Material Order" : value;
}

function normalizeProjectTypeLabel(value) {
  return normalize(value) === "new roof" ? "New Roof/Reroof" : value;
}

function normalizeAbcScoreLabel(value) {
  const score = normalize(value);
  return score.includes("job secured") ? "Job Won" : value;
}

function standardizeStageLabels() {
  let crmChanged = false;
  let proposalUpdatesChanged = false;
  const normalizeRecord = (record) => {
    if (!record || !record.stage) return false;
    const next = normalizeStageLabel(record.stage);
    if (next === record.stage) return false;
    record.stage = next;
    return true;
  };
  data.projects.forEach(normalizeRecord);
  data.proposals.forEach(normalizeRecord);
  savedCrm.projects.forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  savedCrm.proposals.forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  Object.values(savedCrm.edits.projects || {}).forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  Object.values(savedCrm.edits.proposals || {}).forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  Object.values(proposalUpdates || {}).forEach((record) => {
    if (normalizeRecord(record)) proposalUpdatesChanged = true;
  });
  if (crmChanged) saveCrm();
  if (proposalUpdatesChanged) localStorage.setItem("garlandProposalUpdates", JSON.stringify(proposalUpdates));
}

function standardizeProjectTypeLabels() {
  let crmChanged = false;
  const normalizeRecord = (record) => {
    if (!record || !record.projectType) return false;
    const next = normalizeProjectTypeLabel(record.projectType);
    if (next === record.projectType) return false;
    record.projectType = next;
    return true;
  };
  data.projects.forEach(normalizeRecord);
  savedCrm.projects.forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  Object.values(savedCrm.edits.projects || {}).forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  if (crmChanged) saveCrm();
}

function standardizeAbcScoreLabels() {
  let crmChanged = false;
  const normalizeRecord = (record) => {
    if (!record || !record.abcList) return false;
    const next = normalizeAbcScoreLabel(record.abcList);
    if (next === record.abcList) return false;
    record.abcList = next;
    return true;
  };
  data.projects.forEach(normalizeRecord);
  savedCrm.projects.forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  Object.values(savedCrm.edits.projects || {}).forEach((record) => {
    if (normalizeRecord(record)) crmChanged = true;
  });
  if (normalize(state.filters.projectRank).includes("job secured")) {
    state.filters.projectRank = "Job Won";
    saveState();
  }
  if (crmChanged) saveCrm();
}

function includesSearch(record) {
  if (!state.search) return true;
  return normalize(Object.values(record).join(" ")).includes(normalize(state.search));
}

function taskMatchesGlobalSearch(task) {
  if (!state.search) return true;
  const q = normalize(state.search);
  return [task.title, task.description, task.account_name, task.next_action, task.task_type, task.assigned_user]
    .filter(Boolean).some((v) => normalize(v).includes(q));
}

function isArchivedRecord(id) {
  return savedCrm.archived.includes(id);
}

function isMeaningfulAccount(account) {
  return !savedCrm.deleted.includes(account.id) && !isArchivedRecord(account.id) && Boolean(normalize(account.client));
}

function isMeaningfulProject(project) {
  return !savedCrm.deleted.includes(project.id) && !isArchivedRecord(project.id) && Boolean(normalize(project.projectName) || normalize(project.client));
}

function isMeaningfulProposal(proposal) {
  return !savedCrm.deleted.includes(proposal.id) && !isArchivedRecord(proposal.id) && Boolean(normalize(proposal.project) || normalize(proposal.client));
}

function cleanAccounts() {
  return data.accounts.filter(isMeaningfulAccount);
}

function cleanProjects() {
  return data.projects.filter(isMeaningfulProject);
}

function cleanProposals() {
  return data.proposals.filter(isMeaningfulProposal);
}

function unique(records, key, label) {
  const values = [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  return [label, ...values];
}

function splitContractors(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function contractorNames() {
  const names = new Set((savedCrm.contractors || []).map((contractor) => contractor.companyName).filter(Boolean));
  cleanProposals().forEach((proposal) => {
    splitContractors(proposal.biddingContractors).forEach((name) => names.add(name));
    splitContractors(proposal.bidsReceived).forEach((name) => names.add(name));
    if (proposal.awardedContractor) names.add(proposal.awardedContractor);
  });
  cleanProjects().forEach((project) => {
    splitContractors(project.biddingContractors).forEach((name) => names.add(name));
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function findContractorProfile(name) {
  return savedCrm.contractors.find((contractor) => normalize(contractor.companyName) === normalize(name));
}

function ensureContractorProfile(name) {
  const cleaned = String(name || "").trim();
  if (!cleaned) return null;
  let profile = findContractorProfile(cleaned);
  if (!profile) {
    profile = {
      id: `contractor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      companyName: cleaned,
      poc: "",
      title: "",
      phone: "",
      email: "",
      color: "#0057a8",
      address: "",
      supportContacts: [],
    };
    savedCrm.contractors.push(profile);
    saveCrm();
  }
  return profile;
}

function contractorProposalRecords(name) {
  const key = normalize(name);
  return cleanProposals().filter((proposal) => {
    const bidding = splitContractors(proposal.biddingContractors).some((contractor) => normalize(contractor) === key);
    const received = splitContractors(proposal.bidsReceived).some((contractor) => normalize(contractor) === key);
    const awarded = normalize(proposal.awardedContractor) === key;
    return bidding || received || awarded;
  }).sort((a, b) => (dateValue(b.bidDueDate) || dateValue(b.projectStartDate)) - (dateValue(a.bidDueDate) || dateValue(a.projectStartDate)));
}

function dateValue(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function contractorSummary(name) {
  const proposals = contractorProposalRecords(name);
  const wins = proposals.filter((proposal) => normalize(proposal.awardedContractor) === normalize(name));
  const lastGiven = proposals.reduce((max, proposal) => Math.max(max, dateValue(proposal.bidDueDate) || dateValue(proposal.projectStartDate)), 0);
  const lastWon = wins.reduce((max, proposal) => Math.max(max, dateValue(proposal.bidDueDate) || dateValue(proposal.projectStartDate)), 0);
  return {
    opportunities: proposals.length,
    wins: wins.length,
    lastGiven: lastGiven ? new Date(lastGiven).toISOString() : "",
    lastWon: lastWon ? new Date(lastWon).toISOString() : "",
    proposals,
  };
}

function contractorRecords() {
  return contractorNames().map((name) => ({
    id: `contractor-${normalize(name)}`,
    type: "contractor",
    companyName: name,
    ...(findContractorProfile(name) || {}),
    ...contractorSummary(name),
  }));
}

function contractorColor(name) {
  return ensureContractorProfile(name)?.color || "#0057a8";
}

function contractorStyle(name) {
  const color = contractorColor(name);
  return color ? ` style="background:${escapeHtml(color)};border-color:${escapeHtml(color)};color:#fff;"` : "";
}

function accountNames() {
  return [...new Set(cleanAccounts().map((account) => account.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function findAccountByName(client) {
  return cleanAccounts().find((account) => normalize(account.client) === normalize(client));
}

function accountActivityEntries(account) {
  return [...(state.activities[account.id] || [])]
    .map((entry) => ({ ...entry, accountId: account.id }))
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
}

function sheetClientMatch(accountClient, recordClient) {
  const accountKey = normalize(accountClient);
  const recordKey = normalize(recordClient);
  if (!accountKey || !recordKey) return false;
  if (accountKey === recordKey) return true;
  if (accountKey.length > 8 && recordKey.includes(accountKey)) return true;
  if (recordKey.length > 8 && accountKey.includes(recordKey)) return true;
  const accountWords = accountKey.split(" ");
  const recordWords = recordKey.split(" ");
  return accountWords.length >= 3 && recordWords.length >= 3 && accountWords.slice(0, 3).join(" ") === recordWords.slice(0, 3).join(" ");
}

function sheetProposalsForAccount(account) {
  return cleanProposals().filter((proposal) => sheetClientMatch(account.client, proposal.client));
}

function sheetProjectsForAccount(account) {
  return cleanProjects().filter((project) => sheetClientMatch(account.client, project.client));
}

function ensureAccountsForSheetNoteClients() {
  let changed = false;
  cleanProposals()
    .filter((proposal) => String(proposal.notes || "").trim() && proposal.client)
    .forEach((proposal) => {
      const exists = cleanAccounts().some((account) => sheetClientMatch(account.client, proposal.client));
      if (exists) return;
      const id = `sheet-note-account-${normalize(proposal.client).replaceAll(" ", "-")}`;
      if (data.accounts.some((account) => account.id === id)) return;
      const account = {
        id,
        sourceRow: "Proposal Tracker",
        clientRanking: "Prospecting",
        entity: "",
        county: "",
        action: "",
        client: proposal.client,
        address: "",
        poc: "",
        title: "",
        phone: "",
        email: "",
        nextStep: "",
        activity: proposal.projectStartDate || proposal.bidDueDate || "",
      };
      savedCrm.accounts.push(account);
      data.accounts.push(account);
      changed = true;
    });
  if (changed) saveCrm();
}

function sheetNoteActivityEntries(account) {
  const entries = [];
  if (String(account.nextStep || "").trim()) {
    entries.push({
        id: `${account.id}-abc-list-note`,
        note: account.nextStep,
        createdAt: account.activity || "",
        source: "ABC List",
        accountId: account.id,
      });
  }
  sheetProposalsForAccount(account)
    .filter((proposal) => String(proposal.notes || "").trim())
    .forEach((proposal) => {
      entries.push({
        id: `${account.id}-${proposal.id}-proposal-note`,
        note: `${proposal.project || "Proposal"}: ${proposal.notes}`,
        createdAt: proposal.projectStartDate || proposal.bidDueDate || "",
        source: "Proposal Tracker",
        accountId: account.id,
      });
    });
  sheetProjectsForAccount(account)
    .filter((project) => String(project.notes || project.nextStep || "").trim())
    .forEach((project) => {
      entries.push({
        id: `${account.id}-${project.id}-project-note`,
        note: `${project.projectName || "Project"}: ${project.notes || project.nextStep}`,
        createdAt: project.startDate || project.anticipatedStartDate || "",
        source: "ABC Project List",
        accountId: account.id,
      });
    });
  return entries;
}

function migrateSheetNotesToActivities() {
  if (localStorage.getItem(sheetActivityImportKey)) return;
  ensureAccountsForSheetNoteClients();
  cleanAccounts().forEach((account) => {
    const existing = state.activities[account.id] || [];
    const existingIds = new Set(existing.map((entry) => entry.id));
    const imported = sheetNoteActivityEntries(account).filter((entry) => entry.note && !existingIds.has(entry.id));
    if (imported.length) state.activities[account.id] = [...imported, ...existing];
  });
  saveActivities();
  localStorage.setItem(sheetActivityImportKey, new Date().toISOString());
}

function latestAccountActivity(account) {
  return accountActivityEntries(account)[0] || null;
}

function allActivityRecords() {
  return cleanAccounts().flatMap((account) =>
    accountActivityEntries(account).map((entry) => ({
      ...entry,
      accountId: account.id,
      accountName: account.client || "Unnamed Account",
      entity: account.entity || "",
      county: account.county || "",
      sharedRep: account.sharedRep || "",
      poc: account.poc || "",
      phone: account.phone || "",
      email: account.email || "",
    }))
  );
}

function saveActivities() {
  localStorage.setItem("garlandAccountActivities", JSON.stringify(state.activities));
}

function saveTasks() {
  localStorage.setItem("garlandTasks", JSON.stringify(state.tasks));
}

function savePunchLists() {
  localStorage.setItem("garlandPunchLists", JSON.stringify(state.punchLists));
}

function accountActivityStatus(account) {
  if (normalize(account.clientRanking) === "dead end") return { level: "dead", label: "Dead end" };
  const latest = latestAccountActivity(account);
  if (!latest || !dateValue(latest.createdAt)) return { level: "red", label: "No activity logged" };
  const days = Math.floor((Date.now() - dateValue(latest.createdAt)) / 86400000);
  if (days > 45) return { level: "red", label: `${days} days since activity` };
  if (days > 14) return { level: "yellow", label: `${days} days since activity` };
  return { level: "green", label: `${days} days since activity` };
}

function accountProposalCounts(account) {
  const proposals = relatedFor(account.client || "").proposals;
  return {
    open: proposals.filter((proposal) => !["Work Completed", "Proposal Rejected"].includes(proposal.stage)).length,
    won: proposals.filter((proposal) => ["Proposals Approved", "PO Received", "Work Scheduled", "Work Completed"].includes(proposal.stage)).length,
    lost: proposals.filter((proposal) => proposal.stage === "Proposal Rejected").length,
    proposals,
  };
}

function activityFilterMatch(account) {
  if (state.filters.accountActivity === "All activity") return true;
  if (normalize(account.clientRanking) === "dead end") return false;
  return accountActivityStatus(account).level === state.filters.accountActivity.toLowerCase();
}

function sortDirection(direction) {
  return direction === "desc" ? -1 : 1;
}

function compareText(a, b, direction = "asc") {
  return String(a || "").localeCompare(String(b || "")) * sortDirection(direction);
}

function compareNumber(a, b, direction = "asc") {
  return ((Number(a) || 0) - (Number(b) || 0)) * sortDirection(direction);
}

function compareDateValue(a, b, direction = "asc") {
  const aDate = dateValue(a);
  const bDate = dateValue(b);
  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;
  return (aDate - bDate) * sortDirection(direction);
}

function scoreRank(value) {
  const score = normalize(value);
  if (score.includes("job won") || score.includes("job secured")) return 4;
  if (score.includes("a 90")) return 3;
  if (score.includes("b 50")) return 2;
  if (score.includes("c 25")) return 1;
  return 0;
}

function accountRankOrder(value) {
  const index = accountRankOptions.findIndex((item) => normalize(item) === normalize(value));
  return index === -1 ? accountRankOptions.length : index;
}

function quarterRank(value) {
  const match = String(value || "").match(/Q([1-4])\s+(\d{4})/i);
  if (!match) return 0;
  return Number(match[2]) * 10 + Number(match[1]);
}

function projectMaterials(project) {
  return Number(project.materials || project.commission || 0);
}

function projectCommission(project) {
  return Number(project.projectCommission || project.commission || 0);
}

function projectWiseTotal(project) {
  return Number(project.wiseTrophy || project.wiseTropy || 0);
}

function projectYear(project) {
  const match = String(project.anticipatedStartDate || "").match(/(20\d{2})/);
  return match ? Number(match[1]) : 0;
}

function proposalMaterials(proposal) {
  return Number(proposal.materials || 0);
}

function proposalCommission(proposal) {
  return Number(proposal.proposalCommission || proposal.commission || proposalMaterials(proposal) * 0.25 || 0);
}

function proposalWiseTotal(proposal) {
  return Number(proposal.wiseTrophy || proposal.wiseTropy || proposalCommission(proposal) * 4 || 0);
}

function proposalYear(proposal) {
  const date = new Date(proposal.bidDueDate || proposal.projectStartDate || proposal.createdAt || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getFullYear();
}

function dateKeyFromValue(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalDateKey(parsed);
}

function proposalEntity(proposal) {
  return findAccountByName(proposal.client)?.entity || "Unspecified";
}

function projectForProposal(proposal) {
  const proposalProject = normalize(proposal.project);
  const proposalClient = normalize(proposal.client);
  return cleanProjects().find((project) => {
    const sameClient = normalize(project.client) === proposalClient;
    const sameProject = normalize(project.projectName) === proposalProject || normalize(project.project) === proposalProject;
    return sameClient && sameProject;
  });
}

function proposalRequestAddress(proposal) {
  return proposal.address || projectForProposal(proposal)?.address || findAccountByName(proposal.client)?.address || "";
}

function proposalRequestFiles(proposal) {
  const filesByCategory = state.attachments[proposal.id] || {};
  return [
    ...(filesByCategory.photoReport || []),
    ...(filesByCategory.scopeOfWork || []),
    ...(filesByCategory.proposalPricing || []),
  ];
}

function recordTitle(type, record) {
  if (type === "account") return record.client || "Account";
  if (type === "project") return record.projectName || record.project || record.client || "Project";
  if (type === "proposal") return record.project || record.client || "Proposal";
  if (type === "contractor") return record.companyName || "Contractor";
  return "Record";
}

function formatPromptLines(title, values) {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value]) => `- ${label}: ${value}`);
  return lines.length ? `${title}\n${lines.join("\n")}` : "";
}

function chatGptPrompt(type, id) {
  const record = findRecord(type, id);
  if (!record) return "";
  const title = recordTitle(type, record);
  const sections = [
    `You are helping me work inside GRIP, my Garland Relationship Intelligence Platform CRM. Review this CRM context and help me with practical next steps, follow-up ideas, email/call wording, and any risks or missing information I should address.\n\nRecord: ${title}\nType: ${type}`,
  ];

  if (type === "account") {
    const activity = accountActivityStatus(record);
    const latestActivities = accountActivityEntries(record)
      .slice(0, 5)
      .map((entry) => `${compactDate(entry.createdAt) || "No date"}: ${entry.note || entry.source || ""}`)
      .join("\n");
    const counts = accountProposalCounts(record);
    sections.push(formatPromptLines("Account Details", {
      Ranking: record.clientRanking,
      Entity: record.entity,
      County: record.county,
      "Shared Rep": record.sharedRep,
      Contact: [record.poc, record.title].filter(Boolean).join(", "),
      Phone: record.phone,
      Email: record.email,
      Address: record.address,
      "Activity Status": activity.label,
      "Open Proposals": counts.open,
      "Won Proposals": counts.won,
      "Lost Proposals": counts.lost,
    }));
    if (latestActivities) sections.push(`Recent Activity\n${latestActivities}`);
  }

  if (type === "project") {
    sections.push(formatPromptLines("Project Details", {
      Client: record.client,
      "Project Name": record.projectName || record.project,
      "Project Type": record.projectType,
      Address: record.address,
      "ABC Score": record.abcList,
      Stage: record.stage,
      "Anticipated Start": record.anticipatedStartDate,
      "Next Follow-up": record.nextFollowUp,
      "Bidding Contractors": record.biddingContractors,
      "Awarded Contractor": record.awardedContractor,
      Materials: moneyWithCents.format(projectMaterials(record)),
      Commission: moneyWithCents.format(projectCommission(record)),
      "Wise Trophy": moneyWithCents.format(projectWiseTotal(record)),
      "SQ/FT": record.squareFeet ? Number(record.squareFeet).toLocaleString() : "",
      "Warranty Type": record.systemWarrantyType,
      "Warranty Term": record.systemWarrantyTerm,
      "System": record.systemProduct,
      "Contractor Warranty": record.contractorWarranty,
    }));
  }

  if (type === "proposal") {
    const files = proposalRequestFiles(record).map((file) => file.name).join(", ");
    sections.push(formatPromptLines("Proposal Details", {
      Client: record.client,
      Project: record.project,
      Address: proposalRequestAddress(record),
      Stage: record.stage,
      "Bid Due": compactDate(record.bidDueDate),
      "Next Follow-up": record.nextFollowUp,
      "Bidding Contractors": record.biddingContractors,
      "Bids Received": record.bidsReceived,
      "Awarded Contractor": record.awardedContractor,
      "Estimated Material Amount": moneyWithCents.format(proposalMaterials(record)),
      "Uploaded Proposal Files": files,
    }));
  }

  if (type === "contractor") {
    const summary = contractorSummary(record.companyName || id);
    const proposalList = summary.proposals
      .slice(0, 8)
      .map((proposal) => `- ${proposal.project || proposal.client || "Proposal"} | ${proposal.client || ""} | ${proposal.stage || ""} | Due ${compactDate(proposal.bidDueDate) || "N/A"}`)
      .join("\n");
    sections.push(formatPromptLines("Contractor Details", {
      Company: record.companyName,
      "Point of Contact": record.poc,
      Title: record.title,
      Phone: record.phone,
      Email: record.email,
      Address: record.address,
      Opportunities: summary.opportunities,
      Wins: summary.wins,
      "Last Opportunity Given": compactDate(summary.lastGiven),
      "Last Opportunity Won": compactDate(summary.lastWon),
    }));
    if (proposalList) sections.push(`Recent Proposal History\n${proposalList}`);
  }

  sections.push("Please respond with concise, actionable recommendations and draft any useful follow-up language.");
  return sections.filter(Boolean).join("\n\n");
}

function proposalRequestDraft(proposal, contractorName) {
  const profile = findContractorProfile(contractorName) || { companyName: contractorName, poc: "", email: "" };
  const project = proposal.project || proposal.client || "Project";
  const due = proposal.bidDueDate ? compactDate(proposal.bidDueDate) : "";
  const address = proposalRequestAddress(proposal);
  const subject = due ? `${project} | Proposal Request due ${due}` : `${project} | Proposal Request`;
  const greeting = profile?.poc ? `Hello ${profile.poc},` : "Hello,";
  const detailLines = [`Client: ${proposal.client || ""}`];
  if (address) detailLines.push(`Address: ${address}`);
  if (due) detailLines.push(`Proposal Due Date: ${due}`);
  const body = [
    greeting,
    "",
    "",
    "I would like your assistance in preparing a proposal for our client.",
    "",
    "If you would like to do a site visit, please let me know a date and time, and I will coordinate this with the owner.",
    "",
    ...detailLines,
    "",
    "I would greatly appreciate it if you could review the attached documents at your earliest convenience. Should you have any inquiries or require further clarification, please don't hesitate to contact me. I eagerly anticipate your prompt response.",
    "",
    "Thank you for your attention to this matter.",
    "",
    "-------------",
  ].join("\n");
  return {
    to: profile?.email || "",
    subject,
    body,
    text: `To: ${profile?.email || ""}\nSubject: ${subject}\n\n${body}`,
  };
}

function proposalRequestMailto(proposal, contractorName) {
  const draft = proposalRequestDraft(proposal, contractorName);
  return `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

function proposalRequestButton(proposal, contractorName) {
  const profile = findContractorProfile(contractorName) || { companyName: contractorName, poc: "", email: "" };
  const files = proposalRequestFiles(proposal);
  const fileText = files.length ? `Attach manually: ${files.map((file) => file.name).join(", ")}` : "No proposal files uploaded yet.";
  const label = profile?.email ? "Request Proposal" : "Request Proposal (add email)";
  return `<div class="proposal-request-action">
    <div class="proposal-request-buttons">
      <button class="mini-button request-proposal-button" data-request-proposal data-proposal-request-id="${escapeHtml(proposal.id)}" data-proposal-request-contractor="${escapeHtml(contractorName)}" type="button">${label}</button>
      <button class="mini-button" data-copy-proposal-request data-proposal-request-id="${escapeHtml(proposal.id)}" data-proposal-request-contractor="${escapeHtml(contractorName)}" type="button">Copy Draft</button>
    </div>
    <small>${escapeHtml(fileText)}${profile?.email ? " Mail apps do not allow GRIP to auto-attach local files." : " Add the contractor email first for one-click addressing."}</small>
  </div>`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy");
  textarea.remove();
  return Boolean(copied);
}

async function copyProposalRequestDraft(text, message = "Proposal request draft copied. Paste it into your email if the mail window did not open.") {
  try {
    const copied = await copyTextToClipboard(text);
    if (copied) alert(message);
    else window.prompt("Copy this draft", text);
  } catch (_error) {
    window.prompt("Copy this draft", text);
  }
}

function saveCrm() {
  localStorage.setItem("garlandCrmData", JSON.stringify(savedCrm));
}

function saveTerritorySettings() {
  localStorage.setItem("garlandTerritorySettings", JSON.stringify(territorySettings));
}

function repInitials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "GR";
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("");
}

function renderBrand() {
  const el = byId("brandMark");
  if (el) el.innerHTML = '<img src="icons/icon-192.png" alt="GRIP" />';
}

function saveScopeDatabase() {
  localStorage.setItem("garlandScopeDatabase", JSON.stringify(state.scopeDatabase));
}

function saveTakeoffEstimates() {
  localStorage.setItem("garlandTakeoffEstimates", JSON.stringify(state.takeoffEstimates));
}

function saveTakeoffManualProducts() {
  localStorage.setItem("garlandTakeoffManualProducts", JSON.stringify(state.takeoffManualProducts));
}

function saveFavoriteSystems() {
  localStorage.setItem("garlandFavoriteSystems", JSON.stringify(state.favoriteSystems));
}

function savePriceBooks() {
  try {
    localStorage.setItem("garlandPriceBooks", JSON.stringify(state.priceBooks));
    localStorage.setItem("garlandPriceBookProducts", JSON.stringify(state.priceBookProducts));
    return true;
  } catch (_error) {
    alert("That price book set is too large for this local browser storage. Use fewer PDFs at once or store the files in Google Drive and keep links in GRIP.");
    return false;
  }
}

function savePriceBookProducts() {
  localStorage.setItem("garlandPriceBookProducts", JSON.stringify(state.priceBookProducts));
}

function visibleTerritoryValues(values, hidden) {
  const hiddenSet = new Set(hidden.map(normalize));
  return [...new Set(values.filter(Boolean))]
    .filter((value) => !hiddenSet.has(normalize(value)))
    .sort((a, b) => a.localeCompare(b));
}

function territoryEntityOptions() {
  return visibleTerritoryValues(
    [...cleanAccounts().map((account) => account.entity), ...territorySettings.entities],
    territorySettings.hiddenEntities
  );
}

function territoryCountyOptions() {
  return visibleTerritoryValues(
    [...cleanAccounts().map((account) => account.county), ...territorySettings.counties],
    territorySettings.hiddenCounties
  );
}

function territoryColor(type, value) {
  const map = type === "county" ? territorySettings.colors.county : territorySettings.colors.entity;
  const match = Object.keys(map || {}).find((key) => normalize(key) === normalize(value));
  return match ? map[match] : "";
}

function territoryPillStyle(type, value) {
  const color = territoryColor(type, value);
  return color ? ` style="background:${escapeHtml(color)};border-color:${escapeHtml(color)};color:#fff;"` : "";
}

function saveProposalUpdate(id, patch) {
  proposalUpdates[id] = { ...(proposalUpdates[id] || {}), ...patch };
  const proposal = data.proposals.find((item) => item.id === id);
  if (proposal) Object.assign(proposal, patch);
  localStorage.setItem("garlandProposalUpdates", JSON.stringify(proposalUpdates));
}

function valueIsZeroMoney(value) {
  if (value === undefined || value === null || String(value).trim() === "") return false;
  return Number(String(value).replace(/[^0-9.-]/g, "")) === 0;
}

function applyRequestedDataCleanup() {
  const cleanupKey = "garlandCleanupMaterialsAddressesV1";
  if (localStorage.getItem(cleanupKey) === "done") return;

  const accountAddressByClient = new Map(
    data.accounts
      .filter((account) => !savedCrm.deleted.includes(account.id) && account.address)
      .map((account) => [normalize(account.client), account.address])
  );
  let crmChanged = false;
  let proposalUpdatesChanged = false;

  data.proposals.forEach((proposal) => {
    if (!valueIsZeroMoney(proposal.materials)) return;
    proposal.materials = 250;
    proposalUpdates[proposal.id] = { ...(proposalUpdates[proposal.id] || {}), materials: 250 };
    proposalUpdatesChanged = true;
  });

  savedCrm.proposals.forEach((proposal) => {
    if (!valueIsZeroMoney(proposal.materials)) return;
    proposal.materials = 250;
    crmChanged = true;
  });

  data.projects.forEach((project) => {
    if (String(project.address || "").trim()) return;
    const clientAddress = accountAddressByClient.get(normalize(project.client));
    if (!clientAddress) return;
    project.address = clientAddress;
    savedCrm.edits.projects[project.id] = { ...(savedCrm.edits.projects[project.id] || {}), address: clientAddress };
    crmChanged = true;
  });

  savedCrm.projects.forEach((project) => {
    if (String(project.address || "").trim()) return;
    const clientAddress = accountAddressByClient.get(normalize(project.client));
    if (!clientAddress) return;
    project.address = clientAddress;
    crmChanged = true;
  });

  if (crmChanged) saveCrm();
  if (proposalUpdatesChanged) localStorage.setItem("garlandProposalUpdates", JSON.stringify(proposalUpdates));
  localStorage.setItem(cleanupKey, "done");
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInput(value) {
  return value.toISOString().slice(0, 10);
}

function fillSelect(id, options, value) {
  const select = byId(id);
  select.innerHTML = options.map((option) => {
    const optionValue = typeof option === "object" ? option.value : option;
    const optionLabel = typeof option === "object" ? option.label : option;
    return `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
  }).join("");
  applyControlColor(select);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function phoneHref(value) {
  const cleaned = String(value || "").replace(/[^0-9+]/g, "");
  return cleaned ? `tel:${escapeHtml(cleaned)}` : "";
}

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeEditableValue(key, value) {
  if (key === "phone" || key === "repPhone") return formatPhoneNumber(value);
  return value;
}

function isDateField(key) {
  return ["bidDueDate", "nextFollowUp"].includes(key);
}

function emailHref(value) {
  const cleaned = String(value || "").trim();
  return cleaned ? `mailto:${escapeHtml(cleaned)}` : "";
}

function contactLinks(record, className = "contact-links") {
  const links = [];
  if (record.phone && phoneHref(record.phone)) links.push(`<a href="${phoneHref(record.phone)}" data-contact-link>${escapeHtml(formatPhoneNumber(record.phone) || record.phone)}</a>`);
  if (record.email && emailHref(record.email)) links.push(`<a href="${emailHref(record.email)}" data-contact-link>${escapeHtml(record.email)}</a>`);
  return links.length ? `<div class="${className}">${links.join("")}</div>` : "";
}

function priorityRank(value) {
  const index = taskPriorities.findIndex((item) => normalize(item) === normalize(value));
  return index === -1 ? 1 : index;
}

function taskPriorityClass(value) {
  return `task-priority-${normalize(value || "normal").replaceAll(" ", "-")}`;
}

function taskTypeClass(value) {
  return `task-type-${normalize(value || "follow-up").replaceAll(" ", "-")}`;
}

function taskStatusClass(value) {
  return `task-status-${normalize(value || "open").replaceAll(" ", "-")}`;
}

function taskDueLevel(task) {
  if (["Completed", "Cancelled"].includes(task.status)) return "completed";
  const key = dateKeyFromValue(task.due_date);
  const todayKey = toLocalDateKey(new Date());
  if (!key) return "none";
  if (key < todayKey) return "overdue";
  if (key === todayKey) return "today";
  return "upcoming";
}

function taskDueLabel(task) {
  const level = taskDueLevel(task);
  if (level === "overdue") return `Overdue ${compactDate(task.due_date)}`;
  if (level === "today") return `Today${task.due_time ? ` at ${task.due_time}` : ""}`;
  if (level === "completed") return task.completed_at ? `Completed ${compactDate(task.completed_at)}` : "Completed";
  return task.due_date ? `${compactDate(task.due_date)}${task.due_time ? ` at ${task.due_time}` : ""}` : "No due date";
}

function taskProjectOptions(accountName = "") {
  const projects = cleanProjects().filter((project) => !accountName || normalize(project.client) === normalize(accountName));
  return [
    { value: "", label: "No related project" },
    ...projects.map((project) => ({ value: project.id, label: [project.projectName || project.client, project.client].filter(Boolean).join(" | ") })),
  ];
}

function findTask(id) {
  return state.tasks.find((task) => task.task_id === id);
}

function taskAccountByName(name) {
  return findAccountByName(name || "");
}

function taskDefaultAssignedUser() {
  return String(territorySettings.rep?.name || "").trim() || "Unassigned";
}

function taskSearchText(task) {
  return [
    task.title,
    task.description,
    task.account_name,
    task.related_project_name,
    task.task_type,
    task.priority,
    task.status,
    task.assigned_user,
    task.next_action,
    task.completed_outcome,
  ].join(" ");
}

function normalizedTask(task) {
  const now = new Date().toISOString();
  return {
    task_id: task.task_id || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: task.title || "Untitled task",
    description: task.description || "",
    account_id: task.account_id || "",
    account_name: task.account_name || "",
    related_project_id: task.related_project_id || "",
    related_project_name: task.related_project_name || "",
    due_date: task.due_date || toLocalDateKey(new Date()),
    due_time: task.due_time || "",
    priority: task.priority || "Normal",
    task_type: task.task_type || "Follow-Up",
    next_action: task.next_action || "",
    reminder_settings: task.reminder_settings || { type: "None", custom: "" },
    recurring_settings: task.recurring_settings || { type: "None" },
    status: task.status || "Open",
    completed_outcome: task.completed_outcome || "",
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    assigned_user: task.assigned_user || taskDefaultAssignedUser(),
    created_at: task.created_at || now,
    updated_at: task.updated_at || now,
    completed_at: task.completed_at || "",
  };
}

function ensureTaskShape() {
  let changed = false;
  state.tasks = state.tasks.map((task) => {
    const normalizedTaskRecord = normalizedTask(task);
    if (JSON.stringify(task) !== JSON.stringify(normalizedTaskRecord)) changed = true;
    return normalizedTaskRecord;
  });
  if (changed) saveTasks();
}

function taskFilterMatch(task) {
  const due = taskDueLevel(task);
  const search = normalize([state.search, state.filters.taskSearch].filter(Boolean).join(" "));
  const openStatus = !["Completed", "Cancelled"].includes(task.status);
  return (
    (!search || normalize(taskSearchText(task)).includes(search)) &&
    (state.filters.taskDue === "all" ||
      (state.filters.taskDue === "today" && due === "today") ||
      (state.filters.taskDue === "upcoming" && due === "upcoming") ||
      (state.filters.taskDue === "overdue" && due === "overdue") ||
      (state.filters.taskDue === "completed" && task.status === "Completed") ||
      (state.filters.taskDue === "unassigned" && !task.account_id && !task.account_name)) &&
    (state.filters.taskAccount === "All accounts" || task.account_name === state.filters.taskAccount) &&
    (state.filters.taskType === "All task types" || task.task_type === state.filters.taskType) &&
    (state.filters.taskPriority === "All priorities" || task.priority === state.filters.taskPriority) &&
    (state.filters.taskStatus === "All statuses" || (state.filters.taskStatus === "Open tasks" ? openStatus : task.status === state.filters.taskStatus)) &&
    (state.filters.taskAssigned === "All users" || task.assigned_user === state.filters.taskAssigned)
  );
}

function sortTasks(a, b) {
  const direction = state.filters.taskDirection;
  if (state.filters.taskSort === "priority") return compareNumber(priorityRank(a.priority), priorityRank(b.priority), direction) || compareDateValue(a.due_date, b.due_date);
  if (state.filters.taskSort === "account") return compareText(a.account_name, b.account_name, direction) || compareDateValue(a.due_date, b.due_date);
  if (state.filters.taskSort === "taskType") return compareText(a.task_type, b.task_type, direction) || compareDateValue(a.due_date, b.due_date);
  if (state.filters.taskSort === "createdAt") return compareDateValue(a.created_at, b.created_at, direction);
  if (state.filters.taskSort === "updatedAt") return compareDateValue(a.updated_at, b.updated_at, direction);
  return compareDateValue(a.due_date, b.due_date, direction) || compareNumber(priorityRank(b.priority), priorityRank(a.priority)) || compareText(a.title, b.title);
}

function filteredTasks() {
  ensureTaskShape();
  return state.tasks.filter(taskFilterMatch).sort(sortTasks);
}

function taskAttachmentThumbs(task) {
  const files = task.attachments || [];
  if (!files.length) return "";
  const thumbs = files
    .slice(0, 3)
    .map((file) =>
      String(file.file_type || "").startsWith("image/")
        ? `<img src="${file.url || file.dataUrl || file.thumbnail_url}" alt="${escapeHtml(file.file_name || "Task attachment")}" />`
        : `<span>${escapeHtml((file.file_name || "File").split(".").pop()?.toUpperCase() || "FILE")}</span>`
    )
    .join("");
  return `<div class="task-thumbs">${thumbs}${files.length > 3 ? `<span>+${files.length - 3}</span>` : ""}</div>`;
}

function taskCard(task) {
  const dueLevel = taskDueLevel(task);
  const completed = task.status === "Completed";
  return `<article class="record-card task-card ${dueLevel}" data-type="task" data-id="${escapeHtml(task.task_id)}" draggable="true">
    <div class="task-card-top">
      <label class="task-check" title="Complete task">
        <input type="checkbox" data-complete-task="${escapeHtml(task.task_id)}" ${completed ? "checked" : ""} />
        <span></span>
      </label>
      <div>
        <h3>${escapeHtml(task.title || "Untitled task")}</h3>
        <p>${escapeHtml([task.account_name || "Unassigned", task.related_project_name].filter(Boolean).join(" | "))}</p>
      </div>
    </div>
    <div class="card-meta">
      <span class="pill ${taskTypeClass(task.task_type)}">${escapeHtml(task.task_type || "Task")}</span>
      <span class="pill ${taskPriorityClass(task.priority)}">${escapeHtml(task.priority || "Normal")}</span>
      <span class="pill ${taskStatusClass(task.status)}">${escapeHtml(task.status || "Open")}</span>
      <span class="pill task-due-${dueLevel}">${escapeHtml(taskDueLabel(task))}</span>
      ${task.assigned_user ? `<span class="pill">${escapeHtml(task.assigned_user)}</span>` : ""}
      ${task.attachments?.length ? `<span class="pill">${task.attachments.length} attachment${task.attachments.length === 1 ? "" : "s"}</span>` : ""}
    </div>
    ${task.next_action ? `<p class="task-next-action">${escapeHtml(task.next_action)}</p>` : ""}
    ${taskAttachmentThumbs(task)}
  </article>`;
}

function taskSummaryButton(label, value, filter) {
  return `<button class="task-summary-card" data-task-summary-filter="${filter}" type="button">
    <span>${escapeHtml(label)}</span>
    <strong>${value}</strong>
  </button>`;
}

function taskStats(tasks = state.tasks) {
  ensureTaskShape();
  return {
    today: tasks.filter((task) => taskDueLevel(task) === "today").length,
    upcoming: tasks.filter((task) => taskDueLevel(task) === "upcoming").length,
    overdue: tasks.filter((task) => taskDueLevel(task) === "overdue").length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    unassigned: tasks.filter((task) => !task.account_id && !task.account_name).length,
    open: tasks.filter((task) => !["Completed", "Cancelled"].includes(task.status)).length,
  };
}

function renderTasks() {
  applyLayout("tasksList", "tasks");
  const stats = taskStats();
  byId("taskSummaryStrip").innerHTML = [
    taskSummaryButton("Today", stats.today, "today"),
    taskSummaryButton("Upcoming", stats.upcoming, "upcoming"),
    taskSummaryButton("Overdue", stats.overdue, "overdue"),
    taskSummaryButton("Completed", stats.completed, "completed"),
    taskSummaryButton("Unassigned", stats.unassigned, "unassigned"),
  ].join("");
  const tasks = filteredTasks();
  byId("tasksList").innerHTML = listWrap(
    tasks,
    taskCard,
    "No tasks match this view.",
    state.layouts.tasks === "kanban" ? (task) => task.status || "Open" : null,
    taskStatuses
  );
}

function normalizedPunchList(list) {
  const now = new Date().toISOString();
  return {
    punch_list_id: list.punch_list_id || `punch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    project_id: list.project_id || "",
    project_name: list.project_name || "",
    client_name: list.client_name || "",
    title: list.title || "Running Punch List",
    list_type: list.list_type || "Roofing Project",
    status: list.status || "Running Punch List",
    assigned_contractor: list.assigned_contractor || "",
    due_date: list.due_date || toDateInput(addDays(new Date(), 7)),
    reviewer: list.reviewer || taskDefaultAssignedUser(),
    sent_at: list.sent_at || "",
    closed_at: list.closed_at || "",
    closeout: list.closeout || {},
    items: Array.isArray(list.items) ? list.items.map(normalizedPunchItem) : [],
    audit_log: Array.isArray(list.audit_log) ? list.audit_log : [],
    created_at: list.created_at || now,
    updated_at: list.updated_at || now,
  };
}

function normalizedPunchItem(item) {
  const now = new Date().toISOString();
  return {
    punch_item_id: item.punch_item_id || `punch-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    item_number: item.item_number || "",
    roof_area: item.roof_area || "",
    section: item.section || "",
    location: item.location || "",
    category: item.category || "Other",
    severity: item.severity || "Leak Risk",
    description: item.description || "",
    required_correction: item.required_correction || "",
    assigned_contractor: item.assigned_contractor || "",
    due_date: item.due_date || "",
    status: item.status || "Open",
    reviewer_notes: item.reviewer_notes || "",
    contractor_notes: item.contractor_notes || "",
    water_test_status: item.water_test_status || "Not Required",
    rejected_reason: item.rejected_reason || "",
    original_photos: Array.isArray(item.original_photos) ? item.original_photos : [],
    contractor_completion_photos: Array.isArray(item.contractor_completion_photos) ? item.contractor_completion_photos : [],
    annotations: Array.isArray(item.annotations) ? item.annotations : [],
    audit_log: Array.isArray(item.audit_log) ? item.audit_log : [],
    approved_by: item.approved_by || "",
    approved_at: item.approved_at || "",
    created_at: item.created_at || now,
    updated_at: item.updated_at || now,
  };
}

function ensurePunchShape() {
  let changed = false;
  state.punchLists = state.punchLists.map((list) => {
    const normalized = normalizedPunchList(list);
    if (JSON.stringify(normalized) !== JSON.stringify(list)) changed = true;
    return normalized;
  });
  if (changed) savePunchLists();
}

function findPunchList(id) {
  ensurePunchShape();
  return state.punchLists.find((list) => list.punch_list_id === id);
}

function punchSearchText(list) {
  return [
    list.title,
    list.project_name,
    list.client_name,
    list.status,
    list.assigned_contractor,
    list.reviewer,
    ...(list.items || []).flatMap((item) => [item.roof_area, item.section, item.location, item.category, item.severity, item.description, item.required_correction, item.status]),
  ].join(" ");
}

function punchDueLevel(list) {
  const key = dateKeyFromValue(list.due_date);
  const todayKey = toLocalDateKey(new Date());
  if (!key || ["Approved", "Closed"].includes(list.status)) return "none";
  if (key < todayKey) return "overdue";
  if (key === todayKey) return "today";
  return "upcoming";
}

function punchProjectOptions() {
  return [
    { value: "", label: "Choose project" },
    ...cleanProjects().map((project) => ({ value: project.id, label: [project.projectName || project.client, project.client].filter(Boolean).join(" | ") })),
  ];
}

function punchStats(lists = state.punchLists) {
  ensurePunchShape();
  const items = lists.flatMap((list) => list.items || []);
  const contractorItems = items.filter((item) => ["Pending Contractor Response", "Submitted for Review", "Approved", "Rejected", "Needs Additional Correction", "Closed"].includes(item.status));
  const approvedOrClosed = contractorItems.filter((item) => ["Approved", "Closed"].includes(item.status)).length;
  return {
    open: items.filter((item) => !["Approved", "Closed"].includes(item.status)).length,
    overdue: lists.filter((list) => punchDueLevel(list) === "overdue").length,
    review: items.filter((item) => item.status === "Submitted for Review").length,
    completion: contractorItems.length ? Math.round((approvedOrClosed / contractorItems.length) * 100) : 0,
    closeout: lists.filter((list) => list.status === "Approved" || list.status === "Closed").length,
  };
}

function punchFilterMatch(list) {
  const search = normalize([state.search, state.filters.punchSearch].filter(Boolean).join(" "));
  const items = list.items || [];
  return (
    (!search || normalize(punchSearchText(list)).includes(search)) &&
    (state.filters.punchProject === "All projects" || list.project_name === state.filters.punchProject) &&
    (state.filters.punchContractor === "All contractors" || list.assigned_contractor === state.filters.punchContractor || items.some((item) => item.assigned_contractor === state.filters.punchContractor)) &&
    (state.filters.punchStatus === "All statuses" || list.status === state.filters.punchStatus || items.some((item) => item.status === state.filters.punchStatus)) &&
    (state.filters.punchSeverity === "All severities" || items.some((item) => item.severity === state.filters.punchSeverity)) &&
    (state.filters.punchCategory === "All categories" || items.some((item) => item.category === state.filters.punchCategory))
  );
}

function sortPunchLists(a, b) {
  const direction = state.filters.punchDirection;
  if (state.filters.punchSort === "dueDate") return compareDateValue(a.due_date, b.due_date, direction) || compareText(a.project_name, b.project_name);
  if (state.filters.punchSort === "project") return compareText(a.project_name, b.project_name, direction) || compareDateValue(a.updated_at, b.updated_at, "desc");
  if (state.filters.punchSort === "status") return compareNumber(punchListStatuses.indexOf(a.status), punchListStatuses.indexOf(b.status), direction) || compareText(a.project_name, b.project_name);
  if (state.filters.punchSort === "contractor") return compareText(a.assigned_contractor, b.assigned_contractor, direction) || compareDateValue(a.updated_at, b.updated_at, "desc");
  return compareDateValue(a.updated_at, b.updated_at, direction);
}

function filteredPunchLists() {
  ensurePunchShape();
  return state.punchLists.filter(punchFilterMatch).sort(sortPunchLists);
}

function punchSummaryButton(label, value, filterKey, filterValue) {
  return `<button class="task-summary-card punch-summary-card" data-punch-summary-key="${filterKey}" data-punch-summary-value="${escapeHtml(filterValue)}" type="button">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </button>`;
}

function punchItemStatusClass(value) {
  return `punch-status-${normalize(value || "open").replaceAll(" ", "-").replaceAll("/", "")}`;
}

function punchSeverityClass(value) {
  return `punch-severity-${normalize(value || "cleanup").replaceAll(" ", "-")}`;
}

function punchFileThumbs(files = []) {
  if (!files.length) return "";
  return `<div class="task-thumbs">${files
    .slice(0, 3)
    .map((file) => String(file.file_type || "").startsWith("image/") ? `<img src="${file.dataUrl || file.url || file.thumbnail_url}" alt="${escapeHtml(file.file_name || "Punch photo")}" />` : `<span>${escapeHtml((file.file_name || "File").split(".").pop()?.toUpperCase() || "FILE")}</span>`)
    .join("")}${files.length > 3 ? `<span>+${files.length - 3}</span>` : ""}</div>`;
}

function punchListCard(list) {
  const items = list.items || [];
  const dueLevel = punchDueLevel(list);
  const approved = items.filter((item) => ["Approved", "Closed"].includes(item.status)).length;
  return `<article class="record-card punch-card ${dueLevel}" data-type="punchList" data-id="${escapeHtml(list.punch_list_id)}" draggable="true">
    <div class="record-topline">
      <span class="pill ${punchItemStatusClass(list.status)}">${escapeHtml(list.status)}</span>
      <span class="pill">${items.length} item${items.length === 1 ? "" : "s"}</span>
    </div>
    <h3>${escapeHtml(list.title)}</h3>
    <p>${escapeHtml([list.project_name, list.client_name].filter(Boolean).join(" | "))}</p>
    <div class="card-meta">
      <span class="pill">${escapeHtml(list.list_type)}</span>
      ${list.assigned_contractor ? `<span class="pill">${escapeHtml(list.assigned_contractor)}</span>` : ""}
      ${list.due_date ? `<span class="pill task-due-${dueLevel}">Due ${escapeHtml(compactDate(list.due_date))}</span>` : ""}
      <span class="pill">${approved}/${items.length || 0} approved</span>
    </div>
    ${punchFileThumbs(items.flatMap((item) => item.original_photos || []).slice(0, 4))}
  </article>`;
}

function renderPunchLists() {
  applyLayout("punchListBoard", "punchLists");
  const stats = punchStats();
  byId("punchSummaryStrip").innerHTML = [
    punchSummaryButton("Open Punch Items", stats.open, "punchStatus", "All statuses"),
    punchSummaryButton("Overdue Items", stats.overdue, "punchSort", "dueDate"),
    punchSummaryButton("Pending Review", stats.review, "punchStatus", "Submitted for Review"),
    punchSummaryButton("Contractor Completion", `${stats.completion}%`, "punchStatus", "All statuses"),
    punchSummaryButton("Final Approval Queue", stats.closeout, "punchStatus", "Approved"),
  ].join("");
  const lists = filteredPunchLists();
  byId("punchListBoard").innerHTML = listWrap(
    lists,
    punchListCard,
    "No punch lists match this view.",
    state.layouts.punchLists === "kanban" ? (list) => list.status : null,
    punchListStatuses
  );
}

function renderPunchCloseoutChecks(closeout = {}) {
  byId("punchCloseoutChecks").innerHTML = punchCloseoutChecks
    .map((label) => `<label class="checkline"><input type="checkbox" name="closeout_${normalize(label).replaceAll(" ", "_")}" ${closeout[label] ? "checked" : ""} /> ${escapeHtml(label)}</label>`)
    .join("");
}

function resetPunchListForm(projectId = "") {
  const form = byId("punchListForm");
  form.reset();
  state.punchDraftFiles = { before: [], after: [] };
  fillSelect("punchProjectInput", punchProjectOptions(), projectId);
  fillSelect("punchTypeInput", punchListTypes, "Roofing Project");
  fillSelect("punchListStatusInput", punchListStatuses, "Running Punch List");
  fillSelect("punchAssignedContractorInput", ["", ...contractorNames()], "");
  fillSelect("punchCategoryInput", punchCategories, "Other");
  fillSelect("punchSeverityInput", punchSeverities, "Leak Risk");
  fillSelect("punchItemStatusInput", punchItemStatuses, "Open");
  fillSelect("punchWaterStatusInput", punchWaterStatuses, "Not Required");
  byId("punchListIdInput").value = "";
  byId("punchItemIdInput").value = "";
  byId("punchItemNumberInput").value = "1";
  byId("punchDueDateInput").value = toDateInput(addDays(new Date(), 7));
  byId("punchReviewerInput").value = taskDefaultAssignedUser();
  byId("punchListDialogTitle").textContent = "New Punch List";
  const existingPanel = byId("punchExistingItemsPanel");
  if (existingPanel) existingPanel.hidden = true;
  renderPunchCloseoutChecks();
  renderPunchDraftPreview("before");
  renderPunchDraftPreview("after");
  syncPunchProjectDefaults();
}

function renderPunchExistingItems(list) {
  const panel = byId("punchExistingItemsPanel");
  const countEl = byId("punchExistingItemsCount");
  const listEl = byId("punchExistingItemsList");
  if (!panel || !list || !list.items || list.items.length === 0) {
    if (panel) panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (countEl) countEl.textContent = `(${list.items.length} item${list.items.length === 1 ? "" : "s"})`;
  if (listEl) {
    listEl.innerHTML = list.items.map((item) => `
      <div class="punch-mini-item">
        <strong>Item ${escapeHtml(String(item.item_number || ""))} — ${escapeHtml(item.category || "Punch Item")}</strong>
        <span class="pill ${punchItemStatusClass(item.status)}">${escapeHtml(item.status || "Open")}</span>
        <span>${escapeHtml([item.roof_area, item.location].filter(Boolean).join(" | ") || "No location entered")}</span>
        <small>${escapeHtml(item.description || "No description")}</small>
      </div>`).join("");
  }
}

function buildContractorOptionsForProject(project, selected = "") {
  const el = byId("punchAssignedContractorInput");
  if (!el) return;
  el.innerHTML = '<option value="">— No contractor assigned —</option>';
  const projectContractors = [];
  if (project?.awardedContractor) projectContractors.push(project.awardedContractor);
  splitContractors(project?.biddingContractors).forEach((name) => {
    if (!projectContractors.includes(name)) projectContractors.push(name);
  });
  if (projectContractors.length) {
    const g1 = document.createElement("optgroup");
    g1.label = "Project Contractors";
    projectContractors.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name + (project.awardedContractor === name ? " (Awarded)" : "");
      g1.appendChild(opt);
    });
    el.appendChild(g1);
  }
  const others = contractorNames().filter((name) => !projectContractors.includes(name));
  if (others.length) {
    const g2 = document.createElement("optgroup");
    g2.label = "All Contractors";
    others.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      g2.appendChild(opt);
    });
    el.appendChild(g2);
  }
  if (selected) el.value = selected;
  else if (project?.awardedContractor) el.value = project.awardedContractor;
  else if (projectContractors.length) el.value = projectContractors[0];
}

function openPunchListDialog(id = "", projectId = "", addItem = false) {
  resetPunchListForm(projectId);
  const list = id ? findPunchList(id) : null;
  if (list) {
    const first = addItem ? {} : list.items?.[0] || {};
    byId("punchListDialogTitle").textContent = addItem ? `Add Punch Item (Item ${(list.items?.length || 0) + 1})` : "Edit Punch List";
    byId("punchListIdInput").value = list.punch_list_id;
    fillSelect("punchProjectInput", punchProjectOptions(), list.project_id);
    byId("punchTitleInput").value = list.title || "";
    fillSelect("punchTypeInput", punchListTypes, list.list_type);
    fillSelect("punchListStatusInput", punchListStatuses, list.status);
    byId("punchDueDateInput").value = dateKeyFromValue(list.due_date) || "";
    byId("punchReviewerInput").value = list.reviewer || "";
    byId("punchItemIdInput").value = first.punch_item_id || "";
    byId("punchItemNumberInput").value = first.item_number || (addItem ? String((list.items?.length || 0) + 1) : "1");
    byId("punchListForm").elements.roof_area.value = first.roof_area || "";
    byId("punchListForm").elements.section.value = first.section || "";
    byId("punchListForm").elements.location.value = first.location || "";
    fillSelect("punchCategoryInput", punchCategories, first.category || "Other");
    fillSelect("punchSeverityInput", punchSeverities, first.severity || "Leak Risk");
    fillSelect("punchItemStatusInput", punchItemStatuses, first.status || "Open");
    fillSelect("punchWaterStatusInput", punchWaterStatuses, first.water_test_status || "Not Required");
    byId("punchListForm").elements.description.value = first.description || "";
    byId("punchListForm").elements.required_correction.value = first.required_correction || "";
    byId("punchListForm").elements.reviewer_notes.value = first.reviewer_notes || "";
    byId("punchListForm").elements.contractor_notes.value = first.contractor_notes || "";
    renderPunchCloseoutChecks(list.closeout);
    renderPunchDraftPreview("before", addItem ? [] : first.original_photos || []);
    renderPunchDraftPreview("after", addItem ? [] : first.contractor_completion_photos || []);
    const project = findRecord("project", list.project_id);
    buildContractorOptionsForProject(project, list.assigned_contractor);
    renderPunchExistingItems(addItem ? list : (list.items?.length > 1 ? list : null));
  }
  openDialog("punchListDialog");
}

function syncPunchProjectDefaults() {
  const project = findRecord("project", byId("punchProjectInput")?.value);
  if (!project) return;
  if (!byId("punchTitleInput").value) byId("punchTitleInput").value = `${project.projectName || project.client || "Project"} Punch List`;
  buildContractorOptionsForProject(project);
}

async function addPunchDraftFiles(kind, files) {
  if (!files?.length) return;
  if (!confirmLargeLocalFiles(files, `${kind} punch photos`)) return;
  for (const file of [...files]) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    state.punchDraftFiles[kind].push({
      attachment_id: `punch-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      upload_date: new Date().toISOString(),
      thumbnail_url: String(file.type || "").startsWith("image/") ? dataUrl : "",
      dataUrl,
      size: file.size,
    });
  }
  renderPunchDraftPreview(kind);
}

function renderPunchDraftPreview(kind, existing = []) {
  const target = byId(kind === "before" ? "punchBeforePreview" : "punchAfterPreview");
  if (!target) return;
  const files = [...existing, ...(state.punchDraftFiles?.[kind] || [])];
  target.innerHTML = files.length
    ? files.map((file) => `<div class="task-attachment-chip">${String(file.file_type || "").startsWith("image/") ? `<img src="${file.dataUrl || file.thumbnail_url}" alt="${escapeHtml(file.file_name || "Punch photo")}" />` : `<span>${escapeHtml((file.file_name || "File").split(".").pop()?.toUpperCase() || "FILE")}</span>`}<strong>${escapeHtml(file.file_name || "File")}</strong><small>${fileSizeLabel(file.size)}</small></div>`).join("")
    : `<p class="empty-state">No ${kind} photos yet.</p>`;
}

function savePunchListFromForm(formEl) {
  const form = new FormData(formEl);
  const project = findRecord("project", form.get("project_id"));
  if (!project) return alert("Choose a project first.");
  const id = form.get("punch_list_id") || `punch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const existing = findPunchList(id);
  const now = new Date().toISOString();
  const submittedItemId = form.get("punch_item_id");
  const existingItem = submittedItemId ? existing?.items?.find((item) => item.punch_item_id === submittedItemId) : null;
  const itemId = submittedItemId || `punch-item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const closeout = {};
  punchCloseoutChecks.forEach((label) => {
    closeout[label] = Boolean(form.get(`closeout_${normalize(label).replaceAll(" ", "_")}`));
  });
  const item = normalizedPunchItem({
    ...(existingItem || {}),
    punch_item_id: itemId,
    item_number: form.get("item_number") || existingItem?.item_number || String((existing?.items?.length || 0) + 1),
    roof_area: form.get("roof_area") || "",
    section: form.get("section") || "",
    location: form.get("location") || "",
    category: form.get("category") || "Other",
    severity: form.get("severity") || "Leak Risk",
    description: form.get("description") || "",
    required_correction: form.get("required_correction") || "",
    assigned_contractor: form.get("assigned_contractor") || "",
    due_date: form.get("due_date") || "",
    status: form.get("item_status") || "Open",
    reviewer_notes: form.get("reviewer_notes") || "",
    contractor_notes: form.get("contractor_notes") || "",
    water_test_status: form.get("water_test_status") || "Not Required",
    original_photos: [...(existingItem?.original_photos || []), ...(state.punchDraftFiles.before || [])],
    contractor_completion_photos: [...(existingItem?.contractor_completion_photos || []), ...(state.punchDraftFiles.after || [])],
    updated_at: now,
  });
  const list = normalizedPunchList({
    ...(existing || {}),
    punch_list_id: id,
    project_id: project.id,
    project_name: project.projectName || project.client || "",
    client_name: project.client || "",
    title: form.get("title") || `${project.projectName || project.client || "Project"} Punch List`,
    list_type: form.get("list_type") || "Roofing Project",
    status: form.get("list_status") || "Running Punch List",
    assigned_contractor: form.get("assigned_contractor") || "",
    due_date: form.get("due_date") || "",
    reviewer: form.get("reviewer") || taskDefaultAssignedUser(),
    closeout,
    items: existing?.items?.length
      ? existingItem
        ? existing.items.map((existingListItem) => (existingListItem.punch_item_id === itemId ? item : existingListItem))
        : [...existing.items, item]
      : [item],
    audit_log: [...(existing?.audit_log || []), { action: existing ? "Updated punch list" : "Created punch list", user: taskDefaultAssignedUser(), created_at: now }],
    created_at: existing?.created_at || now,
    updated_at: now,
  });
  if (!item.description && !item.required_correction) return alert("Add a punch item issue or required correction first.");
  if (existing) state.punchLists = state.punchLists.map((existingList) => (existingList.punch_list_id === id ? list : existingList));
  else state.punchLists.unshift(list);
  state.punchDraftFiles = { before: [], after: [] };
  savePunchLists();
  if (state.punchKeepOpen) {
    state.punchKeepOpen = false;
    openPunchListDialog(list.punch_list_id, "", true);
    return;
  }
  byId("punchListDialog").close();
  renderFilters();
  render();
  showPunchListDetail(list);
}

function punchAudit(list, action, note = "") {
  list.audit_log = [...(list.audit_log || []), { action, note, user: taskDefaultAssignedUser(), created_at: new Date().toISOString() }];
}

function updatePunchItemStatus(listId, itemId, status, note = "") {
  const list = findPunchList(listId);
  const item = list?.items?.find((entry) => entry.punch_item_id === itemId);
  if (!list || !item) return;
  if (status === "Submitted for Review" && !(item.contractor_completion_photos || []).length) return alert("Completion photo required before submitting this punch item for review.");
  if (status === "Rejected" || status === "Needs Additional Correction") {
    const reason = prompt("Rejection reason or correction note:", note || punchRejectionReasons[0]);
    if (reason === null) return;
    item.rejected_reason = reason;
    item.reviewer_notes = [item.reviewer_notes, reason].filter(Boolean).join("\n");
  }
  item.status = status;
  item.updated_at = new Date().toISOString();
  if (status === "Approved") {
    item.approved_by = taskDefaultAssignedUser();
    item.approved_at = new Date().toISOString();
  }
  const allApproved = list.items.every((entry) => ["Approved", "Closed"].includes(entry.status));
  if (allApproved && list.items.length) list.status = "Approved";
  else if (status === "Submitted for Review") list.status = "Contractor Submitted";
  else if (status === "Rejected" || status === "Needs Additional Correction") list.status = "Rejected / Needs Correction";
  else if (status === "Pending Contractor Response") list.status = "Sent to Contractor";
  list.updated_at = new Date().toISOString();
  punchAudit(list, `Item ${item.item_number || ""} marked ${status}`, note);
  savePunchLists();
  renderFilters();
  render();
  showPunchListDetail(list);
}

function punchItemReviewCard(list, item) {
  return `<article class="punch-review-card">
    <div class="punch-review-head">
      <div>
        <h4>Item ${escapeHtml(item.item_number || "")}: ${escapeHtml(item.category || "Punch Item")}</h4>
        <p>${escapeHtml([item.roof_area, item.section, item.location].filter(Boolean).join(" | ") || "No location entered")}</p>
      </div>
      <div class="card-meta">
        <span class="pill ${punchSeverityClass(item.severity)}">${escapeHtml(item.severity)}</span>
        <span class="pill ${punchItemStatusClass(item.status)}">${escapeHtml(item.status)}</span>
      </div>
    </div>
    <div class="punch-comparison">
      <section>
        <span class="eyebrow">Original Issue</span>
        <p>${escapeHtml(item.description || "No issue description.")}</p>
        <strong>Required Correction</strong>
        <p>${escapeHtml(item.required_correction || "No correction entered.")}</p>
        ${punchFileThumbs(item.original_photos)}
      </section>
      <section>
        <span class="eyebrow">Contractor Correction</span>
        <p>${escapeHtml(item.contractor_notes || "No contractor notes yet.")}</p>
        ${punchFileThumbs(item.contractor_completion_photos)}
        <p><strong>Verification:</strong> ${escapeHtml(item.water_test_status || "Not Required")}</p>
      </section>
    </div>
    ${item.rejected_reason ? `<p class="punch-rejection-note">${escapeHtml(item.rejected_reason)}</p>` : ""}
    <div class="mini-actions">
      <button class="mini-button" data-submit-punch-item="${escapeHtml(item.punch_item_id)}" data-punch-list="${escapeHtml(list.punch_list_id)}" type="button">Submit for Review</button>
      <button class="mini-button" data-approve-punch-item="${escapeHtml(item.punch_item_id)}" data-punch-list="${escapeHtml(list.punch_list_id)}" type="button">Approve</button>
      <button class="mini-button" data-request-correction="${escapeHtml(item.punch_item_id)}" data-punch-list="${escapeHtml(list.punch_list_id)}" type="button">Request Correction</button>
      <button class="mini-button danger-mini" data-reject-punch-item="${escapeHtml(item.punch_item_id)}" data-punch-list="${escapeHtml(list.punch_list_id)}" type="button">Reject</button>
    </div>
  </article>`;
}

function punchCloseoutSection(list) {
  return `<section class="detail-section">
    <h4>Closeout Checklist</h4>
    <div class="checklist-grid">${punchCloseoutChecks
      .map((label) => `<label class="checkline"><input type="checkbox" data-punch-closeout="${escapeHtml(label)}" data-punch-list="${escapeHtml(list.punch_list_id)}" ${list.closeout?.[label] ? "checked" : ""} /> ${escapeHtml(label)}</label>`)
      .join("")}</div>
  </section>`;
}

function punchContractorPacket(list) {
  const header = [
    `CONTRACTOR PUNCH LIST INSTRUCTIONS`,
    `═══════════════════════════════════`,
    `Punch List: ${list.title}`,
    `Project: ${list.project_name}`,
    `Client: ${list.client_name}`,
    `Contractor: ${list.assigned_contractor || "See project assignment"}`,
    `Due Date: ${compactDate(list.due_date) || "Not set"}`,
    `Reviewer: ${list.reviewer || "See project contact"}`,
    `Status: ${list.status}`,
    "",
    "INSTRUCTIONS: Correct each item below, take a clear after-photo showing the completed work, and return this packet with your completion notes. Warranty-critical and Leak Risk items require water test confirmation before submitting.",
    "",
    "─────────────────────────────────────",
    "PUNCH ITEMS",
    "─────────────────────────────────────",
  ];
  const items = (list.items || []).map((item, i) => [
    `ITEM ${item.item_number || i + 1}: ${item.category || "Punch Item"}`,
    `Location: ${[item.roof_area, item.section, item.location].filter(Boolean).join(" | ") || "Not specified"}`,
    `Severity: ${item.severity || ""}`,
    `Issue / Original Notes: ${item.description || "No description provided"}`,
    `Required Correction: ${item.required_correction || "See reviewer notes"}`,
    `Water Test / Verification: ${item.water_test_status || "Not Required"}`,
    item.reviewer_notes ? `Reviewer Notes: ${item.reviewer_notes}` : "",
    `Before Photos: ${(item.original_photos || []).length} photo(s) on file`,
    "",
    `CONTRACTOR COMPLETION NOTES (fill in):`,
    `Date Corrected: _______________`,
    `Work Performed: _______________________________________________`,
    `After Photos Attached: [ ] Yes  [ ] No`,
    `Contractor Signature: _______________`,
  ].filter(Boolean).join("\n"));
  const footer = [
    "─────────────────────────────────────",
    "CLOSEOUT CHECKLIST",
    "─────────────────────────────────────",
    ...Object.entries(list.closeout || {}).map(([label, checked]) => `[${checked ? "X" : " "}] ${label}`),
    "",
    "─────────────────────────────────────",
    `Generated by GRIP on ${new Date().toLocaleDateString()}`,
    `Note: A true fillable contractor portal requires future hosting.`,
  ];
  return [...header, ...items, ...footer].join("\n");
}

function exportPunchListPdf(list, ownerMode = false) {
  const style = `body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:13px}h1{color:#0057a8;margin:0 0 6px}h2{color:#0057a8;font-size:14px;margin:18px 0 4px}h3{font-size:13px;margin:8px 0 4px}p{margin:3px 0}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 16px;background:#f0f7ff;padding:12px;border-radius:6px;margin:10px 0}.item-box{border:1px solid #ccd9ea;border-radius:6px;margin:10px 0;padding:12px;break-inside:avoid}.item-head{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}.badge-open{background:#ffefc0;color:#7a4f00}.badge-approved{background:#d4f5e0;color:#0a5c2e}.badge-critical{background:#bd0808;color:#fff}.note-box{border:1px dashed #aaa;border-radius:4px;padding:8px;margin-top:6px;min-height:36px;font-style:italic;color:#555}.signature{margin-top:40px;border-top:1px solid #111;padding-top:8px;width:280px}.checklist{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px}.check-item{display:flex;gap:6px;align-items:center}.portal-note{background:#fffbe8;border:1px solid #e5d98a;border-radius:6px;padding:8px 12px;font-size:11px;color:#555;margin-top:12px}`;
  const closeoutHtml = Object.entries(list.closeout || {}).map(([label, checked]) =>
    `<div class="check-item"><span style="font-weight:700">[${checked ? "X" : " "}]</span> ${escapeHtml(label)}</div>`).join("");
  const rows = (list.items || []).map((item) => {
    const beforeThumbs = (item.original_photos || []).filter((f) => String(f.file_type || "").startsWith("image/")).slice(0, 3);
    const afterThumbs = (item.contractor_completion_photos || []).filter((f) => String(f.file_type || "").startsWith("image/")).slice(0, 3);
    const thumbRow = (files, label) => files.length ? `<p><strong>${label}:</strong></p><div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">${files.map((f) => `<img src="${f.dataUrl || f.thumbnail_url}" style="width:100px;height:70px;object-fit:cover;border-radius:4px;border:1px solid #ccc" alt="punch photo" />`).join("")}</div>` : `<p><strong>${label}:</strong> ${label === "Before Photos" ? (item.original_photos || []).length + " file(s) on file" : "None"}</p>`;
    return `<div class="item-box">
      <div class="item-head"><h3>Item ${escapeHtml(String(item.item_number || ""))}: ${escapeHtml(item.category || "Punch Item")}</h3>
      <span class="badge ${["Approved","Closed"].includes(item.status) ? "badge-approved" : ["Warranty Critical","Leak Risk","Safety Issue"].includes(item.severity) ? "badge-critical" : "badge-open"}">${escapeHtml(item.status || "")}</span></div>
      <p><strong>Location:</strong> ${escapeHtml([item.roof_area, item.section, item.location].filter(Boolean).join(" | ") || "Not specified")}</p>
      <p><strong>Severity:</strong> ${escapeHtml(item.severity || "")}</p>
      <p><strong>Issue:</strong> ${escapeHtml(item.description || "")}</p>
      <p><strong>Required Correction:</strong> ${escapeHtml(item.required_correction || "")}</p>
      <p><strong>Water Test:</strong> ${escapeHtml(item.water_test_status || "Not Required")}</p>
      ${ownerMode ? `<p><strong>Contractor Notes:</strong> ${escapeHtml(item.contractor_notes || "—")}</p>` : `<p><strong>Reviewer Notes:</strong> ${escapeHtml(item.reviewer_notes || "—")}</p><p><strong>Contractor Notes:</strong> ${escapeHtml(item.contractor_notes || "—")}</p>`}
      ${thumbRow(beforeThumbs, "Before Photos")}
      ${thumbRow(afterThumbs, "After Photos")}
      ${ownerMode ? "" : `<div class="note-box"><strong>Contractor Completion Notes:</strong><br>${escapeHtml(item.contractor_notes || "(contractor fills in)")}</div>`}
    </div>`;
  }).join("");
  const win = window.open("", "_blank");
  if (!win) return alert("Allow pop-ups to export the punch list report.");
  const title = ownerMode ? `Final Closeout — ${list.title}` : `Contractor Punch List — ${list.title}`;
  win.document.write(`<html><head><title>${escapeHtml(title)}</title><style>${style}</style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <p><strong>Project:</strong> ${escapeHtml(list.project_name)}</p>
      <p><strong>Client:</strong> ${escapeHtml(list.client_name)}</p>
      <p><strong>Contractor:</strong> ${escapeHtml(list.assigned_contractor || "—")}</p>
      <p><strong>Status:</strong> ${escapeHtml(list.status)}</p>
      <p><strong>Due:</strong> ${escapeHtml(compactDate(list.due_date) || "—")}</p>
      <p><strong>Reviewer:</strong> ${escapeHtml(list.reviewer || "—")}</p>
      <p><strong>Items:</strong> ${(list.items || []).length} total</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
    </div>
    <h2>Punch Items</h2>
    ${rows || "<p>No punch items recorded.</p>"}
    ${ownerMode ? `<h2>Closeout Checklist</h2><div class="checklist">${closeoutHtml}</div><div class="signature">Owner / Client Sign-Off: _______________________<br><small>${escapeHtml(list.project_name)} — ${new Date().toLocaleDateString()}</small></div>` : `<div class="portal-note">This is a contractor work packet. A true fillable portal requires future hosting.</div>`}
    <script>window.print();</script></body></html>`);
  win.document.close();
}

function showPunchListDetail(list) {
  setDetailsHidden(false);
  const stats = punchStats([list]);
  byId("detailContent").innerHTML = `
    <div class="detail-actions">
      <div>
        <h3>${escapeHtml(list.title)}</h3>
        <p>${escapeHtml([list.project_name, list.client_name].filter(Boolean).join(" | "))}</p>
      </div>
      <div class="detail-header-actions">
        <button class="edit-button" data-open-punch-dialog="${escapeHtml(list.punch_list_id)}" type="button">Edit</button>
      </div>
    </div>
    <div class="field-grid">
      ${field("Status", list.status)}
      ${field("Project", list.project_name)}
      ${field("Contractor", list.assigned_contractor)}
      ${field("Due Date", compactDate(list.due_date))}
      ${field("Reviewer", list.reviewer)}
      ${field("Open Items", stats.open)}
      ${field("Pending Review", stats.review)}
      ${field("Completion", `${stats.completion}%`)}
    </div>
    <section class="detail-section">
      <h4>Actions</h4>
      <div class="mini-actions">
        <button class="mini-button" data-add-punch-item="${escapeHtml(list.punch_list_id)}" type="button">+ Add Item</button>
        <button class="mini-button" data-generate-contractor-link="${escapeHtml(list.punch_list_id)}" type="button">🔗 Contractor Portal Link</button>
        <button class="mini-button" data-send-punch="${escapeHtml(list.punch_list_id)}" type="button">Copy Contractor Instructions</button>
        <button class="mini-button" data-export-punch="${escapeHtml(list.punch_list_id)}" type="button">Export Contractor Punch List</button>
        <button class="mini-button" data-export-owner-punch="${escapeHtml(list.punch_list_id)}" type="button">Export Final Closeout PDF</button>
      </div>
      <p class="punch-portal-note">${window.gripSync?.isConfigured() ? "Click <strong>Contractor Portal Link</strong> to generate a shareable link the contractor fills out on their phone." : "Sign in with Supabase to enable the contractor portal link. Use Export or Copy for local-only workflows."}</p>
    </section>
    <section class="detail-section">
      <h4>Side-by-Side Review</h4>
      ${(list.items || []).map((item) => punchItemReviewCard(list, item)).join("") || empty("No punch items yet.")}
    </section>
    ${punchCloseoutSection(list)}
    <section class="detail-section">
      <h4>Audit Trail</h4>
      ${(list.audit_log || []).length ? `<div class="timeline-list compact-timeline">${list.audit_log.map((entry) => `<div class="timeline-item"><div class="timeline-date"><strong>${compactDate(entry.created_at)}</strong></div><div class="timeline-body"><p>${escapeHtml(entry.action)}</p><small>${escapeHtml([entry.user, entry.note].filter(Boolean).join(" | "))}</small></div></div>`).join("")}</div>` : empty("No audit trail yet.")}
    </section>
    <section class="detail-section" id="contractorResponsesSection">
      <h4>Contractor Responses</h4>
      <div id="contractorResponsesList"><p class="muted-label">Loading…</p></div>
    </section>
    <section class="danger-zone"><button class="delete-button" data-delete-punch-list="${escapeHtml(list.punch_list_id)}" type="button">Delete Punch List</button></section>
  `;
  loadContractorResponses(list.punch_list_id);
  byId("detailDrawer").classList.add("is-open");
}

async function loadContractorResponses(punchListId) {
  const el = byId("contractorResponsesList");
  if (!el) return;
  if (!window.gripSync?.isConfigured()) {
    el.innerHTML = `<p class="muted-label">Enable cloud sync to receive contractor portal submissions.</p>`;
    return;
  }
  try {
    const submissions = await window.gripSync.loadContractorSubmissions(punchListId);
    if (!submissions.length) {
      el.innerHTML = `<p class="muted-label">No contractor responses yet.</p>`;
      return;
    }
    el.innerHTML = submissions.map((sub) => {
      const items = (sub.items || []).filter((i) => i.completion_notes);
      return `<div class="contractor-submission">
        <div class="contractor-submission-header">
          <span>${escapeHtml(sub.contractor_name || "Contractor")}</span>
          <span class="muted-label">${compactDate(sub.submitted_at)}</span>
        </div>
        ${sub.overall_notes ? `<p>${escapeHtml(sub.overall_notes)}</p>` : ""}
        ${items.map((i) => `<div class="contractor-submission-item">
          <strong>Item ${escapeHtml(String(i.item_number || ""))}:</strong> ${escapeHtml(i.completion_notes)}
          ${i.corrected ? `<span class="pill punch-status-approved">Confirmed</span>` : ""}
        </div>`).join("")}
      </div>`;
    }).join("");
  } catch (_) {
    el.innerHTML = `<p class="muted-label">Could not load contractor responses.</p>`;
  }
}

function projectPunchListSection(project) {
  const lists = state.punchLists.filter((list) => list.project_id === project.id);
  return `<section class="detail-section">
    <div class="modal-section-header">
      <h4>Punch Lists</h4>
      <button class="mini-button" data-open-punch-project="${escapeHtml(project.id)}" type="button">+ Punch List</button>
    </div>
    ${lists.length ? lists.map((list) => `<button class="related-item" data-open-punch-detail="${escapeHtml(list.punch_list_id)}" type="button"><strong>${escapeHtml(list.title)}</strong><span>${escapeHtml(list.status)} | ${list.items?.length || 0} item${list.items?.length === 1 ? "" : "s"}</span></button>`).join("") : empty("No punch lists for this project yet.")}
  </section>`;
}

function taskDashboardRows() {
  const stats = taskStats();
  return [
    metricRow("Today", stats.today, "tasks", "taskDue", "today"),
    metricRow("Overdue", stats.overdue, "tasks", "taskDue", "overdue"),
    metricRow("Upcoming", stats.upcoming, "tasks", "taskDue", "upcoming"),
    metricRow("Open Tasks", stats.open, "tasks", "taskStatus", "Open tasks"),
    metricRow("Unassigned", stats.unassigned, "tasks", "taskDue", "unassigned"),
  ];
}

function saveTaskFromForm(formEl) {
  const form = new FormData(formEl);
  const now = new Date().toISOString();
  let accountId = "";
  let accountName = "";
  const mode = form.get("accountMode") || "unassigned";
  if (mode === "existing") {
    const account = taskAccountByName(form.get("account_name"));
    accountId = account?.id || "";
    accountName = String(form.get("account_name") || "").trim();
  } else if (mode === "new") {
    accountName = String(form.get("newAccountName") || "").trim();
    if (accountName) {
      const account = taskAccountByName(accountName) || {
        id: `local-account-${Date.now()}`,
        sourceRow: "Local",
        createdAt: now,
        createdViaTask: true,
        action: "",
        nextStep: "",
        activity: new Date().toISOString(),
        client: accountName,
        entity: form.get("newAccountEntity") || "",
        county: form.get("newAccountCounty") || "",
        clientRanking: "Prospecting",
        sharedRep: "",
        nextFollowUp: "",
        poc: form.get("newAccountPoc") || "",
        title: "",
        phone: formatPhoneNumber(form.get("newAccountPhone")) || "",
        email: form.get("newAccountEmail") || "",
        address: "",
      };
      if (!taskAccountByName(accountName)) {
        savedCrm.accounts.push(account);
        data.accounts.push(account);
        saveCrm();
      }
      accountId = account.id;
    }
  }
  const project = findRecord("project", form.get("related_project_id"));
  const id = form.get("task_id") || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const existing = findTask(id);
  const status = form.get("status") || "Open";
  const task = normalizedTask({
    ...(existing || {}),
    task_id: id,
    title: String(form.get("title") || "").trim(),
    description: form.get("description") || "",
    account_id: accountId,
    account_name: accountName,
    related_project_id: project?.id || "",
    related_project_name: project?.projectName || "",
    due_date: form.get("due_date") || toLocalDateKey(new Date()),
    due_time: form.get("due_time") || "",
    priority: form.get("priority") || "Normal",
    task_type: form.get("task_type") || "Follow-Up",
    next_action: form.get("next_action") || "",
    reminder_settings: { type: form.get("reminder_type") || "None", custom: form.get("reminder_custom") || "" },
    recurring_settings: { type: form.get("recurring_type") || "None" },
    status,
    completed_outcome: form.get("completed_outcome") || existing?.completed_outcome || "",
    attachments: [...(existing?.attachments || []), ...state.taskDraftFiles],
    assigned_user: form.get("assigned_user") || taskDefaultAssignedUser(),
    created_at: existing?.created_at || now,
    updated_at: now,
    completed_at: status === "Completed" ? existing?.completed_at || now : "",
  });
  if (!task.title) return alert("Add a task title first.");
  if (existing) state.tasks = state.tasks.map((item) => (item.task_id === id ? task : item));
  else state.tasks.unshift(task);
  state.taskDraftFiles = [];
  saveTasks();
  renderFilters();
  render();
  showTaskDetail(task);
  byId("taskDialog").close();
}

function resetTaskForm(task = null) {
  const form = byId("taskForm");
  form.reset();
  state.taskDraftFiles = [];
  byId("taskDialogTitle").textContent = task ? "Edit Task" : "New Task";
  byId("taskIdInput").value = task?.task_id || "";
  form.elements.title.value = task?.title || "";
  form.elements.description.value = task?.description || "";
  form.elements.due_date.value = dateKeyFromValue(task?.due_date) || toLocalDateKey(new Date());
  form.elements.due_time.value = task?.due_time || "";
  form.elements.next_action.value = task?.next_action || "";
  form.elements.assigned_user.value = task?.assigned_user || taskDefaultAssignedUser();
  form.elements.completed_outcome.value = task?.completed_outcome || "";
  fillSelect("taskPriorityInput", taskPriorities, task?.priority || "Normal");
  fillSelect("taskTypeInput", taskTypes, task?.task_type || "Follow-Up");
  fillSelect("taskReminderInput", taskReminderTypes, task?.reminder_settings?.type || "None");
  fillSelect("taskRecurringInput", taskRecurringTypes, task?.recurring_settings?.type || "None");
  fillSelect("taskStatusInput", taskStatuses, task?.status || "Open");
  byId("taskNextActionOptions").innerHTML = taskNextActions.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  byId("taskOutcomeOptions").innerHTML = taskCompletedOutcomes.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  if (task?.account_name) {
    form.elements.accountMode.value = "existing";
    byId("taskAccountSearchInput").value = task.account_name;
  } else {
    form.elements.accountMode.value = "unassigned";
  }
  fillSelect("taskNewAccountEntity", ["", ...accountEntityOptions()], "");
  fillSelect("taskNewAccountCounty", ["", ...accountCountyOptions()], "");
  fillSelect("taskProjectInput", taskProjectOptions(task?.account_name), task?.related_project_id || "");
  syncTaskAccountMode();
  renderTaskAttachmentPreview(task?.attachments || []);
}

function openTaskDialog(taskId = "", prefillAccount = "") {
  resetTaskForm(taskId ? findTask(taskId) : null);
  if (prefillAccount && !taskId) {
    byId("taskForm").elements.accountMode.value = "existing";
    byId("taskAccountSearchInput").value = prefillAccount;
    syncTaskAccountMode();
  }
  openDialog("taskDialog");
  byId("taskTitleInput")?.focus();
}

function syncTaskAccountMode() {
  const mode = new FormData(byId("taskForm")).get("accountMode") || "unassigned";
  byId("taskForm").querySelector("[data-task-existing-account]").hidden = mode !== "existing";
  byId("taskForm").querySelector("[data-task-new-account]").hidden = mode !== "new";
}

function applyTaskTemplate(name) {
  const template = taskTemplates[name];
  if (!template) return;
  const form = byId("taskForm");
  form.elements.title.value = name;
  form.elements.description.value = template.description || "";
  byId("taskTypeInput").value = template.task_type || "Follow-Up";
  byId("taskPriorityInput").value = template.priority || "Normal";
  byId("taskNextActionInput").value = template.next_action || "";
}

function setTaskDueShortcut(value) {
  const input = byId("taskDueDateInput");
  if (value === "today") input.value = toLocalDateKey(new Date());
  else if (value === "tomorrow") input.value = toLocalDateKey(addDays(new Date(), 1));
  else if (value === "7") input.value = toLocalDateKey(addDays(new Date(), 7));
  else input.showPicker?.();
}

async function addTaskDraftFiles(files) {
  if (!files?.length) return;
  if (!confirmLargeLocalFiles(files, "task attachments")) return;
  for (const file of [...files]) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    state.taskDraftFiles.push({
      attachment_id: `task-attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      task_id: byId("taskIdInput").value || "",
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      upload_date: new Date().toISOString(),
      thumbnail_url: String(file.type || "").startsWith("image/") ? dataUrl : "",
      dataUrl,
      size: file.size,
    });
  }
  const existing = byId("taskIdInput").value ? findTask(byId("taskIdInput").value)?.attachments || [] : [];
  renderTaskAttachmentPreview([...existing, ...state.taskDraftFiles]);
}

function renderTaskAttachmentPreview(files) {
  byId("taskAttachmentPreview").innerHTML = files?.length
    ? files
        .map(
          (file) => `<div class="task-attachment-chip">
            ${String(file.file_type || "").startsWith("image/") ? `<img src="${file.thumbnail_url || file.dataUrl}" alt="${escapeHtml(file.file_name || "Attachment")}" />` : `<span>FILE</span>`}
            <strong>${escapeHtml(file.file_name || "Attachment")}</strong>
            <small>${escapeHtml(file.file_type || "")} ${file.size ? `| ${fileSizeLabel(file.size)}` : ""}</small>
          </div>`
        )
        .join("")
    : `<p class="empty-state">No task attachments yet.</p>`;
}

function completeTask(taskId, checked) {
  const task = findTask(taskId);
  if (!task) return;
  if (checked) {
    const outcome = prompt("Completed outcome", task.completed_outcome || "Spoke with Contact");
    task.status = "Completed";
    task.completed_outcome = String(outcome || task.completed_outcome || "").trim();
    task.completed_at = new Date().toISOString();
  } else {
    task.status = "Open";
    task.completed_at = "";
  }
  task.updated_at = new Date().toISOString();
  saveTasks();
  renderDashboard();
  renderTasks();
  showTaskDetail(task);
}

function showTaskDetail(task) {
  if (!task) return;
  setDetailsHidden(false);
  const dueLevel = taskDueLevel(task);
  byId("detailContent").innerHTML = `
    <div class="detail-actions">
      <div>
        <h3>${escapeHtml(task.title || "Task")}</h3>
        <p>${escapeHtml([task.account_name || "Unassigned", taskDueLabel(task)].filter(Boolean).join(" | "))}</p>
      </div>
      <div class="detail-header-actions">
        <button class="edit-button" data-open-task-dialog="${escapeHtml(task.task_id)}" type="button">Edit</button>
      </div>
    </div>
    <div class="field-grid">
      ${field("Due Date", taskDueLabel(task))}
      ${field("Priority", task.priority)}
      ${field("Task Type", task.task_type)}
      ${field("Status", task.status)}
      ${field("Next Action", task.next_action)}
      ${field("Assigned User", task.assigned_user)}
      ${field("Reminder", [task.reminder_settings?.type, task.reminder_settings?.custom].filter(Boolean).join(" | "))}
      ${field("Recurring", task.recurring_settings?.type)}
      ${field("Completed Outcome", task.completed_outcome)}
    </div>
    <section class="detail-section task-detail-status ${dueLevel}">
      <h4>Notes</h4>
      <p>${escapeHtml(task.description || "No task notes yet.")}</p>
    </section>
    <section class="detail-section">
      <h4>Attachments</h4>
      ${task.attachments?.length ? `<div class="file-list">${task.attachments.map((file) => `<div class="file-row">${file.dataUrl ? `<a href="${file.dataUrl}" download="${escapeHtml(file.file_name)}">${escapeHtml(file.file_name)}</a>` : escapeHtml(file.file_name)}</div>`).join("")}</div>` : `<p class="empty-state">No attachments.</p>`}
    </section>
    <section class="danger-zone"><button class="delete-button" data-delete-task="${escapeHtml(task.task_id)}" type="button">Delete Task</button></section>
  `;
  byId("detailDrawer").classList.add("is-open");
}

function compactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function calendarDateKey(value) {
  const key = dateKeyFromValue(value);
  if (key) return key;
  return toLocalDateKey(addDays(today, 1));
}

function calendarEndDateKey(startKey) {
  const start = new Date(`${startKey}T00:00:00`);
  return toLocalDateKey(addDays(start, 1));
}

function googleDate(value) {
  return String(value || "").replaceAll("-", "");
}

function quarterStartDate(value) {
  const match = String(value || "").match(/Q([1-4])\s+(\d{4})/i);
  if (!match) return "";
  const month = (Number(match[1]) - 1) * 3;
  return toLocalDateKey(new Date(Number(match[2]), month, 1));
}

function dayCode(day) {
  return { Monday: "MO", Tuesday: "TU", Wednesday: "WE", Thursday: "TH", Friday: "FR" }[day] || "MO";
}

function calendarText(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function calendarEventPayload(event) {
  return escapeHtml(JSON.stringify(event));
}

function googleCalendarUrl(event) {
  const start = calendarDateKey(event.startDate);
  const end = event.endDate || calendarEndDateKey(start);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "GRIP Reminder",
    dates: `${googleDate(start)}/${googleDate(end)}`,
    details: event.description || "",
    location: event.location || "",
  });
  if (event.recurrence) params.set("recur", event.recurrence);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsText(event) {
  const start = calendarDateKey(event.startDate);
  const end = event.endDate || calendarEndDateKey(start);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GRIP//Garland Relationship Intelligence Platform//EN",
    "BEGIN:VEVENT",
    `UID:${calendarText(event.uid || `grip-${Date.now()}@local`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${googleDate(start)}`,
    `DTEND;VALUE=DATE:${googleDate(end)}`,
    `SUMMARY:${calendarText(event.title || "GRIP Reminder")}`,
    event.description ? `DESCRIPTION:${calendarText(event.description)}` : "",
    event.location ? `LOCATION:${calendarText(event.location)}` : "",
    event.recurrence ? `RRULE:${event.recurrence.replace(/^RRULE:/, "")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function downloadCalendarIcs(event) {
  const blob = new Blob([icsText(event)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${normalize(event.title || "grip-reminder").replaceAll(" ", "-") || "grip-reminder"}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function calendarButtons(event, googleLabel = "Add to Calendar") {
  return `<div class="calendar-actions">
    <a class="mini-button" href="${escapeHtml(googleCalendarUrl(event))}" target="_blank" rel="noopener">${escapeHtml(googleLabel)}</a>
  </div>`;
}

function clientKey(record) {
  return normalize(record.client || record.cLIENT || "");
}

function relatedFor(client) {
  const key = normalize(client);
  return {
    accounts: cleanAccounts().filter((item) => clientKey(item) === key),
    projects: cleanProjects().filter((item) => clientKey(item) === key),
    proposals: cleanProposals().filter((item) => clientKey(item) === key),
    tasks: state.tasks.filter((t) => normalize(t.account_name || "") === key),
  };
}

function entityClass(value) {
  const entity = normalize(value);
  if (entity === "k 12") return "entity-k12";
  if (entity.includes("higher education")) return "entity-higher-ed";
  if (entity.includes("healthcare")) return "entity-healthcare";
  if (entity.includes("manufacturing")) return "entity-manufacturing";
  if (entity.includes("municipal")) return "entity-municipal";
  if (entity.includes("religious")) return "entity-religious";
  if (entity === "private") return "entity-private";
  if (entity.includes("private school")) return "entity-private-school";
  if (entity.includes("architect")) return "entity-architect";
  if (entity.includes("financial")) return "entity-financial";
  return "";
}

function rankClass(value) {
  const rank = normalize(value);
  if (rank === "dead end") return "rank-dead-end";
  if (rank.includes("job won") || rank.includes("job secured")) return "score-job";
  if (rank === "a") return "score-a";
  if (rank === "b") return "score-b";
  if (rank === "c") return "score-c";
  if (rank === "prospecting") return "stage-prospecting";
  if (rank.includes("pre bid")) return "stage-requested";
  if (rank.includes("contractors bidding")) return "stage-sent";
  if (rank.includes("bids reviewed")) return "stage-approved";
  if (rank.includes("project awarded")) return "stage-po";
  if (rank.includes("on hold")) return "stage-hold";
  if (rank.includes("a 90")) return "score-a";
  if (rank.includes("b 50")) return "score-b";
  if (rank.includes("c 25")) return "score-c";
  if (rank.includes("working on ramp")) return "stage-working";
  if (rank.includes("ramp budget")) return "stage-ramp";
  if (rank.includes("budget approved")) return "stage-budget";
  if (rank.includes("requested")) return "stage-requested";
  if (rank.includes("sent to client")) return "stage-sent";
  if (rank.includes("proposals approved")) return "stage-approved";
  if (rank.includes("po received")) return "stage-po";
  if (rank.includes("waiting contractor")) return "stage-waiting";
  if (rank.includes("material ordered")) return "stage-material";
  if (rank.includes("work scheduled")) return "stage-scheduled";
  if (rank.includes("work completed")) return "stage-completed";
  if (rank.includes("proposal rejected")) return "stage-rejected";
  if (rank.startsWith("a") || rank.includes("secured")) return "a";
  if (rank.startsWith("b") || rank.includes("approved")) return "b";
  if (rank.includes("rejected")) return "rejected";
  return "";
}

function stageRank(stage) {
  const stages = [...projectStages, ...proposalStages];
  const index = stages.findIndex((item) => normalize(item) === normalize(stage));
  return index === -1 ? stages.length + 1 : index;
}

function proposalStageRank(stage) {
  const index = proposalStages.findIndex((item) => normalize(item) === normalize(stage));
  return index === -1 ? proposalStages.length + 1 : index;
}

function isProposalRejectedStage(stage) {
  return normalize(stage) === "proposal rejected";
}

function compareProposalRejectedLast(a, b) {
  const aRejected = isProposalRejectedStage(a?.stage || a);
  const bRejected = isProposalRejectedStage(b?.stage || b);
  if (aRejected === bRejected) return 0;
  return aRejected ? 1 : -1;
}

function countBy(records, key) {
  return records.reduce((acc, record) => {
    const value = record[key] || "Unspecified";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function reminderRecords() {
  return [
    ...cleanAccounts().map((record) => ({ type: "account", id: record.id, title: record.client, date: record.nextFollowUp })),
    ...cleanProjects().map((record) => ({ type: "project", id: record.id, title: record.projectName || record.client, date: record.nextFollowUp })),
    ...cleanProposals().map((record) => ({ type: "proposal", id: record.id, title: record.project || record.client, date: record.nextFollowUp })),
  ].filter((item) => item.date);
}

function reminderRows(status) {
  const todayKey = toLocalDateKey(new Date());
  const soon = addDays(new Date(), 7);
  const rows = reminderRecords().filter((item) => {
    if (status === "overdue") return item.date < todayKey;
    if (status === "today") return item.date === todayKey;
    return item.date > todayKey && dateValue(item.date) <= soon.getTime();
  });
  return rows.length
    ? rows.slice(0, 6).map((item) => metricRow(`${compactDate(item.date)} - ${item.title}`, item.type, item.type === "account" ? "accounts" : `${item.type}s`, "search", item.title))
    : [metricRow(status === "overdue" ? "Overdue" : status === "today" ? "Due Today" : "Upcoming", 0, "dashboard")];
}

function openRecordStatus(record) {
  if (record.type === "account") return normalize(record.clientRanking) !== "dead end";
  if (record.type === "project") return !["work completed", "proposal rejected"].includes(normalize(record.stage));
  return !["work completed", "proposal rejected"].includes(normalize(record.stage));
}

function followUpQueueRecords() {
  const todayKey = toLocalDateKey(new Date());
  const soonKey = toLocalDateKey(addDays(new Date(), 7));
  const base = [
    ...cleanAccounts().map((record) => ({ type: "account", id: record.id, title: record.client, client: record.client, date: record.nextFollowUp, record })),
    ...cleanProjects().map((record) => ({ type: "project", id: record.id, title: record.projectName || record.client, client: record.client, date: record.nextFollowUp, record })),
    ...cleanProposals().map((record) => ({ type: "proposal", id: record.id, title: record.project || record.client, client: record.client, date: record.nextFollowUp, record })),
  ].filter((item) => openRecordStatus(item.record));
  return base
    .map((item) => {
      const urgency = !item.date ? "missing" : item.date < todayKey ? "overdue" : item.date === todayKey ? "today" : item.date <= soonKey ? "soon" : "later";
      const urgencyRank = { overdue: 0, today: 1, missing: 2, soon: 3, later: 4 }[urgency];
      return { ...item, urgency, urgencyRank };
    })
    .sort((a, b) => a.urgencyRank - b.urgencyRank || compareNumber(dateValue(a.date) || 9999999999999, dateValue(b.date) || 9999999999999) || compareText(a.title, b.title));
}

function contractorPerformance(contractor) {
  const proposals = contractor.proposals || contractorProposalRecords(contractor.companyName);
  const received = proposals.filter((proposal) =>
    splitContractors(proposal.bidsReceived).some((name) => normalize(name) === normalize(contractor.companyName))
  ).length;
  const opportunities = contractor.opportunities || proposals.length;
  const wins = contractor.wins || 0;
  const responseRate = opportunities ? Math.round((received / opportunities) * 100) : 0;
  const winRate = opportunities ? Math.round((wins / opportunities) * 100) : 0;
  const score = Math.round(responseRate * 0.55 + winRate * 0.45);
  return { responseRate, winRate, score, received };
}

function commandCenterCards() {
  const todayKey = toLocalDateKey(new Date());
  const queue = followUpQueueRecords();
  const dueToday = dueTodayProposals();
  const noActivity45 = cleanAccounts().filter((account) => normalize(account.clientRanking) !== "dead end" && accountActivityStatus(account).level === "red");
  const openProposals = cleanProposals().filter((proposal) => !["Work Completed", "Proposal Rejected"].includes(proposal.stage));
  const missingBids = openProposals.filter((proposal) => {
    const bidding = splitContractors(proposal.biddingContractors).length;
    const received = splitContractors(proposal.bidsReceived).length;
    return bidding > 0 && received < bidding;
  });
  return [
    commandCard("Today’s Calls", accountsForCallDay(todayCallDay()).length, "callList", "Open call list"),
    commandCard("Proposals Due Today", dueToday.length, "proposals", "Review bids"),
    commandCard("Follow-Ups Due", queue.filter((item) => ["overdue", "today"].includes(item.urgency)).length, "followUpQueue", "Work queue"),
    commandCard("Overdue Follow-Ups", queue.filter((item) => item.urgency === "overdue").length, "followUpQueue", "Work queue"),
    commandCard("No Next Step", queue.filter((item) => item.urgency === "missing").length, "followUpQueue", "Assign dates"),
    commandCard("No Activity 45+ Days", noActivity45.length, "accounts", "Reconnect"),
    commandCard("Missing Bids", missingBids.length, "proposals", "Track contractors"),
    backupReminderCard(),
  ];
}

function commandCard(label, value, view, hint) {
  return `<button class="command-row" data-dashboard-view="${view}" type="button">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(hint)}</small>
  </button>`;
}

function backupReminder() {
  const value = localStorage.getItem("garlandLastBackupAt");
  if (!value) return { value: "New", hint: "Download backup" };
  const savedAt = dateValue(value);
  if (!savedAt) return { value: "New", hint: "Download backup" };
  const days = Math.max(0, Math.floor((Date.now() - savedAt) / 86400000));
  if (days === 0) return { value: "Today", hint: "Backup saved" };
  return { value: `${days}d`, hint: days >= 7 ? "Backup due" : "Download backup" };
}

function backupReminderCard() {
  const backup = backupReminder();
  return `<button class="command-row command-row-backup" data-backup-now type="button">
    <span>Backup Now</span>
    <strong>${escapeHtml(backup.value)}</strong>
    <small>${escapeHtml(backup.hint)}</small>
  </button>`;
}

function commandCenterPanel() {
  return `<section class="command-panel">
    <div class="command-panel-header">
      <div>
        <p class="eyebrow">Daily command center</p>
        <h3>Today’s Focus</h3>
      </div>
      <button class="mini-button" data-dashboard-view="followUpQueue" type="button">Open Queue</button>
    </div>
    <div class="command-list">${commandCenterCards().join("")}</div>
  </section>`;
}

function weeklyReviewText() {
  const now = new Date();
  const weekStart = addDays(now, -6);
  const weekStartKey = toLocalDateKey(weekStart);
  const activities = allActivityRecords().filter((entry) => dateKeyFromValue(entry.createdAt) >= weekStartKey);
  const proposals = cleanProposals();
  const bidsReceived = proposals.reduce((sum, proposal) => sum + splitContractors(proposal.bidsReceived).length, 0);
  const won = proposals.filter((proposal) => proposal.stage === "Work Completed" || proposal.awardedContractor).length;
  const lost = proposals.filter((proposal) => proposal.stage === "Proposal Rejected").length;
  const open = proposals.filter((proposal) => !["Work Completed", "Proposal Rejected"].includes(proposal.stage)).length;
  const currentYearProjects = cleanProjects().filter((project) => projectYear(project) === now.getFullYear());
  return [
    `GRIP Weekly Review (${compactDate(weekStart)} - ${compactDate(now)})`,
    "",
    `Activities logged: ${activities.length}`,
    `Accounts touched: ${new Set(activities.map((entry) => entry.accountId)).size}`,
    `Open proposals: ${open}`,
    `Bids received tracked: ${bidsReceived}`,
    `Won/Awarded proposals: ${won}`,
    `Lost proposals: ${lost}`,
    `Projected materials this year: ${moneyWithCents.format(currentYearProjects.reduce((sum, project) => sum + projectMaterials(project), 0))}`,
    `Projected commission this year: ${moneyWithCents.format(currentYearProjects.reduce((sum, project) => sum + projectCommission(project), 0))}`,
    `Projected Wise Trophy this year: ${moneyWithCents.format(currentYearProjects.reduce((sum, project) => sum + projectWiseTotal(project), 0))}`,
    "",
    "Top follow-up queue:",
    ...followUpQueueRecords().slice(0, 8).map((item) => `- ${item.urgency.toUpperCase()}: ${item.title || item.client || item.type} (${item.type})${item.date ? ` due ${compactDate(item.date)}` : " with no next step"}`),
  ].join("\n");
}

function weeklyReviewKey(date = new Date()) {
  return `garlandWeeklyReviewShown-${toLocalDateKey(date)}`;
}

function showFridayWeeklyReviewDialog(force = false) {
  const now = new Date();
  if (!force && now.getDay() !== 5) return;
  const key = weeklyReviewKey(now);
  if (!force && localStorage.getItem(key)) return;
  const dialog = byId("weeklyReviewDialog");
  if (!dialog) return;
  byId("weeklyReviewContent").textContent = weeklyReviewText();
  localStorage.setItem(key, new Date().toISOString());
  openDialog(dialog);
}

function needsAttentionRows(proposals) {
  const open = proposals.filter((item) => !["Work Completed", "Proposal Rejected"].includes(item.stage));
  const stale = open.filter((proposal) => dateValue(proposal.bidDueDate) && Date.now() - dateValue(proposal.bidDueDate) > 60 * 86400000);
  const missingBids = open.filter((proposal) => {
    const bidding = splitContractors(proposal.biddingContractors).length;
    const received = splitContractors(proposal.bidsReceived).length;
    return bidding > 0 && received < bidding;
  });
  return [
    metricRow("Stale Proposals", stale.length, "proposals", "proposalBidStatus", "All bid statuses"),
    metricRow("Missing Contractor Bids", missingBids.length, "proposals", "proposalBidStatus", "Missing bids"),
    metricRow("Overdue Follow-ups", reminderRecords().filter((item) => item.date < toLocalDateKey(new Date())).length, "dashboard"),
  ];
}

function isOpenProposal(proposal) {
  return !["Work Completed", "Proposal Rejected"].includes(proposal.stage);
}

function proposalAgingStatus(proposal) {
  if (!isOpenProposal(proposal)) return "closed";
  const due = dateValue(proposal.bidDueDate);
  if (!due) return "missingDueDate";
  const todayKey = toLocalDateKey(new Date());
  const dueKey = dateKeyFromValue(proposal.bidDueDate);
  if (dueKey === todayKey) return "dueToday";
  if (due < dateValue(todayKey)) return Date.now() - due > 60 * 86400000 ? "stale60" : "overdue";
  if (due <= addDays(new Date(), 7).getTime()) return "dueThisWeek";
  return "upcoming";
}

function proposalAgingRows(proposals) {
  const open = proposals.filter(isOpenProposal);
  const rows = [
    ["Overdue", open.filter((proposal) => proposalAgingStatus(proposal) === "overdue").length, "overdue"],
    ["Due Today", open.filter((proposal) => proposalAgingStatus(proposal) === "dueToday").length, "dueToday"],
    ["Due This Week", open.filter((proposal) => proposalAgingStatus(proposal) === "dueThisWeek").length, "dueThisWeek"],
    ["Stale 60+ Days", open.filter((proposal) => proposalAgingStatus(proposal) === "stale60").length, "stale60"],
    ["Missing Due Date", open.filter((proposal) => proposalAgingStatus(proposal) === "missingDueDate").length, "missingDueDate"],
  ];
  return rows.map(([label, value, filter]) => metricRow(label, value, "proposals", "proposalAging", filter));
}

function dataQualityRows(accounts, projects, proposals, contractors) {
  return [
    metricRow("Accounts Missing Entity", accounts.filter((account) => !normalize(account.entity)).length, "accounts", "dataQuality", "accountMissingEntity"),
    metricRow("Accounts Missing County", accounts.filter((account) => !normalize(account.county)).length, "accounts", "dataQuality", "accountMissingCounty"),
    metricRow("Accounts Missing Phone or Email", accounts.filter((account) => !normalize(account.phone) || !normalize(account.email)).length, "accounts", "dataQuality", "accountMissingContact"),
    metricRow("Projects Missing Address", projects.filter((project) => !normalize(project.address)).length, "projects", "dataQuality", "projectMissingAddress"),
    metricRow("Proposals Missing Due Date", proposals.filter((proposal) => isOpenProposal(proposal) && !dateValue(proposal.bidDueDate)).length, "proposals", "dataQuality", "proposalMissingDueDate"),
    metricRow("Contractors Missing Email", contractors.filter((contractor) => !normalize(contractor.email)).length, "contractors", "dataQuality", "contractorMissingEmail"),
  ];
}

function recentActivityRows() {
  const records = allActivityRecords()
    .filter((item) => item.createdAt)
    .sort((a, b) => compareNumber(dateValue(a.createdAt), dateValue(b.createdAt), "desc"))
    .slice(0, 6);
  if (!records.length) return [metricRow("No Recent Activity", 0, "activityLog")];
  return records.map((item) =>
    metricRow(`${compactDate(item.createdAt)} - ${item.accountName || "Activity"}`, item.source || "Activity", "activityLog", "activityAccount", item.accountName || "All accounts")
  );
}

function dueTodayProposals() {
  const todayKey = toLocalDateKey(new Date());
  return cleanProposals()
    .filter((proposal) => !["Work Completed", "Proposal Rejected"].includes(proposal.stage))
    .filter((proposal) => dateKeyFromValue(proposal.bidDueDate) === todayKey)
    .sort((a, b) => compareText(a.client, b.client) || compareText(a.project, b.project));
}

function proposalBidCountSummary(proposal) {
  const bidding = splitContractors(proposal.biddingContractors);
  const received = splitContractors(proposal.bidsReceived).filter((contractor) =>
    bidding.some((bidder) => normalize(bidder) === normalize(contractor))
  );
  return { requested: bidding.length, received: new Set(received.map(normalize)).size };
}

function proposalDueTodayItem(proposal) {
  const counts = proposalBidCountSummary(proposal);
  return `<button class="due-today-item" data-due-today-proposal="${escapeHtml(proposal.id)}" type="button">
    <strong>${escapeHtml(proposal.project || proposal.client || "Proposal")}</strong>
    <span>${escapeHtml(proposal.client || "")}</span>
    <small>${counts.received}/${counts.requested} contractor bids received</small>
  </button>`;
}

function showDueTodayProposalDialog() {
  const dialog = byId("proposalDueTodayDialog");
  if (!dialog || dialog.open) return;
  const proposals = dueTodayProposals();
  if (!proposals.length) return;
  byId("proposalDueTodayList").innerHTML = proposals.map(proposalDueTodayItem).join("");
  openDialog(dialog);
}

function taskDailyAlertKey(date = new Date()) {
  return `garlandTaskDailyAlertShown-${toLocalDateKey(date)}`;
}

function openTasksDueToday() {
  state.filters.taskDue = "today";
  state.filters.taskStatus = "Open tasks";
  state.filters.taskSearch = "";
  byId("globalSearch").value = "";
  state.search = "";
  renderFilters();
  setView("tasks");
}

function taskCreatedIncompleteAccounts() {
  const required = ["entity", "county", "poc", "phone", "email", "address"];
  const todayKey = toLocalDateKey(new Date());
  return cleanAccounts()
    .filter((account) => account.createdViaTask && dateKeyFromValue(account.createdAt) && dateKeyFromValue(account.createdAt) < todayKey)
    .map((account) => {
      const missing = required.filter((key) => !String(account[key] || "").trim());
      return { account, missing };
    })
    .filter((item) => item.missing.length);
}

function showTaskDailyAlertDialog(force = false) {
  const dialog = byId("taskDailyAlertDialog");
  if (!dialog || dialog.open) return;
  if (!force && document.querySelector("dialog[open]")) return;
  const key = taskDailyAlertKey();
  if (!force && localStorage.getItem(key)) return;
  const todayTasks = state.tasks.filter((task) => taskDueLevel(task) === "today" && !["Completed", "Cancelled"].includes(task.status));
  const incompleteAccounts = taskCreatedIncompleteAccounts();
  if (!todayTasks.length && !incompleteAccounts.length) return;
  const taskLine = todayTasks.length
    ? `<button class="due-today-item" data-open-today-tasks type="button"><strong>${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} open today</strong><span>Open Tasks to work the list.</span></button>`
    : "";
  const accountLines = incompleteAccounts
    .map(
      ({ account, missing }) => `<button class="due-today-item" data-open-task-created-account="${escapeHtml(account.id)}" type="button">
        <strong>Finish updating ${escapeHtml(account.client || "new account")}</strong>
        <span>Missing: ${escapeHtml(missing.map((item) => item === "poc" ? "point of contact" : item).join(", "))}</span>
      </button>`
    )
    .join("");
  byId("taskDailyAlertContent").innerHTML = [taskLine, accountLines].filter(Boolean).join("");
  localStorage.setItem(key, new Date().toISOString());
  openDialog(dialog);
}

function renderDashboard() {
  const accounts = cleanAccounts();
  const projects = cleanProjects();
  const proposals = cleanProposals();
  const openProposals = proposals.filter((item) => !["Work Completed", "Proposal Rejected"].includes(item.stage));
  const staleProposals = openProposals.filter((proposal) => {
    const due = dateValue(proposal.bidDueDate);
    return due && Date.now() - due > 60 * 86400000;
  });
  const thisYear = today.getFullYear();
  const nextYear = thisYear + 1;
  const currentYearProjects = projects.filter((project) => projectYear(project) === thisYear);
  const nextYearProjects = projects.filter((project) => projectYear(project) === nextYear);
  const completedProjects = projects.filter((project) => project.stage === "Work Completed");
  const topContractors = contractorRecords();
  const thisYearMaterials = currentYearProjects.reduce((sum, project) => sum + projectMaterials(project), 0);
  const thisYearCommission = currentYearProjects.reduce((sum, project) => sum + projectCommission(project), 0);
  const thisYearWise = currentYearProjects.reduce((sum, project) => sum + projectWiseTotal(project), 0);
  const actualProjects = currentYearProjects.filter((project) => scoreRank(project.abcList) === 4);
  const actualProposals = proposals.filter((proposal) => proposal.stage === "Work Completed" && (!proposalYear(proposal) || proposalYear(proposal) === thisYear));
  const actualMaterials =
    actualProjects.reduce((sum, project) => sum + projectMaterials(project), 0) +
    actualProposals.reduce((sum, proposal) => sum + proposalMaterials(proposal), 0);
  const actualCommission =
    actualProjects.reduce((sum, project) => sum + projectCommission(project), 0) +
    actualProposals.reduce((sum, proposal) => sum + proposalCommission(proposal), 0);
  const actualWise =
    actualProjects.reduce((sum, project) => sum + projectWiseTotal(project), 0) +
    actualProposals.reduce((sum, proposal) => sum + proposalWiseTotal(proposal), 0);

  byId("commandCenter").innerHTML = commandCenterPanel();
  byId("dashboardGoals").innerHTML = [
    goalCard("Material Goal", thisYearMaterials, actualMaterials, Number(territorySettings.goals.material || 0)),
    goalCard("Commission Goal", thisYearCommission, actualCommission, Number(territorySettings.goals.commission || 0)),
    goalCard("Wise Trophy Goal", thisYearWise, actualWise, Number(territorySettings.goals.wise || 0)),
  ].join("");
  byId("quickFilters").innerHTML = [
    quickFilterButton("Open Proposals", "openProposals"),
  ].join("");

  byId("dashboardGrid").innerHTML = [
    dashboardPanel("Tasks", taskDashboardRows()),
    dashboardPanel("Follow-up Reminders", [...reminderRows("overdue"), ...reminderRows("today"), ...reminderRows("upcoming")]),
    dashboardPanel("Needs Attention", needsAttentionRows(proposals)),
    dashboardPanel("Data Quality", dataQualityRows(accounts, projects, proposals, contractorRecords())),
    dashboardPanel("Proposal Aging", proposalAgingRows(proposals)),
    dashboardPanel("Recently Updated", recentActivityRows()),
    dashboardPanel("Accounts by Entity", tableRows(countBy(accounts, "entity"), "accounts", "entity")),
    dashboardPanel("Account Activity Windows", [
      metricRow("Green", accounts.filter((account) => normalize(account.clientRanking) !== "dead end" && accountActivityStatus(account).level === "green").length, "accounts", "accountActivity", "green"),
      metricRow("Yellow", accounts.filter((account) => normalize(account.clientRanking) !== "dead end" && accountActivityStatus(account).level === "yellow").length, "accounts", "accountActivity", "yellow"),
      metricRow("Red", accounts.filter((account) => normalize(account.clientRanking) !== "dead end" && accountActivityStatus(account).level === "red").length, "accounts", "accountActivity", "red"),
    ]),
    dashboardPanel("Projects by ABC Score", [
      metricRow("A List", projects.filter((project) => scoreRank(project.abcList) === 3).length, "projects", "projectRank", "A (90%)"),
      metricRow("B List", projects.filter((project) => scoreRank(project.abcList) === 2).length, "projects", "projectRank", "B (50%)"),
      metricRow("C List", projects.filter((project) => scoreRank(project.abcList) === 1).length, "projects", "projectRank", "C (25%)"),
    ]),
    dashboardPanel(`Projects ${thisYear}`, projectMoneyRows(currentYearProjects, "projects", String(thisYear))),
    dashboardPanel(`Projects ${nextYear}`, projectMoneyRows(nextYearProjects, "projects", String(nextYear))),
    dashboardPanel("Projects Completed", [
      metricRow("Completed Count", completedProjects.length, "projects", "projectStage", "Work Completed"),
      metricRow("Completed Materials", moneyWithCents.format(completedProjects.reduce((sum, project) => sum + projectMaterials(project), 0)), "projects", "projectStage", "Work Completed"),
    ]),
    dashboardPanel("Proposal Health", [
      metricRow("Open Proposals", openProposals.length, "proposals"),
      metricRow("Stale Proposals", staleProposals.length, "proposals"),
    ]),
    dashboardPanel("Proposals by Client Type", tableRows(countBy(proposals.map((proposal) => ({ entity: proposalEntity(proposal) })), "entity"), "proposals")),
    dashboardPanel("Top 5 Contractors by Proposal Wins", topContractorRows(topContractors, "wins")),
    dashboardPanel("Top 5 Contractors by Proposal Opportunities", topContractorRows(topContractors, "opportunities")),
  ].join("");
}

function renderFollowUpQueue() {
  const records = followUpQueueRecords().filter((item) => {
    return (
      (state.filters.queueType === "all" || item.type === state.filters.queueType) &&
      (state.filters.queueUrgency === "all" || item.urgency === state.filters.queueUrgency) &&
      includesSearch({ title: item.title, client: item.client, type: item.type, urgency: item.urgency })
    );
  });
  byId("followUpQueueList").innerHTML = records.length ? records.map(followUpQueueItem).join("") : empty("No follow-ups match this queue.");
}

function followUpQueueItem(item) {
  const dateLabel = item.date ? compactDate(item.date) : "No next step";
  return `<article class="timeline-item follow-up-item ${item.urgency}" data-type="${item.type}" data-id="${escapeHtml(item.id)}">
    <div class="timeline-date">
      <strong>${escapeHtml(item.urgency.toUpperCase())}</strong>
      <span>${escapeHtml(dateLabel)}</span>
    </div>
    <div class="timeline-body">
      <h3>${escapeHtml(item.title || item.client || "Record")}</h3>
      <p>${escapeHtml([item.client, item.type].filter(Boolean).join(" • "))}</p>
      <div class="card-meta">
        <span class="pill ${dashboardColorClass(item.urgency)}">${escapeHtml(item.urgency)}</span>
        ${item.record?.stage ? `<span class="pill ${rankClass(item.record.stage)}">${escapeHtml(item.record.stage)}</span>` : ""}
        ${item.record?.clientRanking ? `<span class="pill ${rankClass(item.record.clientRanking)}">${escapeHtml(item.record.clientRanking)}</span>` : ""}
      </div>
    </div>
  </article>`;
}

function quickFilterButton(label, filter) {
  return `<button class="quick-filter" data-saved-filter="${filter}" type="button">${escapeHtml(label)}</button>`;
}

function goalCard(label, projected, actual, goal) {
  const percent = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0;
  return `<button class="goal-card" data-open-goal-settings type="button">
    <span>${escapeHtml(label)}</span>
    <div class="goal-values">
      <div>
        <small>Projected</small>
        <strong>${goalMoney(projected)}</strong>
      </div>
      <div>
        <small>Actual</small>
        <strong>${goalMoney(actual)}</strong>
      </div>
    </div>
    <small>${goal ? `${percent}% of ${goalMoney(goal)} actual` : "Set a goal"}</small>
    <div class="goal-bar"><i style="width:${percent}%"></i></div>
  </button>`;
}

function dashboardPanel(title, rows) {
  return `<section class="dashboard-card"><h3>${escapeHtml(title)}</h3><div class="dashboard-table">${rows.join("")}</div></section>`;
}

function metricRow(label, value, view, filterKey = "", filterValue = "") {
  return `<button class="dashboard-row ${dashboardColorClass(label)} ${entityClass(label)}" data-dashboard-view="${view}" data-dashboard-filter-key="${filterKey}" data-dashboard-filter-value="${escapeHtml(filterValue)}" type="button">
    <span${territoryPillStyle(filterKey === "county" ? "county" : "entity", label)}>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
  </button>`;
}

function dashboardColorClass(label) {
  const value = normalize(label);
  if (value.includes("green") || value.includes("a list") || value.includes("won") || value.includes("completed")) return "dash-green";
  if (value.includes("yellow") || value.includes("b list") || value.includes("open")) return "dash-yellow";
  if (value.includes("red") || value.includes("c list") || value.includes("lost") || value.includes("stale")) return "dash-red";
  if (value.includes("material") || value.includes("wise")) return "dash-blue";
  if (value.includes("commission") || value.includes("opportunit")) return "dash-orange";
  return "";
}

function tableRows(counts, view, filterKey = "") {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => metricRow(label, count, view, filterKey, label));
}

function projectMoneyRows(projects, view, searchValue) {
  const materials = projects.reduce((sum, project) => sum + projectMaterials(project), 0);
  const commission = projects.reduce((sum, project) => sum + projectCommission(project), 0);
  const wise = projects.reduce((sum, project) => sum + projectWiseTotal(project), 0);
  return [
    metricRow("Projected Material Total", moneyWithCents.format(materials), view, "search", searchValue),
    metricRow("Commission Total", moneyWithCents.format(commission), view, "search", searchValue),
    metricRow("Projected Wise Total", moneyWithCents.format(wise), view, "search", searchValue),
  ];
}

function topContractorRows(contractors, key) {
  return contractors
    .sort((a, b) => b[key] - a[key] || a.companyName.localeCompare(b.companyName))
    .slice(0, 5)
    .map((contractor) => metricRow(contractor.companyName, contractor[key], "contractors", "search", contractor.companyName));
}

function miniRecord(record, title, subtitle, type) {
  return `<div class="stack-item" data-type="${type}" data-id="${record.id}">
    <strong>${escapeHtml(title || "Record")}</strong>
    <p>${escapeHtml(subtitle || "")}</p>
  </div>`;
}

function accountProjectMiniRecord(project) {
  const pieces = [
    project.stage,
    project.abcList,
    project.anticipatedStartDate,
    project.materials ? `Materials ${moneyWithCents.format(projectMaterials(project))}` : "",
  ].filter(Boolean);
  return miniRecord(project, project.projectName || project.client || "Project", pieces.join(" | "), "project");
}

function accountProposalMiniRecord(proposal) {
  const bidCount = `${splitContractors(proposal.bidsReceived).length}/${splitContractors(proposal.biddingContractors).length}`;
  const pieces = [
    proposal.stage,
    proposal.bidDueDate ? `Due ${compactDate(proposal.bidDueDate)}` : "",
    proposal.biddingContractors ? `${bidCount} bids received` : "",
  ].filter(Boolean);
  return miniRecord(proposal, proposal.project || proposal.client || "Proposal", pieces.join(" | "), "proposal");
}

function accountTaskMiniRecord(task) {
  const done = ["Completed", "Cancelled"].includes(task.status);
  const dueLevel = taskDueLevel(task);
  const dueLbl = taskDueLabel(task);
  return `
    <article class="mini-record task-mini-record ${done ? "task-mini-done" : ""} ${dueLevel}" data-type="task" data-id="${escapeHtml(task.task_id)}">
      <label class="task-mini-check" onclick="event.stopPropagation()">
        <input type="checkbox" data-complete-task="${escapeHtml(task.task_id)}" ${done ? "checked" : ""} />
      </label>
      <div class="task-mini-body">
        <div class="task-mini-title">${escapeHtml(task.title || "Task")}</div>
        <div class="task-mini-meta">${escapeHtml([task.task_type, dueLbl].filter(Boolean).join(" · "))}</div>
      </div>
    </article>`;
}

function accountCard(item) {
  const activity = accountActivityStatus(item);
  const latest = latestAccountActivity(item);
  return `<article class="record-card" data-type="account" data-id="${item.id}">
    <div class="record-topline">
      <div>
        <h3><span class="activity-dot ${activity.level}" title="${escapeHtml(activity.label)}"></span>${escapeHtml(item.client)}</h3>
        <p>${escapeHtml([item.poc, item.title].filter(Boolean).join(" • ") || item.address || "")}</p>
        ${contactLinks(item, "card-contact-links")}
      </div>
      <span class="pill ${rankClass(item.clientRanking)}">${escapeHtml(item.clientRanking || "Unranked")}</span>
    </div>
    <div class="card-meta">
      <span class="pill">${escapeHtml(latest ? activity.label : "No activity")}</span>
      ${item.entity ? `<span class="pill ${entityClass(item.entity)}"${territoryPillStyle("entity", item.entity)}>${escapeHtml(item.entity)}</span>` : ""}
      ${item.county ? `<span class="pill"${territoryPillStyle("county", item.county)}>${escapeHtml(item.county)}</span>` : ""}
      ${item.sharedRep ? `<span class="pill">Shared Rep ${escapeHtml(item.sharedRep)}</span>` : ""}
      ${item.action ? `<span class="pill">${escapeHtml(item.action)}</span>` : ""}
    </div>
  </article>`;
}

function listWrap(records, renderer, emptyMessage, groupKey = null, groupOrder = null) {
  if (!records.length) return empty(emptyMessage);
  if (!groupKey) return records.map(renderer).join("");
  const groups = new Map();
  records.forEach((record) => {
    const key = groupKey(record) || "Unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const entries = [...groups.entries()];
  if (Array.isArray(groupOrder) && groupOrder.length) {
    const ordered = [];
    groupOrder.forEach((title) => {
      const matchingKey = [...groups.keys()].find((key) => normalize(key) === normalize(title));
      if (matchingKey) ordered.push([title, groups.get(matchingKey)]);
    });
    entries
      .filter(([title]) => !groupOrder.some((orderedTitle) => normalize(orderedTitle) === normalize(title)))
      .sort(([aTitle], [bTitle]) => compareProposalRejectedLast(aTitle, bTitle) || compareNumber(stageRank(aTitle), stageRank(bTitle)) || compareText(aTitle, bTitle))
      .forEach((entry) => ordered.push(entry));
    entries.splice(0, entries.length, ...ordered);
  } else if (entries.some(([title]) => new Set([...projectStages, ...proposalStages].map(normalize)).has(normalize(title)))) {
    entries.sort(([aTitle], [bTitle]) => compareProposalRejectedLast(aTitle, bTitle) || compareNumber(stageRank(aTitle), stageRank(bTitle)) || compareText(aTitle, bTitle));
  }
  return `<div class="kanban-shell">
    <button class="kanban-nav kanban-nav-left" data-kanban-scroll="left" type="button" aria-label="Scroll kanban left">‹</button>
    <div class="kanban-board">${entries
    .map(
      ([title, items]) => `<section class="kanban-column" data-kanban-stage="${escapeHtml(title)}">
        <h3>${escapeHtml(title)} <span>${items.length}</span></h3>
        <div class="kanban-items">${items.map(renderer).join("")}</div>
      </section>`
    )
    .join("")}</div>
    <button class="kanban-nav kanban-nav-right" data-kanban-scroll="right" type="button" aria-label="Scroll kanban right">›</button>
  </div>`;
}

function applyLayout(containerId, viewName) {
  const container = byId(containerId);
  const layout = state.layouts[viewName] || "tile";
  container.classList.remove("is-list", "is-kanban");
  container.classList.toggle("is-list", layout === "list");
  container.classList.toggle("is-kanban", layout === "kanban");
}

function isPhoneMode() {
  return state.mobilePreview || Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
}

function syncLayoutButtons(viewName) {
  const layout = state.layouts[viewName] || "tile";
  document.querySelectorAll(`[data-view-toggle="${viewName}"] [data-layout]`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.layout === layout);
  });
}

function syncAllLayoutButtons() {
  Object.keys(state.layouts).forEach(syncLayoutButtons);
}

function applyPhoneModeDefaults() {
  const phoneMode = isPhoneMode();
  if (phoneMode && !state.phoneMode) {
    state.desktopLayoutsBeforePhone = { ...state.layouts };
    Object.keys(state.layouts).forEach((viewName) => {
      state.layouts[viewName] = "list";
    });
    state.phoneMode = true;
    syncAllLayoutButtons();
    return true;
  }
  if (!phoneMode && state.phoneMode) {
    if (state.desktopLayoutsBeforePhone) state.layouts = { ...state.layouts, ...state.desktopLayoutsBeforePhone };
    state.desktopLayoutsBeforePhone = null;
    state.phoneMode = false;
    syncAllLayoutButtons();
    return true;
  }
  return false;
}

function syncMobilePreviewButton() {
  const shell = byId("appShell");
  const button = byId("mobileVersionButton");
  const toggleBtn = byId("mobileHeaderToggle");
  const compactBar = byId("mobileCompactBar");
  shell?.classList.toggle("mobile-preview", state.mobilePreview);
  if (button) {
    const label = state.mobilePreview ? "Desktop" : "Mobile";
    const fullLabel = `${label} Version`;
    const text = button.querySelector(".mobile-version-label");
    if (text) text.textContent = `${label} Version`;
    button.setAttribute("aria-label", fullLabel);
    button.setAttribute("title", fullLabel);
  }
  if (toggleBtn) toggleBtn.hidden = !state.mobilePreview;
  if (compactBar) compactBar.hidden = !state.mobilePreview;
  if (!state.mobilePreview) closeMobileFullMenu();
}

function closeMobileFullMenu() {
  const menu = byId("mobileFullMenu");
  const btn = byId("mobileCompactMenuBtn");
  if (menu) menu.classList.remove("is-open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleMobileFullMenu() {
  const menu = byId("mobileFullMenu");
  const btn = byId("mobileCompactMenuBtn");
  if (!menu) return;
  menu.removeAttribute("hidden");
  const open = menu.classList.toggle("is-open");
  if (btn) btn.setAttribute("aria-expanded", String(open));
}

function updateMobileViewLabel(viewTitle) {
  const label = byId("mobileCompactViewLabel");
  if (label) label.textContent = viewTitle;
}

function toggleMobilePreview() {
  state.mobilePreview = !state.mobilePreview;
  if (!state.mobilePreview) {
    closeMobileMoreMenu();
    byId("appShell")?.classList.remove("header-collapsed");
  }
  render();
}

function toggleMobileHeader() {
  const shell = byId("appShell");
  if (!shell) return;
  const collapsed = shell.classList.toggle("header-collapsed");
  try { localStorage.setItem("gripMobileHeaderCollapsed", collapsed ? "1" : "0"); } catch (_) {}
}

function restoreMobileHeaderState() {
  try {
    if (localStorage.getItem("gripMobileHeaderCollapsed") === "1" && state.mobilePreview) {
      byId("appShell")?.classList.add("header-collapsed");
    }
  } catch (_) {}
}

function setLayout(viewName, layout) {
  state.layouts[viewName] = layout;
  syncLayoutButtons(viewName);
  render();
}

function setAccountMode(mode) {
  state.accountMode = mode === "manage" ? "manage" : "browse";
  renderAccounts();
}

function manageAccountRow(item) {
  return `<div class="manage-row">
    <div>
      <strong>${escapeHtml(item.client || "Unnamed Account")}</strong>
      <p>${escapeHtml([item.entity, item.county, item.poc].filter(Boolean).join(" | ") || "No extra account details")}</p>
    </div>
    <div class="manage-actions">
      <button class="mini-button" data-open-account-dialog="${escapeHtml(item.id)}" type="button">Edit</button>
      <button class="mini-button" data-rename-account="${escapeHtml(item.id)}" type="button">Rename</button>
      <button class="mini-button danger-mini" data-delete-record="account" data-delete-id="${escapeHtml(item.id)}" type="button">Delete</button>
    </div>
  </div>`;
}

function projectCard(item) {
  const materials = projectMaterials(item);
  const commission = projectCommission(item);
  const wiseTrophy = Number(item.wiseTrophy || item.wiseTropy || 0);
  const title = item.projectName || item.client || "Project";
  return `<article class="record-card" data-type="project" data-id="${item.id}" draggable="true">
    <div class="record-topline">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(item.client || "")}</p>
      </div>
      <span class="pill ${rankClass(item.abcList)}">${escapeHtml(item.abcList || "Unranked")}</span>
    </div>
    <div class="card-meta">
      ${item.projectType ? `<span class="pill">${escapeHtml(item.projectType)}</span>` : ""}
      ${item.systemWarrantyTerm ? `<span class="pill">${escapeHtml(item.systemWarrantyTerm)}</span>` : ""}
      ${item.stage ? `<span class="pill ${rankClass(item.stage)}">${escapeHtml(item.stage)}</span>` : ""}
      ${item.anticipatedStartDate ? `<span class="pill">${escapeHtml(item.anticipatedStartDate)}</span>` : ""}
      ${item.squareFeet ? `<span class="pill">${Number(item.squareFeet).toLocaleString()} SQ/FT</span>` : ""}
      ${materials ? `<span class="pill">Materials ${moneyWithCents.format(materials)}</span>` : ""}
      ${commission ? `<span class="pill">Commission ${moneyWithCents.format(commission)}</span>` : ""}
      ${wiseTrophy ? `<span class="pill">Wise Trophy ${moneyWithCents.format(wiseTrophy)}</span>` : ""}
    </div>
    ${projectCardSystemSummary(item)}
  </article>`;
}

function projectCardSystemSummary(item) {
  const fields = [
    ["Warranty", item.systemWarrantyType],
    ["Material Type", item.systemMaterial],
    ["System", item.systemProduct],
    ["Cap", item.systemCapSheet],
    ["Base", item.systemBaseSheet],
    ["Surfacing", item.systemSurfacing],
  ].filter(([, value]) => value);
  if (!fields.length) {
    return normalize(item.stage).includes("prospecting")
      ? `<div class="project-card-system is-empty"><strong>System Builder</strong><span>Not selected yet</span></div>`
      : "";
  }
  return `<div class="project-card-system">
    <strong>System Builder</strong>
    <div>${fields.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join("")}</div>
  </div>`;
}

function proposalCard(item) {
  const receivedCount = splitContractors(item.bidsReceived).length;
  const biddingCount = splitContractors(item.biddingContractors).length;
  const title = item.project || item.client || "Proposal";
  return `<article class="record-card" data-type="proposal" data-id="${item.id}" draggable="true">
    <div class="record-topline">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(item.client || "")}</p>
      </div>
      <span class="pill ${rankClass(item.stage)}">${escapeHtml(item.stage || "No stage")}</span>
    </div>
    <div class="card-meta">
      ${item.bidDueDate ? `<span class="pill">${compactDate(item.bidDueDate)}</span>` : ""}
      ${biddingCount ? `<span class="pill">${receivedCount}/${biddingCount} received</span>` : ""}
      ${item.awardedContractor ? `<span class="pill">${escapeHtml(item.awardedContractor)}</span>` : ""}
      ${item.materials ? `<span class="pill">Est. Materials ${moneyWithCents.format(Number(item.materials) || 0)}</span>` : ""}
      ${item.projectStartDate ? `<span class="pill">Starts ${compactDate(item.projectStartDate)}</span>` : ""}
    </div>
  </article>`;
}

function contractorCard(item) {
  const performance = contractorPerformance(item);
  return `<article class="record-card" data-type="contractor" data-id="${escapeHtml(item.companyName)}">
    <div class="record-topline">
      <div>
        <h3><span class="color-swatch" style="background:${escapeHtml(item.color || "#0057a8")}"></span>${escapeHtml(item.companyName || "Unnamed Contractor")}</h3>
        <p>${escapeHtml([item.poc, item.title].filter(Boolean).join(" • ") || item.email || item.phone || "No primary contact yet")}</p>
        ${contactLinks(item, "card-contact-links")}
      </div>
      <span class="pill">${item.wins} wins</span>
    </div>
    <div class="card-meta">
      <span class="pill">${item.opportunities} opportunities</span>
      <span class="pill">Response ${performance.responseRate}%</span>
      <span class="pill">Win ${performance.winRate}%</span>
      ${item.lastGiven ? `<span class="pill">Last given ${compactDate(item.lastGiven)}</span>` : ""}
      ${item.lastWon ? `<span class="pill">Last won ${compactDate(item.lastWon)}</span>` : ""}
      ${item.supportContacts?.length ? `<span class="pill">${item.supportContacts.length} support contacts</span>` : ""}
    </div>
  </article>`;
}

function renderAccounts() {
  const records = cleanAccounts().filter((item) => {
    return (
      includesSearch(item) &&
      dataQualityMatch("account", item) &&
      activityFilterMatch(item) &&
      (state.filters.rank === "All rankings" || normalize(item.clientRanking) === normalize(state.filters.rank)) &&
      (state.filters.entity === "All entities" || item.entity === state.filters.entity) &&
      (state.filters.county === "All counties" || item.county === state.filters.county)
    );
  }).sort(sortAccounts);
  const isManage = state.accountMode === "manage";
  byId("accountsList").hidden = isManage;
  byId("accountsManageList").hidden = !isManage;
  document.querySelectorAll("[data-account-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.accountMode === state.accountMode));
  applyLayout("accountsList", "accounts");
  byId("accountsList").innerHTML = listWrap(
    records,
    accountCard,
    "No accounts match this view.",
    state.layouts.accounts === "kanban" ? (item) => item.entity || item.clientRanking : null
  );
  byId("accountsManageList").innerHTML = records.length ? records.map(manageAccountRow).join("") : empty("No accounts match this view.");
}

function renderActivityLog() {
  let records = allActivityRecords().filter((item) => {
    const created = dateValue(item.createdAt);
    const matchesDate =
      state.filters.activityDate === "all" ||
      (state.filters.activityDate === "today"
        ? new Date(item.createdAt).toDateString() === new Date().toDateString()
        : created && Date.now() - created <= Number(state.filters.activityDate) * 86400000);
    return (
      includesSearch(item) &&
      (state.filters.activityAccount === "All accounts" || item.accountName === state.filters.activityAccount) &&
      (state.filters.activityEntity === "All entities" || item.entity === state.filters.activityEntity) &&
      (state.filters.activityCounty === "All counties" || item.county === state.filters.activityCounty) &&
      (state.filters.activityRep === "All reps" || item.sharedRep === state.filters.activityRep) &&
      matchesDate
    );
  });
  records = records.sort((a, b) => compareNumber(dateValue(a.createdAt), dateValue(b.createdAt), state.filters.activityDirection));
  byId("activitySummary").innerHTML = `
    <div class="summary-pill"><strong>${records.length}</strong><span>Activities</span></div>
    <div class="summary-pill"><strong>${new Set(records.map((item) => item.accountId)).size}</strong><span>Accounts Touched</span></div>
    <div class="summary-pill"><strong>${records.filter((item) => new Date(item.createdAt).toDateString() === new Date().toDateString()).length}</strong><span>Today</span></div>
  `;
  byId("activityTimeline").innerHTML = records.length ? records.map(activityTimelineItem).join("") : empty("No activity matches this view.");
}

function activityTimelineItem(item) {
  return `<article class="timeline-item" data-type="account" data-id="${escapeHtml(item.accountId)}">
    <div class="timeline-date">
      <strong>${compactDate(item.createdAt) || "No date"}</strong>
      <span>${new Date(item.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
    </div>
    <div class="timeline-body">
      <h3>${escapeHtml(item.accountName)}</h3>
      <p>${escapeHtml(item.note || "")}</p>
      <div class="card-meta">
        ${item.source ? `<span class="pill">${escapeHtml(item.source)}</span>` : ""}
        ${item.facility ? `<span class="pill">${escapeHtml(item.facility)}</span>` : ""}
        ${item.entity ? `<span class="pill ${entityClass(item.entity)}"${territoryPillStyle("entity", item.entity)}>${escapeHtml(item.entity)}</span>` : ""}
        ${item.county ? `<span class="pill"${territoryPillStyle("county", item.county)}>${escapeHtml(item.county)}</span>` : ""}
        ${item.sharedRep ? `<span class="pill">Shared Rep ${escapeHtml(item.sharedRep)}</span>` : ""}
      </div>
      ${activityFileLinks(item.files)}
      ${activityActions(item.accountId, item.id)}
    </div>
  </article>`;
}

function renderProjects() {
  const records = cleanProjects().filter((item) => {
    return (
      includesSearch(item) &&
      dataQualityMatch("project", item) &&
      (state.filters.projectStage === "All project stages" || item.stage === state.filters.projectStage) &&
      (state.filters.projectRank === "All project rankings" || item.abcList === state.filters.projectRank) &&
      (state.filters.projectContractor === "All contractors" ||
        splitContractors(item.biddingContractors).some((contractor) => contractor === state.filters.projectContractor))
    );
  }).sort(sortProjects);
  applyLayout("projectsList", "projects");
  byId("projectsList").innerHTML = listWrap(records, projectCard, "No projects match this view.", state.layouts.projects === "kanban" ? (item) => item.stage : null, projectStages);
}

function takeoffCatalogForType(type) {
  return systemBuilderCatalog[normalizeProjectTypeLabel(type || defaultProjectType)] || systemBuilderCatalog[defaultProjectType];
}

function takeoffMaterial(catalog, value) {
  return catalog.materials.find((item) => item.name === value) || catalog.materials[0];
}

function takeoffSystem(material, value) {
  return material?.systems.find((item) => item.product === value) || material?.systems[0] || {};
}

function slopeMultiplier(risePerFoot) {
  const rise = Number(risePerFoot || 0);
  return Math.sqrt(144 + rise * rise) / 12;
}

function slopeRiseValue(value) {
  const text = String(value || "");
  if (text.includes("1/8")) return 0.125;
  if (text.includes("1/4")) return 0.25;
  if (text.includes("1/2")) return 0.5;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function takeoffAdjustedArea() {
  const sqft = Number(byId("takeoffSqftInput")?.value || 0);
  const waste = Number(byId("takeoffWasteInput")?.value || 0) / 100;
  return sqft * slopeMultiplier(byId("takeoffSlopeInput")?.value || 0) * (1 + waste);
}

function parseGalPerSquare(text) {
  const matches = [...String(text || "").matchAll(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*gal\.?\/sq\.?/gi)];
  return matches.reduce((sum, match) => sum + Number(match[2] || match[1] || 0), 0);
}

function estimateGalPerSquare(text) {
  const value = String(text || "");
  const fieldRates = [...value.matchAll(/field[^.;:]*:?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*gal\.?\/sq\.?/gi)];
  if (fieldRates.length) return fieldRates.reduce((sum, match) => sum + Number(match[2] || match[1] || 0), 0);
  return parseGalPerSquare(value);
}

function takeoffRef(value) {
  const ref = productReferenceFor(value);
  return ref ? `<a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener">${escapeHtml(ref.label)}</a>` : "Verify with current Garland technical data.";
}

function inferPriceBookType(name) {
  const value = normalize(name);
  if (value.includes("roll good")) return "Roll Goods";
  if (value.includes("coating") || value.includes("mastic") || value.includes("adhesive")) return "Coatings, Mastics & Adhesives";
  if (value.includes("sealant") || value.includes("accessor")) return "Sealants & Accessories";
  if (value.includes("standing seam") || value.includes(" ss ")) return "Standing Seam";
  if (value.includes("edge metal") || value.includes(" metal")) return "Metal / Edge Metal";
  if (value.includes("wpg")) return "WPG";
  if (value.includes("warranty")) return "Warranty";
  return "Other";
}

function selectedTakeoffPricingType() {
  return byId("takeoffPricingTypeInput")?.value || state.filters.takeoffPricingType || "Series Pricing";
}

function selectedTakeoffPricingYear() {
  return byId("takeoffPricingYearInput")?.value || state.filters.takeoffPricingYear || String(today.getFullYear());
}

function availablePricingYears() {
  return [...new Set([String(today.getFullYear()), ...state.priceBooks.map((book) => String(book.year || "")).filter(Boolean), ...state.priceBookProducts.map((item) => String(item.year || "")).filter(Boolean)])].sort((a, b) => Number(b) - Number(a));
}

function matchingPriceBooks(program = selectedTakeoffPricingType(), year = selectedTakeoffPricingYear()) {
  return state.priceBooks
    .filter((book) => (book.program || "Series Pricing") === program)
    .filter((book) => !year || String(book.year || "") === String(year))
    .sort((a, b) => compareNumber(Number(b.year || 0), Number(a.year || 0)) || compareText(a.type, b.type) || compareText(a.name, b.name));
}

function fileSizeLabel(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
}

function textFileDataUrl(text) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

function expandProductChoices(values) {
  const expanded = [];
  (values || []).forEach((value) => {
    const key = normalize(value);
    const variants = productChoiceVariants[key];
    expanded.push(...(variants || [value]));
  });
  return [...new Set(expanded.filter(Boolean))];
}

function bestMappedProduct(value) {
  const product = normalize(value);
  if (!product || product === "not applicable") return null;
  const exact = mappedProductNumbers.find((item) => product === normalize(item.match));
  if (exact) return exact;
  const contains = mappedProductNumbers.find((item) => product.includes(normalize(item.match)));
  if (contains) return contains;
  const candidates = mappedProductNumbers
    .filter((item) => normalize(item.match).startsWith(product) || firstWordsMatch(product, normalize(item.match)))
    .sort((a, b) => normalize(a.match).length - normalize(b.match).length);
  return candidates[0] || null;
}

function firstWordsMatch(value, candidate) {
  const valueWords = value.split(" ").filter(Boolean).slice(0, 2).join(" ");
  const candidateWords = candidate.split(" ").filter(Boolean).slice(0, 2).join(" ");
  return valueWords && valueWords === candidateWords;
}

function hasLargeLocalFiles(files) {
  return [...(files || [])].some((file) => Number(file.size || 0) > localStorageLargeFileLimit);
}

function confirmLargeLocalFiles(files, label = "files") {
  if (!hasLargeLocalFiles(files)) return true;
  return confirm(
    `These ${label} include large files. For long-term phone/Mac use, store large PDFs, photos, videos, and voice memos in Google Drive and keep the Drive link in GRIP. Save these locally anyway?`
  );
}

function priceBookReferenceNote(program = selectedTakeoffPricingType()) {
  const books = matchingPriceBooks(program).slice(0, 6);
  if (!books.length) return `No ${program} price book uploaded yet.`;
  return books
    .map((book) =>
      book.dataUrl
        ? `<a href="${book.dataUrl}" download="${escapeHtml(book.name)}">${escapeHtml(book.year ? `${book.year} ${book.program || "Series Pricing"} ${book.type}` : `${book.program || "Series Pricing"} ${book.type}`)} - ${escapeHtml(book.name)}</a>`
        : escapeHtml(`${book.year || ""} ${book.program || "Series Pricing"} ${book.type} - ${book.name}`)
    )
    .join("<br>");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePriceBookProducts(text, { year, program, type, sourceName }) {
  const normalizedText = String(text || "").replace(/\r/g, "\n");
  const productNumbers = [...new Set(mappedProductNumbers.map((item) => item.number).concat(Object.keys(productNumberDetails)))].filter(Boolean);
  return productNumbers
    .map((number) => {
      const pattern = new RegExp(`${escapeRegExp(number)}\\s+\\$([\\d,]+\\.\\d{2})(\\d{1,3})([\\s\\S]{0,220})`, "i");
      const match = normalizedText.match(pattern);
      if (!match) return null;
      const before = normalizedText.slice(Math.max(0, match.index - 280), match.index);
      const coop = [...before.matchAll(/\$([\d,]+\.\d{2})/g)].pop()?.[1] || "";
      const after = match[3] || "";
      const size = after.match(/(5\s*GL\s*PAIL|4\.5\s*GL\s*PAIL|3\.5\s*GL\s*PAIL|3\s*GL\s*PAIL|2\s*GL\s*PAIL|50\s*GAL\s*DRUM|55\s*GAL\s*DRM|55\s*GAL\s*DRUM|100#\s*KEG|50#\s*KEG|EACH|BOX KIT|CS\/[^\n]+)/i)?.[1] || productNumberDetails[number]?.size || "";
      const coverageRaw = after
        .replace(size, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const coverage = coverageRaw || productNumberDetails[number]?.coverage || "";
      return {
        number,
        year: String(year),
        program,
        type,
        sourceName,
        seriesPrice: Number(match[1].replace(/,/g, "")),
        coopPrice: coop ? Number(coop.replace(/,/g, "")) : undefined,
        perPallet: match[2] || productNumberDetails[number]?.perPallet || "Verify",
        coverage,
        size,
        uploadedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) return "";
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join("\n"));
  }
  return pages.join("\n");
}

async function readPriceBookProducts(file, entry) {
  try {
    const text = await extractPdfText(file);
    if (!text) return [];
    return parsePriceBookProducts(text, {
      year: entry.year,
      program: entry.program,
      type: entry.type,
      sourceName: entry.name,
    });
  } catch (_error) {
    return [];
  }
}

function mappedProductData(value) {
  const product = normalize(value);
  if (!product || product === "not applicable") return null;
  if (product.includes("new garland roof system") || product.includes("existing roof")) {
    return selectedSystemLayerProductData();
  }
  return priceBookProductData(bestMappedProduct(value));
}

function priceBookProductData(mapped) {
  if (!mapped) return null;
  const program = selectedTakeoffPricingType();
  const year = selectedTakeoffPricingYear();
  const uploaded = state.priceBookProducts.find((item) =>
    String(item.number || "").toLowerCase() === String(mapped.number || "").toLowerCase() &&
    String(item.year || "") === String(year) &&
    (item.program || "Series Pricing") === program
  );
  return uploaded ? { ...mapped, ...uploaded, source: `${uploaded.year} uploaded price book` } : mapped;
}

function selectedSystemLayerProductData() {
  const layerIds = [
    "takeoffCapSheetInput",
    "takeoffBaseSheetInput",
    "takeoffSurfacingInput",
    "takeoffPrimerInput",
    "systemCapSheetInput",
    "systemBaseSheetInput",
    "systemSurfacingInput",
    "systemPrimerInput",
  ];
  for (const id of layerIds) {
    const value = byId(id)?.value || "";
    const product = normalize(value);
    if (!product || product === "not applicable" || product === "no surfacing") continue;
    const mapped = bestMappedProduct(value);
    if (mapped) return { ...priceBookProductData(mapped), source: `${priceBookProductData(mapped)?.source || mapped.source} via selected layer` };
  }
  return null;
}

function productNumber(value) {
  const product = normalize(value);
  if (!product || product === "not applicable") return "-";
  if (["generic hot asphalt", "hot asphalt", "torch applied", "torch applied where applicable", "self-adhered", "mineral surface", "no surfacing"].includes(product)) return "N/A";
  const mapped = mappedProductData(value);
  if (mapped) return mapped.number;
  const matchedBook = matchingPriceBooks().find((book) => normalize(book.name).includes(product) || product.includes(normalize(book.name).slice(0, 12)));
  return matchedBook?.productNumber || "Pending";
}

function productNumberNote(value) {
  const mapped = mappedProductData(value);
  if (!mapped) return "";
  const size = mapped.size ? ` Size: ${mapped.size}.` : "";
  return `<small class="takeoff-source-note">Product # ${escapeHtml(mapped.number)} mapped from ${escapeHtml(mapped.source)}.${escapeHtml(size)}</small>`;
}

function productPalletCount(value) {
  const product = normalize(value);
  if (!product || product === "not applicable") return "-";
  if (["generic hot asphalt", "hot asphalt", "torch applied", "torch applied where applicable", "self-adhered", "mineral surface", "no surfacing"].includes(product)) return "N/A";
  const mapped = mappedProductData(value);
  return mapped?.perPallet || "Verify";
}

function productCoverageRate(value, fallback = "") {
  const product = normalize(value);
  if (!product || product === "not applicable") return "-";
  if (["generic hot asphalt", "hot asphalt", "torch applied", "torch applied where applicable", "self-adhered", "mineral surface", "no surfacing"].includes(product)) return "N/A";
  const mapped = mappedProductData(value);
  return mapped?.coverage || fallback || "Verify";
}

function productMilNote(value) {
  const mapped = mappedProductData(value);
  return mapped?.wetMil || mapped?.dryMil || "";
}

function productCoverageSqft(value) {
  const coverage = mappedProductData(value)?.coverage || "";
  const match = String(coverage).match(/([\d,]+(?:\.\d+)?)\s*sq\.?\s*ft/i);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function productUnitPrice(value) {
  const mapped = mappedProductData(value);
  if (!mapped) return 0;
  const selectedYear = selectedTakeoffPricingYear();
  if (!mapped.year && selectedYear !== String(today.getFullYear()) && !String(mapped.source || "").includes(selectedYear)) return 0;
  return normalize(selectedTakeoffPricingType()).includes("co op") ? Number(mapped.coopPrice || mapped.seriesPrice || 0) : Number(mapped.seriesPrice || mapped.coopPrice || 0);
}

function takeoffQuantityNumber(qty) {
  const match = String(qty || "").replace(/,/g, "").match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function takeoffLinePrice(material, qty) {
  const unitPrice = productUnitPrice(material);
  const quantity = takeoffQuantityNumber(qty);
  return unitPrice && quantity ? unitPrice * quantity : 0;
}

function takeoffMoney(value) {
  return value ? moneyWithCents.format(value) : "-";
}

function takeoffRowsTotal(rows) {
  return rows.reduce((sum, row) => sum + Number(row.match(/data-line-total="([\d.]+)"/)?.[1] || 0), 0);
}

function productCategory(item) {
  const value = normalize([item.match, item.source].join(" "));
  if (value.includes("roll goods") || value.includes("stressply") || value.includes("optimax") || value.includes("kee stone") || value.includes("flexbase") || value.includes("hpr") || value.includes("stressbase") || value.includes("versiply")) return "Roll Goods";
  if (value.includes("coating") || value.includes("adhesive") || value.includes("asphalt") || value.includes("green lock")) return "Coatings, Mastics & Adhesives";
  if (value.includes("sealant") || value.includes("accessor")) return "Sealants & Accessories";
  if (value.includes("metal") || value.includes("r mer")) return "Metal / Edge Metal";
  return "Other";
}

function takeoffProductOptions() {
  return mappedProductNumbers
    .map((item) => ({ ...item, category: productCategory(item) }))
    .sort((a, b) => compareText(a.category, b.category) || compareText(a.match, b.match));
}

function takeoffRow(material, basis, qty, unit, note = "", priceQty = "") {
  const productNote = productNumberNote(material);
  const unitPrice = productUnitPrice(material);
  const lineTotal = takeoffLinePrice(material, priceQty || qty);
  return `<tr data-line-total="${lineTotal.toFixed(2)}">
    <td>${escapeHtml(productNumber(material))}</td>
    <td>${escapeHtml(material)}</td>
    <td>${escapeHtml(productCoverageRate(material, basis))}</td>
    <td>${escapeHtml(productPalletCount(material))}</td>
    <td>${escapeHtml(qty)}</td>
    <td>${escapeHtml(unit)}</td>
    <td>${takeoffMoney(unitPrice)}</td>
    <td>${takeoffMoney(lineTotal)}</td>
    <td>${note}${productNote}</td>
  </tr>`;
}

function takeoffGallons(name, gallonsPerSq, area, note) {
  const gallons = (area / 100) * gallonsPerSq;
  const pails = Math.ceil(gallons / 5);
  return takeoffRow(name, `${gallonsPerSq} gal./sq.`, `${Math.ceil(gallons)} gal.`, `${pails} five-gal pails`, note, pails);
}

function takeoffPounds(name, poundsPerSq, area, note) {
  const pounds = (area / 100) * poundsPerSq;
  const kegs = Math.ceil(pounds / 100);
  return takeoffRow(name, `${poundsPerSq} lb./sq.`, `${Math.ceil(pounds)} lb.`, `${kegs} 100-lb kegs`, note, kegs);
}

function takeoffRollGood(name, area, note = "") {
  if (!name || name === "Not applicable") return "";
  const coverage = productCoverageSqft(name) || 100;
  const rolls = Math.ceil(area / coverage);
  const basis = productCoverageSqft(name) ? productCoverageRate(name) : "Assumption: 100 sq. ft. per roll";
  return takeoffRow(name, basis, `${rolls} rolls`, "Rolls", `${note} ${takeoffRef(name)}`);
}

function takeoffEstimatorRows() {
  const area = takeoffAdjustedArea();
  const product = byId("takeoffSystemInput")?.value || "";
  const system = takeoffCurrentSystem();
  const rows = [];
  if (!area) return [takeoffRow("Enter roof area", "Square footage required", "-", "-", "Choose a project or enter square footage to calculate.")];

  const descriptionRate = estimateGalPerSquare(system.description);
  if (descriptionRate) {
    rows.push(takeoffGallons(product, descriptionRate, area, `Rate pulled from the Garland restoration/warranty chart note: ${escapeHtml(system.description || "")}`));
    if (normalize(system.description).includes("fabric")) rows.push(takeoffRow("Grip Polyester reinforcement", "Fabric-reinforced system", `${Math.ceil(area / 100)} roof squares`, "Verify roll count", takeoffRef("Grip Polyester")));
  }

  const capSheet = byId("takeoffCapSheetInput")?.value || "";
  const baseSheet = byId("takeoffBaseSheetInput")?.value || "";
  rows.push(takeoffRollGood(capSheet, area, "Roll yield is editable once exact product roll coverage is provided."));
  rows.push(takeoffRollGood(baseSheet, area, "Roll yield is editable once exact product roll coverage is provided."));

  const capAdhesive = byId("takeoffCapAdhesiveInput")?.value || "";
  const baseAdhesive = byId("takeoffBaseAdhesiveInput")?.value || "";
  [capAdhesive, baseAdhesive].forEach((adhesive) => {
    if (!adhesive || adhesive === "Not applicable") return;
    const adhesiveName = normalize(adhesive);
    if (adhesiveName.includes("generic hot asphalt")) {
      rows.push(takeoffRow(adhesive, "No hot asphalt predicted", "Verify", "Verify", "Generic hot asphalt intentionally does not calculate. Choose HPR All-Temp Asphalt to predict keg quantity."));
      return;
    }
    if (adhesiveName.includes("hpr all temp asphalt")) {
      rows.push(takeoffPounds(adhesive, 25, area, "HPR All-Temp Asphalt membrane/interply rate from 2026 coatings price book. Flood coat rates should be handled under surfacing."));
      return;
    }
    const rate = adhesiveName.includes("green lock") ? 2.5 : 0;
    if (rate) rows.push(takeoffGallons(adhesive, rate, area, "Green-Lock Plus Membrane Adhesive field/interply rate uses high side of 2-2.5 gal./sq.; flashing adhesive is intentionally not used here."));
    else rows.push(takeoffRow(adhesive, "Application-specific", "Verify", "Verify", `${coverageNote(adhesive) || "Coverage not exposed in the current mapped data."} ${takeoffRef(adhesive)}`));
  });

  const surfacing = byId("takeoffSurfacingInput")?.value || "";
  if (surfacing && surfacing !== "Not applicable" && normalize(surfacing) !== "no surfacing") {
    const surfacingRate = parseGalPerSquare(coverageNote(surfacing));
    if (surfacingRate) rows.push(takeoffGallons(surfacing, surfacingRate, area, takeoffRef(surfacing)));
    else if (normalize(surfacing).includes("gravel")) rows.push(takeoffRow("Roofing aggregate", "400 lb./sq. allowance", `${Math.ceil((area / 100) * 400)} lb.`, "Tons/pallets by supplier", "Aggregate allowance based on Garland Green-Lock flood coat public product page."));
    else rows.push(takeoffRow(surfacing, "Application-specific", "Verify", "Verify", `${coverageNote(surfacing) || "Confirm coating/surfacing rate."} ${takeoffRef(surfacing)}`));
  }

  const primer = byId("takeoffPrimerInput")?.value || "";
  if (primer && primer !== "Not applicable") rows.push(takeoffRow(primer, "Substrate-specific", "Verify", "Verify", `Primer coverage varies by substrate. ${takeoffRef(primer)}`));

  if (normalize(product).includes("r mer")) {
    rows.push(takeoffRow("Metal roof panels", "Shop drawing required", `${Math.ceil(area / 100)} roof squares`, "Panel count by layout", `${system.description || ""} ${takeoffRef(product)}`));
  }

  state.takeoffManualProducts.forEach((item) => {
    rows.push(takeoffRow(item.name, productCoverageRate(item.name), `${Number(item.qty || 1)} ${item.unit || "units"}`, item.unit || "Units", "Manually added product."));
  });

  return rows.filter(Boolean).length ? rows.filter(Boolean) : [takeoffRow("No mapped material quantity", "Current system needs product data", "-", "-", "Provide product package sizes/yields and I can map this exactly.")];
}

function currentTakeoffEstimateSnapshot(existingId = "") {
  const projectId = byId("takeoffProjectSelect")?.value || "";
  const project = findRecord("project", projectId);
  const adjustedArea = takeoffAdjustedArea();
  const rowsHtml = takeoffEstimatorRows();
  return {
    id: existingId || `takeoff-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    savedAt: new Date().toISOString(),
    name: byId("takeoffNameInput")?.value.trim() || project?.projectName || "Quick estimate",
    projectId,
    projectName: project ? project.projectName || project.client || "Project" : "",
    client: project?.client || "",
    sqft: Number(byId("takeoffSqftInput")?.value || 0),
    slope: byId("takeoffSlopeInput")?.value || "0",
    waste: byId("takeoffWasteInput")?.value || "10",
    pricingType: selectedTakeoffPricingType(),
    adjustedArea,
    projectType: byId("takeoffProjectTypeInput")?.value || "",
    warrantyType: byId("takeoffWarrantyTypeInput")?.value || "",
    material: byId("takeoffMaterialInput")?.value || "",
    system: byId("takeoffSystemInput")?.value || "",
    warrantyTerm: byId("takeoffWarrantyTermInput")?.value || "",
    capSheet: byId("takeoffCapSheetInput")?.value || "",
    capAdhesive: byId("takeoffCapAdhesiveInput")?.value || "",
    baseSheet: byId("takeoffBaseSheetInput")?.value || "",
    baseAdhesive: byId("takeoffBaseAdhesiveInput")?.value || "",
    surfacing: byId("takeoffSurfacingInput")?.value || "",
    primer: byId("takeoffPrimerInput")?.value || "",
    manualProducts: [...state.takeoffManualProducts],
    totalEstimate: takeoffRowsTotal(rowsHtml),
    rowsHtml,
  };
}

function linkTakeoffEstimateToProject(projectId, estimateId) {
  if (!projectId || !estimateId) return;
  const project = findRecord("project", projectId);
  const ids = [...new Set([...(Array.isArray(project?.takeoffEstimateIds) ? project.takeoffEstimateIds : []), estimateId])];
  persistRecordEdit("project", projectId, "takeoffEstimateIds", ids, false);
}

function saveCurrentTakeoffEstimate() {
  const estimate = currentTakeoffEstimateSnapshot(state.activeTakeoffEstimateId);
  const existingIndex = state.takeoffEstimates.findIndex((item) => item.id === estimate.id);
  if (existingIndex >= 0) state.takeoffEstimates[existingIndex] = estimate;
  else state.takeoffEstimates.unshift(estimate);
  if (estimate.projectId) linkTakeoffEstimateToProject(estimate.projectId, estimate.id);
  state.activeTakeoffEstimateId = estimate.id;
  saveTakeoffEstimates();
  state.takeoffMode = "saved";
  renderTakeoffEstimator();
}

function loadTakeoffEstimate(estimateId) {
  const estimate = state.takeoffEstimates.find((item) => item.id === estimateId);
  if (!estimate) return;
  state.takeoffMode = "builder";
  state.activeTakeoffEstimateId = estimate.id;
  if (state.view !== "takeoffEstimator") setView("takeoffEstimator");
  byId("takeoffProjectSelect").value = estimate.projectId || "";
  byId("takeoffNameInput").value = estimate.name || "";
  byId("takeoffSqftInput").value = estimate.sqft || "";
  byId("takeoffSlopeInput").value = estimate.slope || "0";
  byId("takeoffWasteInput").value = estimate.waste || "10";
  if (estimate.pricingType) state.filters.takeoffPricingType = estimate.pricingType;
  byId("takeoffProjectTypeInput").value = normalizeProjectTypeLabel(estimate.projectType || defaultProjectType);
  renderTakeoffSelectors();
  if (estimate.warrantyType) byId("takeoffWarrantyTypeInput").value = estimate.warrantyType;
  if (estimate.material) byId("takeoffMaterialInput").value = estimate.material;
  renderTakeoffSelectors();
  if (estimate.system) byId("takeoffSystemInput").value = estimate.system;
  renderTakeoffSelectors();
  if (estimate.warrantyTerm) byId("takeoffWarrantyTermInput").value = estimate.warrantyTerm;
  if (estimate.capSheet) byId("takeoffCapSheetInput").value = estimate.capSheet;
  if (estimate.capAdhesive) byId("takeoffCapAdhesiveInput").value = estimate.capAdhesive;
  if (estimate.baseSheet) byId("takeoffBaseSheetInput").value = estimate.baseSheet;
  if (estimate.baseAdhesive) byId("takeoffBaseAdhesiveInput").value = estimate.baseAdhesive;
  if (estimate.surfacing) byId("takeoffSurfacingInput").value = estimate.surfacing;
  state.takeoffManualProducts = Array.isArray(estimate.manualProducts) ? [...estimate.manualProducts] : [];
  saveTakeoffManualProducts();
  renderTakeoffEstimator();
}

function deleteTakeoffEstimate(estimateId) {
  state.takeoffEstimates = state.takeoffEstimates.filter((item) => item.id !== estimateId);
  if (state.activeTakeoffEstimateId === estimateId) state.activeTakeoffEstimateId = "";
  cleanProjects().forEach((project) => {
    if (!Array.isArray(project.takeoffEstimateIds) || !project.takeoffEstimateIds.includes(estimateId)) return;
    persistRecordEdit("project", project.id, "takeoffEstimateIds", project.takeoffEstimateIds.filter((id) => id !== estimateId), false);
  });
  saveTakeoffEstimates();
  renderTakeoffEstimator();
}

function sortTakeoffEstimates(a, b) {
  const direction = state.filters.takeoffDirection;
  if (state.filters.takeoffSort === "name") return compareText(a.name, b.name, direction);
  if (state.filters.takeoffSort === "project") return compareText(a.projectName || "Standalone", b.projectName || "Standalone", direction) || compareText(a.name, b.name, direction);
  if (state.filters.takeoffSort === "area") return compareNumber(a.adjustedArea, b.adjustedArea, direction);
  return compareNumber(dateValue(a.savedAt), dateValue(b.savedAt), direction);
}

function filteredTakeoffEstimates(projectId = "") {
  const search = normalize(state.filters.takeoffSearch);
  return state.takeoffEstimates
    .filter((estimate) => {
      const projectMatch = projectId
        ? estimate.projectId === projectId
        : state.filters.takeoffProject === "All projects" || (state.filters.takeoffProject === "Standalone" ? !estimate.projectId : estimate.projectId === state.filters.takeoffProject);
      const searchMatch = !search || normalize([estimate.name, estimate.projectName, estimate.client, estimate.system, estimate.material, estimate.pricingType].join(" ")).includes(search);
      return projectMatch && searchMatch;
    })
    .sort(sortTakeoffEstimates);
}

function takeoffEstimateCard(estimate) {
  const projectLabel = estimate.projectName || "Standalone";
  return `<article class="record-card takeoff-estimate-card" data-takeoff-estimate="${escapeHtml(estimate.id)}">
    <div class="record-topline">
      <div>
        <h3>${escapeHtml(estimate.name || "Takeoff Estimate")}</h3>
        <p>${escapeHtml(projectLabel)}</p>
      </div>
      <span class="pill">${escapeHtml(compactDate(estimate.savedAt))}</span>
    </div>
    <div class="card-meta">
      ${estimate.system ? `<span class="pill">${escapeHtml(estimate.system)}</span>` : ""}
      ${estimate.projectType ? `<span class="pill">${escapeHtml(estimate.projectType)}</span>` : ""}
      ${estimate.adjustedArea ? `<span class="pill">${Math.ceil(estimate.adjustedArea).toLocaleString()} adjusted sq. ft.</span>` : ""}
      ${estimate.totalEstimate ? `<span class="pill">${takeoffMoney(estimate.totalEstimate)}</span>` : ""}
      ${estimate.waste ? `<span class="pill">${escapeHtml(estimate.waste)}% waste</span>` : ""}
      ${estimate.pricingType ? `<span class="pill">${escapeHtml(estimate.pricingType)}</span>` : ""}
    </div>
    <div class="manage-actions">
      <button class="mini-button" data-load-takeoff-estimate="${escapeHtml(estimate.id)}" type="button">Open</button>
      ${estimate.projectId ? `<button class="mini-button" data-type="project" data-id="${escapeHtml(estimate.projectId)}" type="button">Project</button>` : ""}
      <button class="mini-button danger-mini" data-delete-takeoff-estimate="${escapeHtml(estimate.id)}" type="button">Delete</button>
    </div>
  </article>`;
}

function renderTakeoffProductPicker() {
  if (!byId("takeoffProductCategoryInput")) return;
  const categories = ["All categories", ...new Set(takeoffProductOptions().map((item) => item.category))];
  fillSelect("takeoffProductCategoryInput", categories, byId("takeoffProductCategoryInput").value || "All categories");
  const category = byId("takeoffProductCategoryInput").value;
  const search = normalize(byId("takeoffProductSearchInput").value);
  const options = takeoffProductOptions().filter((item) => {
    const categoryMatch = category === "All categories" || item.category === category;
    const searchMatch = !search || normalize([item.match, item.number, item.category].join(" ")).includes(search);
    return categoryMatch && searchMatch;
  });
  byId("takeoffProductSelect").innerHTML = options.length
    ? options.map((item) => `<option value="${escapeHtml(item.match)}">${escapeHtml(`${item.number} | ${displayProductName(item.match)} | ${item.category}`)}</option>`).join("")
    : `<option value="">No matching products</option>`;
  byId("takeoffManualProducts").innerHTML = state.takeoffManualProducts.length
    ? state.takeoffManualProducts
        .map((item) => `<div class="manual-product-row">
          <span>${escapeHtml(`${item.qty || 1} ${item.unit || "units"} - ${productNumber(item.name)} | ${displayProductName(item.name)}`)}</span>
          <button class="mini-button danger-mini" data-remove-takeoff-product="${escapeHtml(item.id)}" type="button">Remove</button>
        </div>`)
        .join("")
    : `<p class="empty-state">No extra products added.</p>`;
}

function displayProductName(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bFr\b/g, "FR").replace(/\bHpr\b/g, "HPR").replace(/\bKee\b/g, "KEE");
}

function addManualTakeoffProduct() {
  const name = byId("takeoffProductSelect").value;
  if (!name) return;
  const mapped = mappedProductData(name);
  state.takeoffManualProducts.push({
    id: `manual-product-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    qty: Number(byId("takeoffProductQtyInput").value || 1),
    unit: mapped?.coverage?.includes("/roll") ? "rolls" : mapped?.size?.includes("pail") ? "pails" : mapped?.size?.includes("keg") ? "kegs" : "units",
  });
  saveTakeoffManualProducts();
  renderTakeoffEstimator();
}

function removeManualTakeoffProduct(id) {
  state.takeoffManualProducts = state.takeoffManualProducts.filter((item) => item.id !== id);
  saveTakeoffManualProducts();
  renderTakeoffEstimator();
}

function currentFavoriteSystemSnapshot() {
  const defaultName = defaultFavoriteSystemName();
  const name = prompt("Name this system", defaultName) || "";
  return {
    id: `favorite-system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    projectType: byId("takeoffProjectTypeInput").value,
    warrantyType: byId("takeoffWarrantyTypeInput").value,
    material: byId("takeoffMaterialInput").value,
    system: byId("takeoffSystemInput").value,
    warrantyTerm: byId("takeoffWarrantyTermInput").value,
    capSheet: byId("takeoffCapSheetInput").value,
    capAdhesive: byId("takeoffCapAdhesiveInput").value,
    baseSheet: byId("takeoffBaseSheetInput").value,
    baseAdhesive: byId("takeoffBaseAdhesiveInput").value,
    surfacing: byId("takeoffSurfacingInput").value,
    savedAt: new Date().toISOString(),
  };
}

function defaultFavoriteSystemName() {
  const term = byId("takeoffWarrantyTermInput").value || "";
  const cap = byId("takeoffCapSheetInput").value || byId("takeoffSystemInput").value || "";
  const warranty = byId("takeoffWarrantyTypeInput").value || "";
  const type = byId("takeoffProjectTypeInput").value || "";
  return [term, cap, warranty.includes("NDL") ? warranty.replace("Garland ", "") : "", type === "Restoration" ? byId("takeoffMaterialInput").value : ""]
    .filter(Boolean)
    .join(" | ") || "Favorite system";
}

function saveCurrentFavoriteSystem() {
  const favorite = currentFavoriteSystemSnapshot();
  if (!favorite.name.trim()) return;
  state.favoriteSystems.unshift(favorite);
  saveFavoriteSystems();
  state.takeoffMode = "systems";
  renderTakeoffEstimator();
}

function openFavoriteSystems() {
  state.takeoffMode = "systems";
  renderTakeoffEstimator();
}

function applyFavoriteSystem(favorite) {
  byId("takeoffProjectTypeInput").value = normalizeProjectTypeLabel(favorite.projectType || defaultProjectType);
  renderTakeoffSelectors();
  ["warrantyType", "material", "system", "warrantyTerm", "capSheet", "capAdhesive", "baseSheet", "baseAdhesive", "surfacing"].forEach((key) => {
    const id = `takeoff${key[0].toUpperCase()}${key.slice(1)}Input`;
    if (favorite[key] && byId(id)) byId(id).value = favorite[key];
    renderTakeoffSelectors();
  });
  renderTakeoffEstimator();
}

function favoriteSystemCard(system) {
  return `<article class="record-card favorite-system-card">
    <div class="record-topline">
      <div>
        <h3>${escapeHtml(system.name || "Favorite system")}</h3>
        <p>${escapeHtml([system.warrantyTerm, system.capSheet || system.system].filter(Boolean).join(" | "))}</p>
      </div>
      <span class="pill">${escapeHtml(compactDate(system.savedAt))}</span>
    </div>
    <div class="card-meta">
      ${system.projectType ? `<span class="pill">${escapeHtml(system.projectType)}</span>` : ""}
      ${system.warrantyType ? `<span class="pill">${escapeHtml(system.warrantyType)}</span>` : ""}
      ${system.material ? `<span class="pill">${escapeHtml(system.material)}</span>` : ""}
      ${system.baseSheet ? `<span class="pill">${escapeHtml(system.baseSheet)}</span>` : ""}
    </div>
    <div class="manage-actions">
      <button class="mini-button" data-load-favorite-system="${escapeHtml(system.id)}" type="button">Use System</button>
      <button class="mini-button danger-mini" data-delete-favorite-system="${escapeHtml(system.id)}" type="button">Delete</button>
    </div>
  </article>`;
}

function renderFavoriteSystems() {
  if (!byId("favoriteSystemsList")) return;
  byId("favoriteSystemsList").innerHTML = state.favoriteSystems.length
    ? state.favoriteSystems.map(favoriteSystemCard).join("")
    : `<p class="empty-state">No systems saved yet. Build a system, then click Save to My Systems.</p>`;
}

function loadFavoriteSystem(id) {
  const favorite = state.favoriteSystems.find((item) => item.id === id);
  if (favorite) applyFavoriteSystem(favorite);
}

function deleteFavoriteSystem(id) {
  state.favoriteSystems = state.favoriteSystems.filter((item) => item.id !== id);
  saveFavoriteSystems();
  renderTakeoffEstimator();
}

function takeoffCurrentSystem() {
  const catalog = takeoffCatalogForType(byId("takeoffProjectTypeInput")?.value);
  const material = takeoffMaterial(catalog, byId("takeoffMaterialInput")?.value);
  return takeoffSystem(material, byId("takeoffSystemInput")?.value);
}

function renderTakeoffSelectors() {
  if (!byId("takeoffProjectTypeInput")) return;
  const projectType = byId("takeoffProjectTypeInput").value || defaultProjectType;
  const catalog = takeoffCatalogForType(projectType);
  fillSelect("takeoffProjectTypeInput", projectTypes, normalizeProjectTypeLabel(projectType));
  fillSystemSelect("takeoffWarrantyTypeInput", catalog.warrantyTypes, byId("takeoffWarrantyTypeInput").value || "");
  fillSystemSelect("takeoffMaterialInput", catalog.materials.map((item) => item.name), byId("takeoffMaterialInput").value || "");
  const material = takeoffMaterial(catalog, byId("takeoffMaterialInput").value);
  fillSystemSelect("takeoffSystemInput", material.systems.map((item) => item.product), byId("takeoffSystemInput").value || "");
  const system = takeoffSystem(material, byId("takeoffSystemInput").value);
  fillSystemSelect("takeoffWarrantyTermInput", system.terms?.map((term) => `${term}-year`) || [], byId("takeoffWarrantyTermInput").value || "");
  const logic = systemLogic(system, {
    projectType: byId("takeoffProjectTypeInput").value,
    material: byId("takeoffMaterialInput").value,
    capSheet: byId("takeoffCapSheetInput").value,
    baseSheet: byId("takeoffBaseSheetInput").value,
    warrantyType: byId("takeoffWarrantyTypeInput").value,
  });
  fillSystemSelect("takeoffCapSheetInput", expandProductChoices(logic.capSheets), byId("takeoffCapSheetInput").value || "");
  fillSystemSelect("takeoffCapAdhesiveInput", expandProductChoices(logic.capAdhesives), byId("takeoffCapAdhesiveInput").value || "");
  fillSystemSelect("takeoffBaseSheetInput", expandProductChoices(logic.baseSheets), byId("takeoffBaseSheetInput").value || "");
  fillSystemSelect("takeoffBaseAdhesiveInput", expandProductChoices(logic.baseAdhesives), byId("takeoffBaseAdhesiveInput").value || "");
  fillSystemSelect("takeoffSurfacingInput", logic.surfacing, byId("takeoffSurfacingInput").value || "");
  byId("takeoffPrimerInput").value = primerForSystem(system, byId("takeoffMaterialInput").value);
}

function systemMatchesWarrantyFilters(system, selections) {
  const term = parseInt(String(selections.term || "").replace(/\D/g, ""), 10);
  const cap = normalize(selections.capSheet);
  const termMatch = !term || (system.terms || []).includes(term);
  const capOptions = expandProductChoices(system.capSheets || []).map(normalize);
  const capMatch = !cap || cap === "not applicable" || capOptions.includes(cap);
  return termMatch && capMatch;
}

function warrantyMaterialSystems(material, selections = {}) {
  return (material?.systems || []).filter((system) => systemMatchesWarrantyFilters(system, selections));
}

function warrantyOptionSets(material, projectType) {
  const isRestoration = normalizeProjectTypeLabel(projectType) === "Restoration";
  const terms = new Set();
  const caps = new Set();
  (material?.systems || []).forEach((system) => {
    (system.terms || []).forEach((term) => terms.add(`${term}-year`));
    if (!isRestoration) expandProductChoices(system.capSheets || []).forEach((cap) => caps.add(cap));
  });
  return {
    terms: [...terms].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
    caps: isRestoration ? ["Not applicable"] : [...caps].sort((a, b) => a.localeCompare(b)),
  };
}

function warrantySelections(system, logic) {
  return {
    warrantyType: byId("warrantyTypeInput")?.value || "",
    material: byId("warrantyMaterialInput")?.value || "",
    product: byId("warrantySystemInput")?.value || "",
    projectType: byId("warrantyProjectTypeInput")?.value || "",
    term: byId("warrantyTermInput")?.value || "",
    capSheet: byId("warrantyCapSheetInput")?.value || "",
    capAdhesive: byId("warrantyCapAdhesiveInput")?.value || "",
    baseSheet: byId("warrantyBaseSheetInput")?.value || "",
    baseAdhesive: byId("warrantyBaseAdhesiveInput")?.value || "",
    surfacing: byId("warrantySurfacingInput")?.value || "",
    primer: byId("warrantyPrimerInput")?.value || primerForSystem(system, byId("warrantyMaterialInput")?.value || ""),
    contractorWarranty: byId("warrantyContractorWarrantyInput")?.value || "",
    description: system.description || "",
    warnings: logic.warnings || [],
  };
}

function systemRollupNotesFromSelections(system, logic, selections) {
  const references = productReferenceLines(selections);
  return [
    `Warranty: ${selections.warrantyType || "Not selected"}${selections.term ? ` | ${selections.term}` : ""}`,
    `Material/System Type: ${selections.material || "Not selected"}`,
    "",
    "Product roll-up:",
    ...productCoverageLines(system, selections),
    "",
    "Coverage / requirements:",
    system.description ? `- ${system.description}` : "- Verify coverage rates against current Garland product data and final specification.",
    ...standardCoverageSpecLanguage.split("\n").map((line) => `- ${line}`),
    ...(logic.warnings || []).map((item) => `- ${item}`),
    "- Final coverage rates, sizes, and attachment patterns should be verified against the current Garland product data, warranty chart, and project specification.",
    "",
    "Warranty requirements / exceptions:",
    ...warrantyRequirementLines(selections.warrantyType, selections.contractorWarranty, selections.material, selections.product),
    "",
    "Product reference links:",
    ...(references.length ? references : ["- No direct product link mapped yet; verify against current Garland product data."]),
  ].join("\n");
}

function renderWarrantySummaryChart() {
  if (!byId("warrantyProjectTypeInput")) return;
  const projectType = normalizeProjectTypeLabel(byId("warrantyProjectTypeInput").value || defaultProjectType);
  const catalog = takeoffCatalogForType(projectType);
  fillSelect("warrantyProjectTypeInput", projectTypes, projectType);
  fillSystemSelect("warrantyTypeInput", catalog.warrantyTypes, byId("warrantyTypeInput").value || "");
  fillSystemSelect("warrantyMaterialInput", catalog.materials.map((item) => item.name), byId("warrantyMaterialInput").value || "");
  const material = takeoffMaterial(catalog, byId("warrantyMaterialInput").value);
  const optionSets = warrantyOptionSets(material, projectType);
  fillSystemSelect("warrantyCapSheetInput", optionSets.caps, byId("warrantyCapSheetInput").value || "");
  fillSystemSelect("warrantyTermInput", optionSets.terms, byId("warrantyTermInput").value || "");
  const filteredSystems = warrantyMaterialSystems(material, {
    capSheet: byId("warrantyCapSheetInput").value,
    term: byId("warrantyTermInput").value,
  });
  const systems = filteredSystems.length ? filteredSystems : material.systems;
  fillSystemSelect("warrantySystemInput", systems.map((item) => item.product), byId("warrantySystemInput").value || "");
  const system = takeoffSystem({ systems }, byId("warrantySystemInput").value);
  const logic = systemLogic(system, {
    projectType,
    material: byId("warrantyMaterialInput").value,
    capSheet: byId("warrantyCapSheetInput").value,
    baseSheet: byId("warrantyBaseSheetInput").value,
    warrantyType: byId("warrantyTypeInput").value,
  });
  fillSystemSelect("warrantyCapAdhesiveInput", expandProductChoices(logic.capAdhesives), byId("warrantyCapAdhesiveInput").value || "");
  fillSystemSelect("warrantyBaseSheetInput", expandProductChoices(logic.baseSheets), byId("warrantyBaseSheetInput").value || "");
  fillSystemSelect("warrantyBaseAdhesiveInput", expandProductChoices(logic.baseAdhesives), byId("warrantyBaseAdhesiveInput").value || "");
  fillSystemSelect("warrantySurfacingInput", logic.surfacing, byId("warrantySurfacingInput").value || "");
  fillSelect("warrantyContractorWarrantyInput", contractorWarrantyChoices(byId("warrantyTypeInput").value || ""), byId("warrantyContractorWarrantyInput").value || "Not selected");
  byId("warrantyPrimerInput").value = primerForSystem(system, byId("warrantyMaterialInput").value);
  const selections = warrantySelections(system, logic);
  byId("warrantySummaryCards").innerHTML = [
    summaryCard("Project Type", projectType),
    summaryCard("Warranty", selections.warrantyType || "Not selected"),
    summaryCard("Term", selections.term || "Not selected"),
    summaryCard(projectType === "Restoration" ? "Fluid Product" : "Cap Sheet", projectType === "Restoration" ? selections.product : selections.capSheet || "Not selected"),
  ].join("");
  const rows = systems.map((item) => {
    const itemLogic = systemLogic(item, {
      projectType,
      material: byId("warrantyMaterialInput").value,
      capSheet: selections.capSheet,
      warrantyType: selections.warrantyType,
    });
    const reqs = warrantyRequirementLines(selections.warrantyType, selections.contractorWarranty, byId("warrantyMaterialInput").value, item.product).slice(0, 3).join(" ");
    return `<tr>
      <td>${escapeHtml(selections.warrantyType || catalog.warrantyTypes[0] || "")}</td>
      <td>${escapeHtml((item.terms || []).map((term) => `${term}-year`).join(", "))}</td>
      <td>${escapeHtml(item.product)}</td>
      <td>${escapeHtml(expandProductChoices(itemLogic.capSheets).join(", ") || "Not applicable")}</td>
      <td>${escapeHtml(reqs || item.description || "Verify current warranty chart.")}</td>
    </tr>`;
  });
  byId("warrantySummaryRows").innerHTML = rows.join("");
  byId("warrantySummaryNotes").value = systemRollupNotesFromSelections(system, logic, selections);
}

function renderTakeoffEstimator() {
  if (!byId("takeoffProjectSelect")) return;
  const builderMode = state.takeoffMode === "builder";
  const systemsMode = state.takeoffMode === "systems";
  const savedMode = state.takeoffMode === "saved";
  byId("takeoffBuilderPanel").hidden = !builderMode;
  byId("takeoffSystemsPanel").hidden = !systemsMode;
  byId("takeoffSavedPanel").hidden = !savedMode;
  byId("takeoffBuilderTab").classList.toggle("is-active", builderMode);
  byId("takeoffSystemsTab").classList.toggle("is-active", systemsMode);
  byId("takeoffSavedTab").classList.toggle("is-active", savedMode);
  byId("saveTakeoffEstimateButton").textContent = state.activeTakeoffEstimateId ? "Update Estimate" : "Save Estimate";
  fillSelect("takeoffPricingTypeInput", pricingPrograms, state.filters.takeoffPricingType || "Series Pricing");
  fillSelect("takeoffPricingYearInput", availablePricingYears(), state.filters.takeoffPricingYear || String(today.getFullYear()));
  byId("priceBookYearInput").value = byId("priceBookYearInput").value || String(today.getFullYear());
  fillSelect("priceBookProgramInput", pricingPrograms, byId("priceBookProgramInput").value || selectedTakeoffPricingType());
  fillSelect("priceBookTypeInput", ["Auto-detect", ...priceBookTypes], byId("priceBookTypeInput").value || "Auto-detect");
  const selected = byId("takeoffProjectSelect").value || "";
  byId("takeoffProjectSelect").innerHTML = `<option value="">New standalone estimate</option>${cleanProjects()
    .map((project) => `<option value="${escapeHtml(project.id)}" ${selected === project.id ? "selected" : ""}>${escapeHtml(project.projectName || project.client || "Project")}</option>`)
    .join("")}`;
  fillSelect("takeoffProjectFilter", ["All projects", "Standalone", ...cleanProjects().map((project) => ({ value: project.id, label: project.projectName || project.client || "Project" }))], state.filters.takeoffProject);
  byId("takeoffSearchFilter").value = state.filters.takeoffSearch;
  byId("takeoffSortFilter").value = state.filters.takeoffSort;
  applyControlColor(byId("takeoffProjectFilter"));
  applyControlColor(byId("takeoffSortFilter"));
  syncDirectionButton("takeoffSortDirection", state.filters.takeoffDirection);
  renderTakeoffSelectors();
  renderTakeoffProductPicker();
  const area = Number(byId("takeoffSqftInput")?.value || 0);
  const adjusted = takeoffAdjustedArea();
  const rows = takeoffEstimatorRows();
  const total = takeoffRowsTotal(rows);
  byId("takeoffSummary").innerHTML = `
    <span><strong>Measured Area:</strong> ${area ? Math.round(area).toLocaleString() : "0"} sq. ft.</span>
    <span><strong>Adjusted Area:</strong> ${adjusted ? Math.ceil(adjusted).toLocaleString() : "0"} sq. ft.</span>
    <span><strong>Waste:</strong> ${escapeHtml(byId("takeoffWasteInput")?.value || "10")}%</span>
    <span><strong>Pricing:</strong> ${escapeHtml(selectedTakeoffPricingYear())} ${escapeHtml(selectedTakeoffPricingType())}</span>
    <span><strong>Total Estimate:</strong> ${takeoffMoney(total)}</span>
  `;
  byId("takeoffResults").innerHTML = rows.join("");
  renderPriceBookList();
  applyLayout("takeoffEstimateList", "takeoffEstimates");
  byId("takeoffEstimateList").innerHTML = listWrap(
    filteredTakeoffEstimates(),
    takeoffEstimateCard,
    "No saved takeoff estimates match this view.",
    state.layouts.takeoffEstimates === "kanban" ? (item) => item.projectName || "Standalone" : null
  );
  renderFavoriteSystems();
}

function renderPriceBookList() {
  const selectedProgram = selectedTakeoffPricingType();
  const books = matchingPriceBooks(selectedProgram);
  byId("priceBookList").innerHTML = books.length
    ? books
        .map(
          (book) => `<div class="price-book-row">
            <div>
              <strong>${escapeHtml(book.name)}</strong>
              <span>${escapeHtml([book.year, book.program || "Series Pricing", book.type, fileSizeLabel(book.size), `${book.extractedCount || 0} matched products`].filter(Boolean).join(" | "))}</span>
            </div>
            <div class="manage-actions">
              ${book.dataUrl ? `<a class="mini-button" href="${book.dataUrl}" download="${escapeHtml(book.name)}">Open</a>` : ""}
              <button class="mini-button danger-mini" data-delete-price-book="${escapeHtml(book.id)}" type="button">Delete</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="empty-state">No price books match ${escapeHtml(selectedProgram)} yet.</p>`;
}

async function addPriceBookFiles(files) {
  if (!files?.length) return;
  if (!confirmLargeLocalFiles(files, "price book uploads")) return;
  const year = byId("priceBookYearInput")?.value || String(today.getFullYear());
  const program = byId("priceBookProgramInput")?.value || selectedTakeoffPricingType();
  const selectedType = byId("priceBookTypeInput")?.value || "Auto-detect";
  for (const file of [...files]) {
    const entry = {
      id: `price-book-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      program,
      type: selectedType === "Auto-detect" ? inferPriceBookType(file.name) : selectedType,
      year,
      size: file.size,
      dataUrl: "",
      extractedCount: 0,
      uploadedAt: new Date().toISOString(),
    };
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    entry.dataUrl = dataUrl;
    const extracted = await readPriceBookProducts(file, entry);
    entry.extractedCount = extracted.length;
    if (extracted.length) {
      const keys = new Set(extracted.map((item) => `${item.year}|${item.program}|${item.number}`));
      state.priceBookProducts = state.priceBookProducts.filter((item) => !keys.has(`${item.year}|${item.program}|${item.number}`)).concat(extracted);
    }
    state.priceBooks.unshift(entry);
    if (!savePriceBooks()) state.priceBooks.shift();
    state.filters.takeoffPricingYear = String(year);
    renderTakeoffEstimator();
  }
}

function deletePriceBook(id) {
  const book = state.priceBooks.find((item) => item.id === id);
  state.priceBooks = state.priceBooks.filter((book) => book.id !== id);
  if (book) {
    state.priceBookProducts = state.priceBookProducts.filter((item) => item.sourceName !== book.name || String(item.year) !== String(book.year) || item.program !== book.program);
  }
  savePriceBooks();
  renderTakeoffEstimator();
}

function setTakeoffMode(mode) {
  state.takeoffMode = ["saved", "systems"].includes(mode) ? mode : "builder";
  renderTakeoffEstimator();
}

function loadTakeoffProject(projectId) {
  const project = findRecord("project", projectId);
  state.activeTakeoffEstimateId = "";
  state.takeoffManualProducts = [];
  saveTakeoffManualProducts();
  byId("takeoffProjectSelect").value = projectId || "";
  if (!project) {
    byId("takeoffNameInput").value = "";
    byId("takeoffSqftInput").value = "";
    byId("takeoffProjectTypeInput").value = defaultProjectType;
    renderTakeoffEstimator();
    return;
  }
  byId("takeoffNameInput").value = project.projectName || project.client || "";
  byId("takeoffSqftInput").value = project.squareFeet || "";
  byId("takeoffProjectTypeInput").value = normalizeProjectTypeLabel(project.projectType || defaultProjectType);
  renderTakeoffSelectors();
  if (project.systemWarrantyType) byId("takeoffWarrantyTypeInput").value = project.systemWarrantyType;
  if (project.systemMaterial) byId("takeoffMaterialInput").value = project.systemMaterial;
  renderTakeoffSelectors();
  if (project.systemProduct) byId("takeoffSystemInput").value = project.systemProduct;
  renderTakeoffSelectors();
  if (project.systemWarrantyTerm) byId("takeoffWarrantyTermInput").value = project.systemWarrantyTerm;
  if (project.systemCapSheet) byId("takeoffCapSheetInput").value = project.systemCapSheet;
  if (project.systemCapAdhesive) byId("takeoffCapAdhesiveInput").value = project.systemCapAdhesive;
  if (project.systemBaseSheet) byId("takeoffBaseSheetInput").value = project.systemBaseSheet;
  if (project.systemBaseAdhesive) byId("takeoffBaseAdhesiveInput").value = project.systemBaseAdhesive;
  if (project.systemSurfacing) byId("takeoffSurfacingInput").value = project.systemSurfacing;
  const recordedSlope = state.projectChecklists[project.id]?.recordedSlope?.value;
  if (recordedSlope) byId("takeoffSlopeInput").value = String(slopeRiseValue(recordedSlope));
  renderTakeoffEstimator();
}

function openTakeoffForProject(projectId) {
  const dialog = byId("recordQuickDialog");
  if (dialog?.open) dialog.close();
  state.takeoffMode = "builder";
  setView("takeoffEstimator");
  loadTakeoffProject(projectId);
}

function showAccountActivityLog(accountId) {
  const account = findRecord("account", accountId);
  if (!account) return;
  state.search = "";
  byId("globalSearch").value = "";
  state.filters.activityAccount = account.client || "All accounts";
  state.filters.activityEntity = "All entities";
  state.filters.activityCounty = "All counties";
  state.filters.activityRep = "All reps";
  state.filters.activityDate = "all";
  state.filters.activityDirection = "desc";
  setView("activityLog");
  renderFilters();
  renderActivityLog();
}

function renderProposals() {
  const records = cleanProposals().filter((item) => {
    return (
      includesSearch(item) &&
      dataQualityMatch("proposal", item) &&
      (state.filters.proposalStage === "All proposal stages" || item.stage === state.filters.proposalStage) &&
      (state.filters.contractor === "All contractors" || item.awardedContractor === state.filters.contractor) &&
      proposalBidStatusMatch(item) &&
      proposalAgingMatch(item)
    );
  }).sort(sortProposals);
  applyLayout("proposalsList", "proposals");
  byId("proposalsList").innerHTML = listWrap(records, proposalCard, "No proposals match this view.", state.layouts.proposals === "kanban" ? (item) => item.stage : null, proposalStages);
}

function renderContractors() {
  const records = contractorRecords()
    .filter(includesSearch)
    .filter((item) => dataQualityMatch("contractor", item))
    .filter((item) => state.filters.contractorWin === "all" || (state.filters.contractorWin === "wins" ? item.wins > 0 : item.wins === 0))
    .sort(sortContractors);
  applyLayout("contractorsList", "contractors");
  byId("contractorsList").innerHTML = listWrap(
    records,
    contractorCard,
    "No contractors match this view.",
    state.layouts.contractors === "kanban" ? (item) => (item.wins ? "Has Wins" : "No Wins Yet") : null
  );
}

function renderScopeDatabase() {
  const search = normalize(state.filters.scopeSearch);
  const category = state.filters.scopeCategory;
  const records = scopeDatabaseRecords()
    .filter((item) => category === "All categories" || item.category === category)
    .filter((item) => !search || normalize([item.name, item.category, item.sourceTitle, item.sourceType].join(" ")).includes(search))
    .sort(sortScopes);
  applyLayout("scopeDatabaseList", "scopeDatabase");
  byId("scopeDatabaseList").innerHTML = listWrap(
    records,
    scopeDatabaseCard,
    "No scopes of work saved yet.",
    state.layouts.scopeDatabase === "kanban" ? (item) => item.category || "Uncategorized" : null
  );
}

function scopeDatabaseCard(item) {
  return `<article class="record-card scope-card">
    <div>
      <h3>${escapeHtml(item.name || "Scope of Work")}</h3>
      <p>${escapeHtml([item.sourceTitle, compactDate(item.savedAt)].filter(Boolean).join(" • "))}</p>
      <div class="card-meta">
        <span class="pill">${escapeHtml(item.category || "Uncategorized")}</span>
        ${item.sourceType ? `<span class="pill">${escapeHtml(item.sourceType)}</span>` : ""}
      </div>
    </div>
    <div class="scope-card-actions">
      ${fileLink(item)}
      ${item.builtIn ? `<button class="mini-button" data-use-scope-template="${escapeHtml(item.libraryId)}" type="button">Use Template</button>` : `<button class="mini-button danger-mini" data-delete-scope-db="${escapeHtml(item.id)}" type="button">Delete</button>`}
    </div>
  </article>`;
}

function sortScopes(a, b) {
  const direction = state.filters.scopeDirection;
  if (state.filters.scopeSort === "name") return compareText(a.name, b.name, direction);
  if (state.filters.scopeSort === "category") return compareText(a.category, b.category, direction) || compareText(a.name, b.name, direction);
  if (state.filters.scopeSort === "source") return compareText(a.sourceTitle, b.sourceTitle, direction) || compareText(a.name, b.name, direction);
  return compareNumber(dateValue(a.savedAt), dateValue(b.savedAt), direction);
}

function newsReportAccounts() {
  const selectedCounties = new Set(territoryCountyOptions().map(normalize));
  return cleanAccounts()
    .filter((account) => account.client && !normalize(account.entity).includes("private"))
    .filter((account) => !selectedCounties.size || selectedCounties.has(normalize(account.county)))
    .sort((a, b) => compareText(a.county, b.county) || compareText(a.entity, b.entity) || compareText(a.client, b.client));
}

function newsReportPrompt() {
  const stateCode = String(territorySettings.state || "").trim().toUpperCase();
  const counties = territoryCountyOptions();
  const entities = newsReportAccounts();
  const entityLines = entities.map((account) =>
    `- ${account.client}${account.entity ? ` | ${account.entity}` : ""}${account.county ? ` | ${account.county} County${stateCode ? `, ${stateCode}` : ""}` : ""}`
  );
  return `Search for roofing-related movement across my defined territory using a movement-based intelligence system with rolling 90-day tracking.

Territory:
- State: ${stateCode || "[STATE NOT SET - use Territory Settings]"}
- Territory population: ${formatPopulation(territorySettings.population) || "[POPULATION NOT SET]"}
- Counties: ${counties.length ? counties.map((county) => `${county}${stateCode ? ` County, ${stateCode}` : " County"}`).join("; ") : "[NO COUNTIES SET]"}
- Entities to scan: non-private entities only from the list below.
${entityLines.length ? entityLines.join("\n") : "- [NO NON-PRIVATE ENTITIES FOUND]"}

Scope:
Scan all entities that are not private that are listed in this CRM in the counties I have provided. Make sure the county is in the state above.

Time Window:
- Include ONLY content from the last 90 days from ${toLocalDateKey(today)}
- Include both newly posted content AND previously posted items within the 90-day window
- Do NOT include anything older than 90 days

Sources:
1. Official sources:
   - Board agendas and packets
   - Procurement portals (bids, RFQs, RFPs, addenda)
   - Entity websites

2. Video + transcript sources:
   - YouTube
   - Granicus / Legistar
   - Vimeo / Facebook archives
   - Extract transcript if available

3. Web discovery:
   - Google search
   - News articles
   - Public notices
   - Bid aggregators
   - PDFs

Keywords:
roof, roofing, reroof, leak, leaking, waterproofing, building envelope, storm damage, hail damage, capital improvement, facilities assessment, bond, architect, engineer

Include EARLY WARNING signals:
- Architect or engineer selection
- Facilities assessments
- Bond programs
- CMAR selection
- Design RFQs

Movement Filter:
ONLY report if one of the following occurs:
- New roofing-related bid, RFQ, or RFP
- Addendum issued
- Award
- Scope change
- Agenda item referencing roofing or building envelope
- Transcript discussion tied to a real building or campus
- Maintenance leak or water intrusion tied to a specific facility
- Repeated leak or repair discussions indicating escalation

Exclude:
- General chatter not tied to a facility
- Warranty-only discussions
- Storm mentions with no owner action
- Non-facilities architect work

Validation:
- Confirm with multiple sources when possible
- Assign confidence level: High / Medium / Low

Output Format:
Group results EXACTLY as:

Last 30 Days (0-30)
Last 60 Days (31-60)
Last 90 Days (61-90)

For each item include:
- Entity
- Source link(s)
- Original detection date
- Days since detection (Day X)
- Summary
- Severity Level (1-3)
- Spec Risk (High / Medium / Low)
- Confidence (High / Medium / Low)
- Suggested Next Action

Rules:
- Do NOT include entities with no activity
- Keep output concise and strategic`;
}

function renderNewsReport() {
  const accounts = newsReportAccounts();
  const counties = territoryCountyOptions();
  const stateCode = String(territorySettings.state || "").trim().toUpperCase();
  byId("newsTerritorySummary").innerHTML = `
    <div class="dashboard-card">
      <h3>Territory Scan Inputs</h3>
      <div class="dashboard-table">
        ${metricRow("State", stateCode || "Set in Territory Settings", "newsReport")}
        ${metricRow("Population", formatPopulation(territorySettings.population) || "Set in Territory Settings", "newsReport")}
        ${metricRow("Counties", counties.length, "newsReport")}
        ${metricRow("Non-Private Entities", accounts.length, "newsReport")}
      </div>
    </div>
    <div class="dashboard-card">
      <h3>How To Use</h3>
      <p class="news-copy">Copy the report prompt, then open ChatGPT or Gemini and paste it there to run the 90-day scan. GRIP prepares the territory-aware research instructions from your state, counties, and non-private accounts, but this local app does not crawl the web by itself.</p>
    </div>
  `;
  byId("newsPromptPreview").value = newsReportPrompt();
}

function sortAccounts(a, b) {
  const direction = state.filters.accountDirection;
  if (state.filters.accountSort === "rank") return compareNumber(accountRankOrder(a.clientRanking), accountRankOrder(b.clientRanking), direction) || compareText(a.client, b.client, direction);
  if (state.filters.accountSort === "entity") return compareText(a.entity, b.entity, direction) || compareText(a.client, b.client, direction);
  if (state.filters.accountSort === "county") return compareText(a.county, b.county, direction) || compareText(a.client, b.client, direction);
  if (state.filters.accountSort === "activity") {
    return compareNumber(dateValue(latestAccountActivity(a)?.createdAt), dateValue(latestAccountActivity(b)?.createdAt), direction);
  }
  return compareText(a.client, b.client, direction);
}

function sortProjects(a, b) {
  const rejected = compareProposalRejectedLast(a, b);
  if (rejected) return rejected;
  const direction = state.filters.projectDirection;
  if (state.filters.projectSort === "client") return compareText(a.client, b.client, direction) || compareText(a.projectName, b.projectName, direction);
  if (state.filters.projectSort === "project") return compareText(a.projectName, b.projectName, direction);
  if (state.filters.projectSort === "score") return compareNumber(scoreRank(a.abcList), scoreRank(b.abcList), direction);
  if (state.filters.projectSort === "start") return compareNumber(quarterRank(a.anticipatedStartDate), quarterRank(b.anticipatedStartDate), direction);
  if (state.filters.projectSort === "materials") return compareNumber(projectMaterials(a), projectMaterials(b), direction);
  if (state.filters.projectSort === "commission") return compareNumber(projectCommission(a), projectCommission(b), direction);
  return compareNumber(stageRank(a.stage), stageRank(b.stage), direction) || compareText(a.projectName, b.projectName, direction);
}

function proposalBidStatusMatch(proposal) {
  if (state.filters.proposalBidStatus === "All bid statuses") return true;
  const bidding = splitContractors(proposal.biddingContractors).length;
  const received = splitContractors(proposal.bidsReceived).length;
  if (state.filters.proposalBidStatus === "All bids received") return bidding > 0 && received >= bidding;
  if (state.filters.proposalBidStatus === "Missing bids") return bidding > 0 && received < bidding;
  return bidding === 0;
}

function proposalAgingMatch(proposal) {
  return state.filters.proposalAging === "all" || proposalAgingStatus(proposal) === state.filters.proposalAging;
}

function dataQualityMatch(type, record) {
  const filter = state.filters.dataQuality || "all";
  if (filter === "all") return true;
  if (type === "account") {
    if (filter === "accountMissingEntity") return !normalize(record.entity);
    if (filter === "accountMissingCounty") return !normalize(record.county);
    if (filter === "accountMissingContact") return !normalize(record.phone) || !normalize(record.email);
  }
  if (type === "project" && filter === "projectMissingAddress") return !normalize(record.address);
  if (type === "proposal" && filter === "proposalMissingDueDate") return isOpenProposal(record) && !dateValue(record.bidDueDate);
  if (type === "contractor" && filter === "contractorMissingEmail") return !normalize(record.email);
  return true;
}

function sortContractors(a, b) {
  const direction = state.filters.contractorDirection;
  if (state.filters.contractorSort === "opportunities") return compareNumber(a.opportunities, b.opportunities, direction) || compareText(a.companyName, b.companyName);
  if (state.filters.contractorSort === "wins") return compareNumber(a.wins, b.wins, direction) || compareText(a.companyName, b.companyName);
  if (state.filters.contractorSort === "lastGiven") return compareNumber(dateValue(a.lastGiven), dateValue(b.lastGiven), direction) || compareText(a.companyName, b.companyName);
  if (state.filters.contractorSort === "lastWon") return compareNumber(dateValue(a.lastWon), dateValue(b.lastWon), direction) || compareText(a.companyName, b.companyName);
  return compareText(a.companyName, b.companyName, direction);
}

function sortProposals(a, b) {
  const rejected = compareProposalRejectedLast(a, b);
  if (rejected) return rejected;
  const direction = state.filters.proposalDirection;
  if (state.proposalSort === "dueDate") {
    return compareDateValue(a.bidDueDate, b.bidDueDate, direction) || compareText(a.client, b.client) || compareText(a.project, b.project);
  }
  if (state.proposalSort === "client") {
    return compareText(a.client, b.client, direction) || compareText(a.project, b.project, direction);
  }
  if (state.proposalSort === "project") {
    return compareText(a.project, b.project, direction) || compareText(a.client, b.client, direction);
  }
  return compareNumber(proposalStageRank(a.stage), proposalStageRank(b.stage)) || compareDateValue(a.bidDueDate, b.bidDueDate, direction) || compareText(a.client, b.client);
}

function empty(message) {
  return `<p class="empty-state">${message}</p>`;
}

function renderFilters() {
  fillSelect("rankFilter", ["All rankings", ...accountRankOptions], state.filters.rank);
  fillSelect("entityFilter", ["All entities", ...accountEntityOptions()], state.filters.entity);
  fillSelect("countyFilter", ["All counties", ...accountCountyOptions()], state.filters.county);
  fillSelect("accountActivityFilter", [
    { value: "All activity", label: "All Activity" },
    { value: "green", label: "Green" },
    { value: "yellow", label: "Yellow" },
    { value: "red", label: "Red" },
  ], state.filters.accountActivity);
  byId("accountSortFilter").value = state.filters.accountSort;
  applyControlColor(byId("accountSortFilter"));
  syncDirectionButton("accountSortDirection", state.filters.accountDirection);
  fillSelect("activityAccountFilter", ["All accounts", ...accountNames()], state.filters.activityAccount);
  fillSelect("activityEntityFilter", ["All entities", ...accountEntityOptions()], state.filters.activityEntity);
  fillSelect("activityCountyFilter", ["All counties", ...accountCountyOptions()], state.filters.activityCounty);
  fillSelect("activityRepFilter", ["All reps", ...unique(cleanAccounts(), "sharedRep", "").filter(Boolean)], state.filters.activityRep);
  byId("activityDateFilter").value = state.filters.activityDate;
  applyControlColor(byId("activityDateFilter"));
  syncDirectionButton("activitySortDirection", state.filters.activityDirection);
  fillSelect("taskAccountFilter", ["All accounts", ...accountNames()], state.filters.taskAccount);
  fillSelect("taskTypeFilter", ["All task types", ...taskTypes], state.filters.taskType);
  fillSelect("taskPriorityFilter", ["All priorities", ...taskPriorities], state.filters.taskPriority);
  fillSelect("taskStatusFilter", ["Open tasks", "All statuses", ...taskStatuses], state.filters.taskStatus);
  fillSelect("taskAssignedFilter", ["All users", ...new Set(state.tasks.map((task) => task.assigned_user).filter(Boolean))], state.filters.taskAssigned);
  byId("taskDueFilter").value = state.filters.taskDue;
  byId("taskSortFilter").value = state.filters.taskSort;
  byId("taskSearchInput").value = state.filters.taskSearch;
  applyControlColor(byId("taskDueFilter"));
  syncDirectionButton("taskSortDirection", state.filters.taskDirection);
  fillSelect("punchProjectFilter", ["All projects", ...new Set(state.punchLists.map((list) => list.project_name).filter(Boolean))], state.filters.punchProject);
  fillSelect("punchContractorFilter", ["All contractors", ...contractorNames()], state.filters.punchContractor);
  fillSelect("punchStatusFilter", ["All statuses", ...punchListStatuses, ...punchItemStatuses.filter((status) => !punchListStatuses.includes(status))], state.filters.punchStatus);
  fillSelect("punchSeverityFilter", ["All severities", ...punchSeverities], state.filters.punchSeverity);
  fillSelect("punchCategoryFilter", ["All categories", ...punchCategories], state.filters.punchCategory);
  byId("punchSortFilter").value = state.filters.punchSort;
  byId("punchSearchInput").value = state.filters.punchSearch;
  syncDirectionButton("punchSortDirection", state.filters.punchDirection);
  fillSelect("projectStageFilter", ["All project stages", ...projectStages], state.filters.projectStage);
  fillSelect("projectRankFilter", ["All project rankings", ...abcScores], state.filters.projectRank);
  fillSelect("projectContractorFilter", ["All contractors", ...contractorNames()], state.filters.projectContractor);
  byId("projectSortFilter").value = state.filters.projectSort;
  applyControlColor(byId("projectSortFilter"));
  syncDirectionButton("projectSortDirection", state.filters.projectDirection);
  fillSelect("projectStageInput", projectStages, "Prospecting");
  fillSelect("projectScoreInput", abcScores, "C (25%)");
  fillSelect("projectStartYearInput", projectYearOptions(), String(today.getFullYear()));
  fillSelect("projectTypeInput", projectTypes, defaultProjectType);
  renderSystemBuilder();
  fillSelect("proposalStageFilter", ["All proposal stages", ...proposalStages], state.filters.proposalStage);
  fillSelect("contractorFilter", ["All contractors", ...contractorNames()], state.filters.contractor);
  fillSelect("proposalBidStatusFilter", ["All bid statuses", "All bids received", "Missing bids", "No contractors listed"], state.filters.proposalBidStatus);
  syncDirectionButton("proposalSortDirection", state.filters.proposalDirection);
  fillSelect("proposalStageInput", proposalStages, "Working on Ramp & SOW");
  fillSelect("awardedContractorInput", ["Not awarded yet", ...contractorNames()], "Not awarded yet");
  byId("proposalStageInput").value = "Working on Ramp & SOW";
  fillSelect("proposalEntityInput", ["", ...accountEntityOptions()], byId("proposalEntityInput").value || "");
  fillSelect("proposalCountyInput", ["", ...accountCountyOptions()], byId("proposalCountyInput").value || "");
  byId("clientOptions").innerHTML = accountNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  byId("contractorSortFilter").value = state.filters.contractorSort;
  applyControlColor(byId("contractorSortFilter"));
  syncDirectionButton("contractorSortDirection", state.filters.contractorDirection);
  byId("contractorWinFilter").value = state.filters.contractorWin;
  applyControlColor(byId("contractorWinFilter"));
  byId("callListSortFilter").value = state.filters.callListSort;
  applyControlColor(byId("callListSortFilter"));
  syncDirectionButton("callListSortDirection", state.filters.callListDirection);
  byId("scopeCategoryFilter").value = state.filters.scopeCategory;
  applyControlColor(byId("scopeCategoryFilter"));
  byId("scopeSortFilter").value = state.filters.scopeSort;
  applyControlColor(byId("scopeSortFilter"));
  syncDirectionButton("scopeSortDirection", state.filters.scopeDirection);
  if (byId("takeoffProjectFilter")) {
    fillSelect("takeoffProjectFilter", ["All projects", "Standalone", ...cleanProjects().map((project) => ({ value: project.id, label: project.projectName || project.client || "Project" }))], state.filters.takeoffProject);
    byId("takeoffSearchFilter").value = state.filters.takeoffSearch;
    byId("takeoffSortFilter").value = state.filters.takeoffSort;
    applyControlColor(byId("takeoffProjectFilter"));
    applyControlColor(byId("takeoffSortFilter"));
    syncDirectionButton("takeoffSortDirection", state.filters.takeoffDirection);
  }
  renderCallListControls();
}

function syncDirectionButton(id, direction) {
  const button = byId(id);
  if (!button) return;
  button.dataset.direction = direction;
  button.textContent = direction === "desc" ? "↓" : "↑";
  button.classList.toggle("is-desc", direction === "desc");
}

function applyControlColor(control) {
  if (!control) return;
  const colorClasses = ["control-green", "control-yellow", "control-red", "control-blue", "control-orange", "control-purple", "control-dark"];
  control.classList.remove(...colorClasses);
  const value = normalize(control.value);
  if (!value || value.includes("all ")) return;
  if (value === "green" || value.includes("a 90") || value === "a" || value.includes("approved") || value.includes("completed")) control.classList.add("control-green");
  else if (value === "yellow" || value.includes("b 50") || value === "b" || value.includes("sent")) control.classList.add("control-yellow");
  else if (value === "red" || value.includes("c 25") || value === "c" || value.includes("rejected") || value.includes("stale") || value.includes("missing")) control.classList.add("control-red");
  else if (value.includes("job won") || value.includes("job secured") || value.includes("po received") || value.includes("project awarded") || value.includes("wins")) control.classList.add("control-blue");
  else if (value.includes("prospecting") || value.includes("opportunit")) control.classList.add("control-orange");
  else if (value.includes("pre bid") || value.includes("requested") || value.includes("hold")) control.classList.add("control-purple");
  else if (value.includes("budget approved")) control.classList.add("control-dark");
  else {
    const entityColor = entityClass(control.value).replace("entity-", "control-entity-");
    if (entityColor !== "") control.classList.add(entityColor);
  }
}

function projectYearOptions() {
  const start = today.getFullYear();
  return Array.from({ length: 26 }, (_, index) => String(start + index));
}

function inchFractionOptions(max = 120) {
  const fractions = ["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"];
  const values = [];
  for (let inch = 0; inch <= max; inch += 1) {
    fractions.forEach((fraction) => {
      if (inch === 0 && !fraction) values.push("0");
      else if (inch === 0 && fraction) values.push(fraction);
      else values.push(fraction ? `${inch} ${fraction}` : String(inch));
    });
  }
  return values;
}

function renderInchFractionOptions() {
  const list = byId("inchFractionOptions");
  if (!list) return;
  list.innerHTML = inchFractionOptions().map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function inchFractionSelectOptions(value = "") {
  return [`<option value="">Choose fraction</option>`, ...inchFractionOptions().map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)} in</option>`)].join("");
}

function field(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function summaryCard(label, value) {
  return `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not selected")}</strong></div>`;
}

function editableField(type, id, key, label, value, options = null) {
  const display = key === "stage" || key === "clientRanking" || key === "abcList"
    ? `<strong><span class="pill ${rankClass(value)}">${escapeHtml(value)}</span></strong>`
    : key === "entity"
      ? `<strong><span class="pill ${entityClass(value)}"${territoryPillStyle("entity", value)}>${escapeHtml(value || "")}</span></strong>`
    : key === "county"
      ? `<strong><span class="pill"${territoryPillStyle("county", value)}>${escapeHtml(value || "")}</span></strong>`
    : `<strong>${escapeHtml(value || "")}</strong>`;
  const optionList = options ? ` data-options="${escapeHtml(options.join("|"))}"` : "";
  return `<div class="field editable-field" data-edit-type="${type}" data-edit-id="${escapeHtml(id)}" data-edit-key="${key}"${optionList}>
    <span>${escapeHtml(label)}</span>${display}
  </div>`;
}

function detailHeader(type, id, title, subtitle = "") {
  return `<div class="detail-actions">
    <div>
      <h3>${title}</h3>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </div>
    <div class="detail-header-actions">
      <button class="edit-button" data-edit-record="${type}" data-edit-id="${escapeHtml(id)}" type="button">Edit</button>
    </div>
  </div>`;
}

function followUpEvent(type, record) {
  const title = type === "account"
    ? `Follow up: ${record.client || "Account"}`
    : type === "project"
      ? `Follow up: ${record.projectName || record.project || record.client || "Project"}`
      : `Follow up: ${record.project || record.client || "Proposal"}`;
  return {
    uid: `grip-${type}-${record.id}-follow-up`,
    title,
    startDate: calendarDateKey(record.nextFollowUp),
    description: `GRIP follow-up reminder.\nClient: ${record.client || record.clientName || ""}\nRecord type: ${type}`,
    location: type === "proposal" ? proposalRequestAddress(record) : record.address || "",
  };
}

function bidDueEvent(proposal) {
  return {
    uid: `grip-proposal-${proposal.id}-bid-due`,
    title: `Bid due: ${proposal.project || proposal.client || "Proposal"}`,
    startDate: calendarDateKey(proposal.bidDueDate),
    description: `Proposal bid due.\nClient: ${proposal.client || ""}\nBidding contractors: ${proposal.biddingContractors || ""}`,
    location: proposalRequestAddress(proposal),
  };
}

function projectStartEvent(project) {
  const startDate = quarterStartDate(project.anticipatedStartDate) || calendarDateKey(project.nextFollowUp);
  return {
    uid: `grip-project-${project.id}-start`,
    title: `Projected start: ${project.projectName || project.project || project.client || "Project"}`,
    startDate,
    description: `GRIP project start reminder.\nClient: ${project.client || ""}\nAnticipated start: ${project.anticipatedStartDate || ""}`,
    location: project.address || "",
  };
}

function callListEvent(account, day = todayCallDay()) {
  return {
    uid: `grip-call-${account.id}-${day}`,
    title: `Call: ${account.client || "Account"}`,
    startDate: callListDateForDay(day),
    description: `GRIP call list follow-up.\nContact: ${[account.poc, account.phone, account.email].filter(Boolean).join(" | ")}\nEntity: ${account.entity || ""}\nCounty: ${account.county || ""}`,
    location: account.address || "",
  };
}

function callRuleEvent(rule) {
  return {
    uid: `grip-call-rule-${rule.id}`,
    title: `${rule.day} Call List: ${rule.value}`,
    startDate: callListDateForDay(rule.day),
    description: `Recurring GRIP call list block.\nAssign by: ${rule.type}\nValue: ${rule.value}`,
    recurrence: `RRULE:FREQ=WEEKLY;BYDAY=${dayCode(rule.day)}`,
  };
}

function calendarSection(type, record) {
  const sections = [
    `<div><strong>Add to Calendar</strong>${calendarButtons(followUpEvent(type, record))}</div>`,
  ];
  if (type === "proposal" && record.bidDueDate) sections.push(`<div><strong>Add Proposal Bid Due Date</strong>${calendarButtons(bidDueEvent(record), "Add Bid Due Date")}</div>`);
  if (type === "project" && record.anticipatedStartDate) sections.push(`<div><strong>Add Project Start Reminder</strong>${calendarButtons(projectStartEvent(record), "Add Start Reminder")}</div>`);
  return `<section class="detail-section">
    <h4>Calendar</h4>
    <div class="calendar-tool-list">${sections.join("")}</div>
  </section>`;
}

function calendarQuickActions(type, record) {
  const actions = [calendarButtons(followUpEvent(type, record), "Add to Calendar")];
  if (type === "proposal" && record.bidDueDate) actions.push(calendarButtons(bidDueEvent(record), "Add Bid Due Date"));
  if (type === "project" && record.anticipatedStartDate) actions.push(calendarButtons(projectStartEvent(record), "Add Start Reminder"));
  return actions.join("");
}

function projectSystemSection(record) {
  if (!record.projectType && !record.systemProduct && !record.contractorWarranty) return "";
  const isRestoration = normalizeProjectTypeLabel(record.projectType || "") === "Restoration";
  const assemblyFields = isRestoration
    ? ""
    : `
      ${field("Cap Sheet", record.systemCapSheet)}
      ${field("Cap Sheet Adhesive", record.systemCapAdhesive)}
      ${field("Base Sheet", record.systemBaseSheet)}
      ${field("Base Sheet Adhesive", record.systemBaseAdhesive)}
      ${field("Surfacing", record.systemSurfacing)}
    `;
  return `<section class="detail-section system-summary">
    <h4>System Builder</h4>
    <div class="field-grid">
      ${field("Project Type", record.projectType)}
      ${field("Warranty Type", record.systemWarrantyType)}
      ${field("Warranty Term", record.systemWarrantyTerm)}
      ${field(isRestoration ? "Existing Substrate" : "Existing / Material Type", record.systemMaterial)}
      ${field(isRestoration ? "Fluid-Applied Product" : "System", record.systemProduct)}
      ${assemblyFields}
      ${field("Primer", record.systemPrimer)}
      ${field("Contractor Warranty", record.contractorWarranty)}
    </div>
    ${record.systemNotes ? `<p class="system-note">${escapeHtml(record.systemNotes)}</p>` : ""}
  </section>`;
}

function projectTakeoffEstimateSection(project) {
  const estimates = filteredTakeoffEstimates(project.id);
  return `<section class="detail-section">
    <div class="modal-section-header">
      <div>
        <h4>Takeoff Estimates</h4>
        <span>${estimates.length ? `${estimates.length} saved` : "No saved estimates yet"}</span>
      </div>
      <button class="mini-button" data-open-takeoff-project="${escapeHtml(project.id)}" type="button">Takeoff Estimate</button>
    </div>
    ${
      estimates.length
        ? `<div class="stack-list">${estimates
            .map(
              (estimate) => `<div class="stack-item">
                <strong>${escapeHtml(estimate.name || "Takeoff Estimate")}</strong>
                <span>${escapeHtml(compactDate(estimate.savedAt))} | ${estimate.adjustedArea ? `${Math.ceil(estimate.adjustedArea).toLocaleString()} adjusted sq. ft.` : "No area saved"}</span>
                <div class="manage-actions">
                  <button class="mini-button" data-load-takeoff-estimate="${escapeHtml(estimate.id)}" type="button">Open</button>
                  <button class="mini-button danger-mini" data-delete-takeoff-estimate="${escapeHtml(estimate.id)}" type="button">Delete</button>
                </div>
              </div>`
            )
            .join("")}</div>`
        : `<p class="empty-state">Create one from this project or save one from the Takeoff Estimator.</p>`
    }
  </section>`;
}

function driveFolderTemplate(type, record) {
  const client = record.client || record.clientName || record.companyName || "Client";
  const project = record.projectName || record.project || record.client || "Project";
  const root = type === "account" ? client : `${client} / ${project}`;
  return [
    root,
    "01 Photos",
    "02 Scope of Work",
    "03 Pricing",
    "04 Contractor Bids",
    "05 Drawings and Specs",
    "06 Addenda",
    "07 Final Proposal",
    "08 PO and Closeout",
  ].join("\n");
}

function quickActionSection(type, record) {
  return `<section class="detail-section quick-actions-section">
    <h4>Quick Actions</h4>
    <div class="mobile-quick-actions">
      ${calendarQuickActions(type, record)}
      ${type === "account" ? `<button class="secondary-button" data-export-account-profile="${escapeHtml(record.id)}" type="button">Export Account Profile</button>` : ""}
      <button class="secondary-button" data-copy-folder-template="${type}" data-folder-record="${escapeHtml(record.id || record.companyName || "")}" type="button">Copy Drive Folders</button>
      <button class="secondary-button" data-log-record-activity="${type}" data-log-record-id="${escapeHtml(record.id || record.companyName || "")}" type="button">Log Activity</button>
    </div>
  </section>`;
}

function deleteButton(type, id, label) {
  const archive = type === "contractor" ? "" : `<button class="secondary-button" data-archive-record="${type}" data-archive-id="${escapeHtml(id)}" type="button">Archive ${escapeHtml(label)}</button>`;
  return `<section class="danger-zone">${archive}<button class="delete-button" data-delete-record="${type}" data-delete-id="${escapeHtml(id)}" type="button">Delete ${escapeHtml(label)}</button></section>`;
}

function collectionName(type) {
  if (type === "account") return "accounts";
  if (type === "project") return "projects";
  if (type === "proposal") return "proposals";
  return "";
}

function persistRecordEdit(type, id, key, value, refresh = true) {
  value = normalizeEditableValue(key, value);
  if (type === "contractor") {
    const profile = ensureContractorProfile(id);
    if (!profile) return;
    const oldName = profile.companyName;
    profile[key] = value;
    if (key === "companyName") {
      const oldKey = normalize(oldName);
      data.projects.forEach((project) => {
        const before = [project.biddingContractors, project.awardedContractor].join("|");
        project.biddingContractors = splitContractors(project.biddingContractors)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = value;
        const after = [project.biddingContractors, project.awardedContractor].join("|");
        if (before !== after && !savedCrm.projects.some((item) => item.id === project.id)) {
          savedCrm.edits.projects[project.id] = {
            ...(savedCrm.edits.projects[project.id] || {}),
            biddingContractors: project.biddingContractors,
            awardedContractor: project.awardedContractor,
          };
        }
      });
      data.proposals.forEach((proposal) => {
        const before = [proposal.biddingContractors, proposal.bidsReceived, proposal.awardedContractor].join("|");
        proposal.biddingContractors = splitContractors(proposal.biddingContractors)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        proposal.bidsReceived = splitContractors(proposal.bidsReceived)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        if (normalize(proposal.awardedContractor) === oldKey) proposal.awardedContractor = value;
        const after = [proposal.biddingContractors, proposal.bidsReceived, proposal.awardedContractor].join("|");
        if (before !== after) {
          proposalUpdates[proposal.id] = {
            ...(proposalUpdates[proposal.id] || {}),
            biddingContractors: proposal.biddingContractors,
            bidsReceived: proposal.bidsReceived,
            awardedContractor: proposal.awardedContractor,
          };
        }
      });
      savedCrm.proposals.forEach((proposal) => {
        proposal.biddingContractors = splitContractors(proposal.biddingContractors)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        proposal.bidsReceived = splitContractors(proposal.bidsReceived)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        if (normalize(proposal.awardedContractor) === oldKey) proposal.awardedContractor = value;
      });
      savedCrm.projects.forEach((project) => {
        project.biddingContractors = splitContractors(project.biddingContractors)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = value;
      });
      Object.values(savedCrm.edits.projects || {}).forEach((project) => {
        project.biddingContractors = splitContractors(project.biddingContractors)
          .map((contractor) => (normalize(contractor) === oldKey ? value : contractor))
          .join(", ");
        if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = value;
      });
      localStorage.setItem("garlandProposalUpdates", JSON.stringify(proposalUpdates));
    }
    saveCrm();
    if (refresh) {
      renderFilters();
      render();
      showContractorDetail(profile.companyName);
    }
    return;
  }
  const collection = collectionName(type);
  if (!collection) return;
  const cleanedValue = ["materials", "projectCommission", "wiseTrophy", "squareFeet"].includes(key) ? Number(String(value).replace(/[^0-9.-]/g, "")) || 0 : value;
  const record = data[collection].find((item) => item.id === id);
  const oldValue = record?.[key] || "";
  if (record) record[key] = cleanedValue;
  const local = savedCrm[collection].find((item) => item.id === id);
  if (local) {
    local[key] = cleanedValue;
  } else {
    savedCrm.edits[collection][id] = { ...(savedCrm.edits[collection][id] || {}), [key]: cleanedValue };
  }
  saveCrm();
  if (key === "nextFollowUp" && record) promptFollowUpActivity(type, record, oldValue, cleanedValue);
  if (refresh) {
    renderFilters();
    render();
    showDetail(type, id);
  }
}

function deleteRecord(type, id) {
  if (type === "punchList") {
    state.punchLists = state.punchLists.filter((list) => list.punch_list_id !== id);
    savePunchLists();
    renderFilters();
    render();
    byId("detailContent").innerHTML = `<p class="empty-detail">Punch list deleted from this CRM view.</p>`;
    return;
  }
  if (type === "task") {
    state.tasks = state.tasks.filter((task) => task.task_id !== id);
    saveTasks();
    renderFilters();
    render();
    byId("detailContent").innerHTML = `<p class="empty-detail">Task deleted from this CRM view.</p>`;
    return;
  }
  if (type === "contractor") {
    savedCrm.contractors = savedCrm.contractors.filter((contractor) => normalize(contractor.companyName) !== normalize(id));
    saveCrm();
    renderFilters();
    render();
    byId("detailContent").innerHTML = `<p class="empty-detail">Contractor deleted from this CRM view.</p>`;
    return;
  }
  const collection = collectionName(type);
  if (!collection) return;
  savedCrm[collection] = savedCrm[collection].filter((item) => item.id !== id);
  if (!savedCrm.deleted.includes(id)) savedCrm.deleted.push(id);
  delete savedCrm.edits[collection][id];
  saveCrm();
  renderFilters();
  render();
  byId("detailContent").innerHTML = `<p class="empty-detail">Record deleted from this CRM view.</p>`;
}

function archiveRecord(type, id) {
  const collection = collectionName(type);
  if (!collection) return;
  if (!savedCrm.archived.includes(id)) savedCrm.archived.push(id);
  saveCrm();
  renderFilters();
  render();
  byId("detailContent").innerHTML = `<p class="empty-detail">Record archived from the active CRM view.</p>`;
}

function beginInlineEdit(fieldEl) {
  if (!fieldEl || fieldEl.querySelector("input, select")) return;
  const type = fieldEl.dataset.editType;
  const id = fieldEl.dataset.editId;
  const key = fieldEl.dataset.editKey;
  const current = fieldEl.querySelector("strong")?.textContent?.trim() || "";
  const options = fieldEl.dataset.options ? fieldEl.dataset.options.split("|").filter(Boolean) : null;
  const editor = options
    ? document.createElement("select")
    : document.createElement("input");
  if (options) {
    editor.innerHTML = options.map((option) => `<option ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
  } else {
    editor.value = isDateField(key) ? dateKeyFromValue(current) : current.replace(/^\$/, "");
    if (["materials", "projectCommission", "wiseTrophy", "squareFeet"].includes(key)) {
      editor.type = "number";
      editor.step = "0.01";
      editor.min = "0";
    } else if (key === "phone") {
      editor.type = "tel";
    } else if (isDateField(key)) {
      editor.type = "date";
    }
  }
  const strong = fieldEl.querySelector("strong");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "mini-button inline-save-button";
  saveButton.textContent = "Save";
  strong.replaceChildren(editor, saveButton);
  editor.focus();
  if (editor.select) editor.select();

  const save = () => persistRecordEdit(type, id, key, editor.value);
  saveButton.addEventListener("click", save);
  editor.addEventListener("input", () => {
    if (key === "phone") editor.value = formatPhoneNumber(editor.value);
  });
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") save();
    if (event.key === "Escape") showDetail(type, id);
  });
}

function beginDetailEditMode(type, id) {
  const fields = [...byId("detailContent").querySelectorAll(".editable-field")];
  if (!fields.length) return;
  fields.forEach((fieldEl) => {
    if (fieldEl.querySelector("input, select")) return;
    const key = fieldEl.dataset.editKey;
    const current = fieldEl.querySelector("strong")?.textContent?.trim() || "";
    const options = fieldEl.dataset.options ? fieldEl.dataset.options.split("|").filter(Boolean) : null;
    const editor = options ? document.createElement("select") : document.createElement("input");
    editor.dataset.batchEditKey = key;
    if (options) {
      editor.innerHTML = options.map((option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
    } else {
      editor.value = current.replace(/^\$/, "");
      if (["materials", "projectCommission", "wiseTrophy", "squareFeet"].includes(key)) {
        editor.type = "number";
        editor.step = "0.01";
        editor.min = "0";
      } else if (key === "phone") {
        editor.type = "tel";
      } else if (isDateField(key)) {
        editor.type = "date";
        editor.value = dateKeyFromValue(current);
      }
    }
    fieldEl.querySelector("strong")?.replaceChildren(editor);
  });
  const saveControls = `<section class="detail-edit-save">
      <button class="secondary-button" data-cancel-detail-edit="${type}" data-detail-edit-id="${escapeHtml(id)}" type="button">Cancel</button>
      <button class="primary-button" data-save-detail-edit="${type}" data-detail-edit-id="${escapeHtml(id)}" type="button">Save Changes</button>
    </section>`;
  const detailActions = byId("detailContent").querySelector(".detail-actions");
  if (detailActions) detailActions.insertAdjacentHTML("afterend", saveControls);
  else byId("detailContent").insertAdjacentHTML("afterbegin", saveControls);
}

function saveDetailEditMode(type, id) {
  const editors = [...byId("detailContent").querySelectorAll("[data-batch-edit-key]")];
  editors.forEach((editor) => persistRecordEdit(type, id, editor.dataset.batchEditKey, editor.value, false));
  renderFilters();
  render();
  showDetail(type, id);
}

function kanbanStageOptionsFor(type) {
  if (type === "project") return projectStages;
  if (type === "proposal") return proposalStages;
  if (type === "task") return taskStatuses;
  if (type === "punchList") return punchListStatuses;
  return [];
}

function kanbanDragPayload(event) {
  const raw = event.dataTransfer?.getData("application/x-grip-card") || event.dataTransfer?.getData("text/plain");
  if (!raw) return state.draggingKanbanRecord || null;
  try {
    const payload = JSON.parse(raw);
    if (!payload?.type || !payload?.id) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function isValidKanbanStage(type, stage) {
  return kanbanStageOptionsFor(type).some((item) => normalize(item) === normalize(stage));
}

function clearKanbanDropTargets() {
  document.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
}

function handleKanbanDrop(event, column) {
  const payload = kanbanDragPayload(event);
  const stage = column?.dataset.kanbanStage || "";
  if (!payload || !isValidKanbanStage(payload.type, stage)) return false;
  event.preventDefault();
  clearKanbanDropTargets();
  const record = findRecord(payload.type, payload.id);
  if (!record) return true;
  if (payload.type === "task") {
    if (normalize(record.status) === normalize(stage)) return true;
    record.status = stage;
    record.updated_at = new Date().toISOString();
    record.completed_at = stage === "Completed" ? record.completed_at || new Date().toISOString() : "";
    saveTasks();
    render();
    showTaskDetail(record);
    return true;
  }
  if (payload.type === "punchList") {
    if (normalize(record.status) === normalize(stage)) return true;
    record.status = stage;
    record.updated_at = new Date().toISOString();
    if (stage === "Sent to Contractor") record.sent_at = record.sent_at || new Date().toISOString();
    if (stage === "Closed") record.closed_at = record.closed_at || new Date().toISOString();
    punchAudit(record, `Punch list moved to ${stage}`);
    savePunchLists();
    render();
    showPunchListDetail(record);
    return true;
  }
  if (normalize(record.stage) === normalize(stage)) return true;
  persistRecordEdit(payload.type, payload.id, "stage", stage);
  return true;
}

function findRecord(type, id) {
  if (type === "contractor") return contractorRecords().find((item) => normalize(item.companyName) === normalize(id));
  if (type === "task") return findTask(id);
  if (type === "punchList") return findPunchList(id);
  const source = type === "account" ? cleanAccounts() : type === "project" ? cleanProjects() : cleanProposals();
  return source.find((item) => item.id === id);
}

function showDetail(type, id) {
  const record = findRecord(type, id);
  if (!record) return;
  setDetailsHidden(false);
  if (type === "task") {
    showTaskDetail(record);
    return;
  }
  if (type === "punchList") {
    showPunchListDetail(record);
    return;
  }
  if (type === "contractor") {
    showContractorDetail(record.companyName);
    return;
  }
  if (type === "account") {
    showAccountDetail(record);
    return;
  }
  const client = record.client || "";
  const related = relatedFor(client);
  const noteValue = state.notes[id] || "";
  const title = type === "account" ? record.client : type === "project" ? record.projectName || record.client : record.project || record.client;
  const subtitle = type === "account" ? record.poc : client;

  byId("detailContent").innerHTML = `
    ${detailHeader(type, id, escapeHtml(title || "Record"), subtitle || "")}
    <div class="field-grid">
      ${type === "project" ? editableField(type, id, "abcList", "ABC Score", record.abcList, abcScores) : ""}
      ${type === "project" ? editableField(type, id, "projectType", "Project Type", record.projectType, projectTypes) : ""}
      ${editableField(type, id, "stage", "Stage", record.stage, type === "project" ? projectStages : proposalStages)}
      ${editableField(type, id, type === "project" ? "projectName" : "project", "Project", type === "project" ? record.projectName : record.project)}
      ${editableField(type, id, "client", "Client", record.client)}
      ${editableField(type, id, "address", "Project Address", record.address)}
      ${editableField(type, id, "nextFollowUp", "Follow-up Date", record.nextFollowUp)}
      ${type === "proposal" ? editableField(type, id, "bidDueDate", "Bid Due", compactDate(record.bidDueDate)) : field("Bid Due", compactDate(record.bidDueDate))}
      ${editableField(type, id, "materials", type === "proposal" ? "Estimated Material Amount" : "Materials", record.materials ? moneyWithCents.format(Number(record.materials) || 0) : "")}
      ${type === "project" ? editableField(type, id, "squareFeet", "SQ/FT", record.squareFeet) : ""}
      ${type === "project" ? editableField(type, id, "projectCommission", "Commission", projectCommission(record) ? moneyWithCents.format(projectCommission(record)) : "") : ""}
      ${editableField(type, id, "wiseTrophy", "Wise Trophy", record.wiseTrophy || record.wiseTropy ? moneyWithCents.format(Number(record.wiseTrophy || record.wiseTropy) || 0) : "")}
    </div>
    ${type === "project" ? projectBiddingContractorControls(record) : ""}
    ${type === "project" ? projectAwardedContractorControls(record) : ""}
    ${proposalTrackingControls(record)}
    ${type === "project" ? projectSystemSection(record) : ""}
    ${type === "project" ? projectTakeoffEstimateSection(record) : ""}
    ${type === "project" ? projectChecklistButton(record) : ""}
    ${type === "project" ? projectPunchListSection(record) : ""}
    ${quickActionSection(type, record)}
    ${type === "project" ? projectUploadSections(record) : ""}
    ${type === "proposal" ? proposalUploadSections(record) : ""}
    <section class="detail-section">
      <h4>CRM Note</h4>
      <textarea class="note-box" data-note-id="${record.id}" placeholder="Add a private note for this browser">${escapeHtml(noteValue)}</textarea>
    </section>
    ${deleteButton(type, id, type)}
  `;
  byId("detailDrawer").classList.add("is-open");
}

function showAccountDetail(record) {
  // Track last viewed account for AI Assistant hub card
  try {
    const raw = localStorage.getItem("garlandCrmData");
    const d = raw ? JSON.parse(raw) : {};
    d._lastViewedAccount = record.client || "";
    localStorage.setItem("garlandCrmData", JSON.stringify(d));
  } catch {}
  const related = relatedFor(record.client || "");
  const noteValue = state.notes[record.id] || "";
  const activity = accountActivityStatus(record);
  const latest = latestAccountActivity(record);
  const proposalCounts = accountProposalCounts(record);

  byId("detailContent").innerHTML = `
    <div class="detail-actions">
      <div>
        <h3><span class="activity-dot ${activity.level}"></span>${escapeHtml(record.client)}</h3>
        ${latest ? `<p>${escapeHtml(activity.label)}</p>` : "<p>No activity logged yet.</p>"}
      </div>
      <div class="detail-header-actions">
        <button class="mini-button" data-add-task-account="${escapeHtml(record.client)}" type="button">+ Task</button>
        <button class="mini-button" data-quick-deal-account="${escapeHtml(record.id)}" type="button">◈ Deal</button>
        <button class="mini-button" data-roof-notes-account="${escapeHtml(record.id)}" type="button">🏗 Roof Notes</button>
        <button class="mini-button" data-dossier-account="${escapeHtml(record.id)}" type="button">📋 Dossier</button>
        <button class="edit-button" data-edit-record="account" data-edit-id="${escapeHtml(record.id)}" type="button">Edit</button>
      </div>
    </div>
    <div class="field-grid">
      ${field("Open Proposal Count", proposalCounts.open)}
      ${field("Won Proposal Count", proposalCounts.won)}
      ${field("Lost Proposal Count", proposalCounts.lost)}
      ${editableField("account", record.id, "clientRanking", "Stage / Rank", record.clientRanking, accountRankOptions)}
      ${editableField("account", record.id, "entity", "Entity", record.entity, accountEntityOptions())}
      ${editableField("account", record.id, "county", "County", record.county, accountCountyOptions())}
      ${editableField("account", record.id, "sharedRep", "Shared Rep", record.sharedRep)}
      ${editableField("account", record.id, "nextFollowUp", "Follow-up Date", record.nextFollowUp)}
      ${editableField("account", record.id, "poc", "Contact", record.poc)}
      ${editableField("account", record.id, "title", "Title", record.title)}
      ${editableField("account", record.id, "phone", "Phone", record.phone)}
      ${editableField("account", record.id, "email", "Email", record.email)}
      ${editableField("account", record.id, "address", "Address", record.address)}
    </div>

    ${quickActionSection("account", record)}
    ${accountRelationshipMap(record)}

    ${relatedSection("Tasks", related.tasks.filter(t => !["Completed","Cancelled"].includes(t.status)), accountTaskMiniRecord)}
    ${relatedSection("Projects", related.projects, accountProjectMiniRecord)}
    ${relatedSection("Proposals", related.proposals, accountProposalMiniRecord)}

    <section class="detail-section">
      <h4>Activity Log</h4>
      <form class="activity-form" data-account-activity="${record.id}">
        <textarea name="activity" class="note-box" placeholder="Add new activity" required></textarea>
        <button class="primary-button" type="submit">Add activity</button>
      </form>
      <div class="activity-list">
        ${accountActivityEntries(record).length ? accountActivityEntries(record).map(activityEntry).join("") : `<p class="empty-state">No activity logged yet.</p>`}
      </div>
    </section>

    <section class="detail-section">
      <h4>CRM Note</h4>
      <textarea class="note-box" data-note-id="${record.id}" placeholder="Add a private note for this browser">${escapeHtml(noteValue)}</textarea>
    </section>
    ${deleteButton("account", record.id, "account")}
  `;
  byId("detailDrawer").classList.add("is-open");
}

function accountRelatedContractors(account) {
  const related = relatedFor(account.client || "");
  const names = new Set();
  related.projects.forEach((project) => {
    splitContractors(project.biddingContractors).forEach((name) => names.add(name));
    if (project.awardedContractor) names.add(project.awardedContractor);
  });
  related.proposals.forEach((proposal) => {
    splitContractors(proposal.biddingContractors).forEach((name) => names.add(name));
    splitContractors(proposal.bidsReceived).forEach((name) => names.add(name));
    if (proposal.awardedContractor) names.add(proposal.awardedContractor);
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function relationshipNode(label, value, type = "") {
  return `<div class="relationship-node ${type}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </div>`;
}

function accountRelationshipMap(account) {
  const related = relatedFor(account.client || "");
  const contractors = accountRelatedContractors(account);
  return `<section class="detail-section relationship-map-section">
    <h4>Relationship Map</h4>
    <div class="relationship-map">
      <div class="relationship-column">${relationshipNode("Account", account.client || "Unnamed Account", "account-node")}</div>
      <div class="relationship-column">
        <span class="relationship-label">Projects</span>
        ${related.projects.length ? related.projects.slice(0, 5).map((project) => relationshipNode(project.stage || "Project", project.projectName || project.client || "Project", "project-node")).join("") : relationshipNode("Projects", "None yet")}
      </div>
      <div class="relationship-column">
        <span class="relationship-label">Proposals</span>
        ${related.proposals.length ? related.proposals.slice(0, 5).map((proposal) => relationshipNode(proposal.stage || "Proposal", proposal.project || proposal.client || "Proposal", "proposal-node")).join("") : relationshipNode("Proposals", "None yet")}
      </div>
      <div class="relationship-column">
        <span class="relationship-label">Contractors</span>
        ${contractors.length ? contractors.slice(0, 6).map((name) => relationshipNode("Contractor", name, "contractor-node")).join("") : relationshipNode("Contractors", "None yet")}
      </div>
    </div>
  </section>`;
}

function accountProfileTabButton(account, activeTab, id, label) {
  return `<button class="sort-tab ${activeTab === id ? "is-active" : ""}" data-account-profile-tab="${id}" data-account-profile-id="${escapeHtml(account.id)}" type="button">${label}</button>`;
}

function accountProfileScorecard(account) {
  const related = relatedFor(account.client || "");
  const counts = accountProposalCounts(account);
  const activity = accountActivityStatus(account);
  const latest = latestAccountActivity(account);
  const contractors = accountRelatedContractors(account);
  return `<section class="account-profile-scorecard">
    ${field("Activity Window", activity.label)}
    ${field("Open Proposal Count", counts.open)}
    ${field("Won Proposal Count", counts.won)}
    ${field("Lost Proposal Count", counts.lost)}
    ${field("Project Count", related.projects.length)}
    ${field("Contractor Count", contractors.length)}
    ${field("Last Activity", latest ? compactDate(latest.createdAt) : "No activity logged")}
    ${field("Shared Rep", account.sharedRep || "None")}
  </section>
  ${accountRelationshipMap(account)}
  <section class="detail-section">
    <h4>Account Information</h4>
    <div class="field-grid">
      ${editableField("account", account.id, "clientRanking", "Stage / Rank", account.clientRanking, accountRankOptions)}
      ${editableField("account", account.id, "entity", "Entity", account.entity, accountEntityOptions())}
      ${editableField("account", account.id, "county", "County", account.county, accountCountyOptions())}
      ${editableField("account", account.id, "poc", "Contact", account.poc)}
      ${editableField("account", account.id, "title", "Title", account.title)}
      ${editableField("account", account.id, "phone", "Phone", account.phone)}
      ${editableField("account", account.id, "email", "Email", account.email)}
      ${editableField("account", account.id, "address", "Address", account.address)}
      ${editableField("account", account.id, "sharedRep", "Shared Rep", account.sharedRep)}
      ${editableField("account", account.id, "nextFollowUp", "Follow-up Date", account.nextFollowUp)}
    </div>
  </section>`;
}

function accountProfileTabContent(account, activeTab) {
  const related = relatedFor(account.client || "");
  const contractors = accountRelatedContractors(account);
  if (activeTab === "projects") {
    return `<section class="detail-section">
      <h4>Projects</h4>
      <div class="stack-list">${related.projects.length ? related.projects.map(accountProjectMiniRecord).join("") : `<p class="empty-state">No linked projects yet.</p>`}</div>
    </section>`;
  }
  if (activeTab === "proposals") {
    return `<section class="detail-section">
      <h4>Proposals</h4>
      <div class="stack-list">${related.proposals.length ? related.proposals.map(accountProposalMiniRecord).join("") : `<p class="empty-state">No linked proposals yet.</p>`}</div>
    </section>`;
  }
  if (activeTab === "activity") {
    const entries = accountActivityEntries(account);
    return `<section class="detail-section">
      <h4>Activity Log</h4>
      <form class="activity-form" data-account-profile-activity="${account.id}">
        <textarea name="activity" class="note-box" placeholder="Add new activity" required></textarea>
        <button class="primary-button" type="submit">Add activity</button>
      </form>
      <div class="activity-list">${entries.length ? entries.map(activityEntry).join("") : `<p class="empty-state">No activity logged yet.</p>`}</div>
    </section>`;
  }
  if (activeTab === "notes") {
    return `<section class="detail-section">
      <h4>Notes</h4>
      <textarea class="note-box" data-note-id="${account.id}" placeholder="Add a private note for this browser">${escapeHtml(state.notes[account.id] || "")}</textarea>
    </section>`;
  }
  if (activeTab === "contractors") {
    return `<section class="detail-section">
      <h4>Contractors</h4>
      <div class="stack-list">${contractors.length ? contractors.map((name) => {
        const profile = findContractorProfile(name);
        const subtitle = profile ? [profile.poc, profile.phone, profile.email].filter(Boolean).join(" | ") : "Referenced on linked work";
        return miniRecord({ id: name }, name, subtitle, "contractor");
      }).join("") : `<p class="empty-state">No linked contractors yet.</p>`}</div>
    </section>`;
  }
  return accountProfileScorecard(account);
}

function accountProfileContent(account, activeTab = "scorecard") {
  const activity = accountActivityStatus(account);
  const tabs = [
    ["scorecard", "Scorecard"],
    ["projects", "Projects"],
    ["proposals", "Proposals"],
    ["activity", "Activity"],
    ["notes", "Notes"],
    ["contractors", "Contractors"],
  ];
  return `
    <div class="account-profile-heading">
      <div>
        <h2><span class="activity-dot ${activity.level}"></span>${escapeHtml(account.client || "Unnamed Account")}</h2>
        <p>${escapeHtml([account.poc, account.title].filter(Boolean).join(" | ") || account.address || "")}</p>
        ${contactLinks(account, "profile-contact-links")}
      </div>
      <button class="edit-button" data-open-account-dialog="${escapeHtml(account.id)}" type="button">Edit Account</button>
    </div>
    <div class="sort-tabs account-profile-tabs">
      ${tabs.map(([id, label]) => accountProfileTabButton(account, activeTab, id, label)).join("")}
    </div>
    ${accountProfileTabContent(account, activeTab)}
  `;
}

function openAccountProfileDialog(accountId, activeTab = "scorecard") {
  const account = findRecord("account", accountId);
  if (!account) return;
  byId("accountProfileTitle").textContent = account.client || "Account";
  byId("accountProfileContent").innerHTML = accountProfileContent(account, activeTab);
  openDialog("accountProfileDialog");
}

function activityEntry(entry) {
  return `<div class="activity-entry">
    <div>
      <strong>${compactDate(entry.createdAt) || "No date"}</strong>
      ${entry.source ? `<span>${escapeHtml(entry.source)}</span>` : ""}
    </div>
    <p>${escapeHtml(entry.note || "")}</p>
    ${activityFileLinks(entry.files)}
    ${activityActions(entry.accountId, entry.id)}
  </div>`;
}

function activityFileLinks(files = []) {
  if (!files.length) return "";
  return `<div class="activity-files">
    ${files
      .map((file) =>
        file.dataUrl
          ? `<a href="${file.dataUrl}" download="${escapeHtml(file.name || "activity-file")}">${escapeHtml(file.name || "Activity file")}</a>`
          : ""
      )
      .join("")}
  </div>`;
}

function activityActions(accountId, activityId) {
  if (!accountId || !activityId) return "";
  return `<div class="activity-actions">
    <button class="mini-button" data-edit-activity="${escapeHtml(activityId)}" data-activity-account="${escapeHtml(accountId)}" type="button">Edit</button>
    <button class="activity-delete-button" data-delete-activity="${escapeHtml(activityId)}" data-activity-account="${escapeHtml(accountId)}" type="button">Delete</button>
  </div>`;
}

function addAccountActivity(accountId, note, showDetailAfter = true, extra = {}) {
  const cleaned = String(note || "").trim();
  if (!cleaned) return;
  state.activities[accountId] = [
    {
      id: `activity-${Date.now()}`,
      note: cleaned,
      createdAt: extra.createdAt || new Date().toISOString(),
      accountId,
      source: extra.source || "",
      facility: extra.facility || "",
      address: extra.address || "",
      files: extra.files || [],
    },
    ...(state.activities[accountId] || []),
  ];
  saveActivities();
  renderAccounts();
  renderActivityLog();
  const account = data.accounts.find((item) => item.id === accountId);
  if (showDetailAfter && account) showAccountDetail(account);
}

function promptFollowUpActivity(type, record, oldDate = "", newDate = "") {
  if (!record || !newDate || dateKeyFromValue(oldDate) === dateKeyFromValue(newDate)) return;
  const account = type === "account" ? record : findAccountByName(record.client || record.clientName || "");
  if (!account) return;
  const title = type === "account" ? record.client : type === "project" ? record.projectName || record.client : record.project || record.client;
  const note = prompt(`Add next step for follow-up on ${compactDate(newDate)}?`, "");
  if (!String(note || "").trim()) return;
  const lines = [
    `Follow-up set for ${compactDate(newDate)}${oldDate ? ` (previously ${compactDate(oldDate)})` : ""}.`,
    title ? `Record: ${title}` : "",
    `Next step: ${String(note).trim()}`,
  ].filter(Boolean);
  addAccountActivity(account.id, lines.join("\n"), false, { source: "Follow-Up" });
}

function accountForRecordActivity(type, id) {
  if (type === "account") return findRecord("account", id);
  const record = findRecord(type, id);
  if (!record) return null;
  return findAccountByName(record.client || record.clientName || record.project || "");
}

async function logRecordActivity(type, id) {
  const account = accountForRecordActivity(type, id);
  if (!account) return alert("I could not find a linked account for this record. Open the account and log the activity there.");
  const note = await gripPrompt("Log activity", "", "What happened or what's next?");
  if (!String(note || "").trim()) return;
  addAccountActivity(account.id, note, false, { source: type === "account" ? "Account" : type === "project" ? "Project" : "Proposal" });
  render();
  showDetail("account", account.id);
}

async function editActivity(accountId, activityId) {
  const entries = state.activities[accountId] || [];
  const entry = entries.find((item) => item.id === activityId);
  if (!entry) return;
  const updated = await gripPrompt("Edit activity", entry.note || "");
  if (updated === null) return;
  const cleaned = String(updated).trim();
  if (!cleaned) return;
  entry.note = cleaned;
  entry.editedAt = new Date().toISOString();
  saveActivities();
  renderAccounts();
  renderActivityLog();
  const account = data.accounts.find((item) => item.id === accountId);
  if (account && byId("detailContent").textContent.includes(account.client || "")) showAccountDetail(account);
}

async function deleteActivity(accountId, activityId) {
  if (!await gripConfirm("Delete this activity?", "Delete", "Cancel")) return;
  state.activities[accountId] = (state.activities[accountId] || []).filter((entry) => entry.id !== activityId);
  saveActivities();
  renderAccounts();
  renderActivityLog();
  const account = data.accounts.find((item) => item.id === accountId);
  if (account && byId("detailContent").textContent.includes(account.client || "")) showAccountDetail(account);
}

function accountEntityOptions() {
  return territoryEntityOptions();
}

function accountCountyOptions() {
  return territoryCountyOptions();
}

function callListDays() {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
}

function todayCallDay() {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return callListDays().includes(day) ? day : "Monday";
}

function saveCallLists() {
  localStorage.setItem("garlandCallLists", JSON.stringify(state.callLists));
}

function callRuleOptions(type) {
  if (type === "county") return accountCountyOptions();
  if (type === "client") return accountNames();
  return accountEntityOptions();
}

function accountsForCallRule(rule) {
  return cleanAccounts().filter((account) => {
    if (rule.type === "county") return account.county === rule.value;
    if (rule.type === "client") return account.client === rule.value;
    return account.entity === rule.value;
  });
}

function accountsForCallDay(day) {
  const map = new Map();
  state.callLists.rules
    .filter((rule) => rule.day === day)
    .forEach((rule) => accountsForCallRule(rule).forEach((account) => map.set(account.id, account)));
  return [...map.values()].sort(sortCallListAccounts);
}

function sortCallListAccounts(a, b) {
  const direction = state.filters.callListDirection;
  if (state.filters.callListSort === "county") return compareText(a.county, b.county, direction) || compareText(a.client, b.client, direction);
  if (state.filters.callListSort === "entity") return compareText(a.entity, b.entity, direction) || compareText(a.client, b.client, direction);
  if (state.filters.callListSort === "rep") return compareText(a.sharedRep, b.sharedRep, direction) || compareText(a.client, b.client, direction);
  if (state.filters.callListSort === "activity") return compareNumber(dateValue(latestAccountActivity(a)?.createdAt), dateValue(latestAccountActivity(b)?.createdAt), direction);
  return compareText(a.client, b.client, direction);
}

function callCompletionKey(day, accountId) {
  return `${callListDateForDay(day)}|${day}|${accountId}`;
}

function callListDateForDay(day) {
  const days = callListDays();
  const todayDate = new Date();
  const monday = new Date(todayDate);
  const dayIndex = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1;
  monday.setDate(todayDate.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);
  const target = new Date(monday);
  target.setDate(monday.getDate() + Math.max(0, days.indexOf(day)));
  return toLocalDateKey(target);
}

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderCallListControls() {
  fillSelect("callListDay", callListDays(), state.callListDay || todayCallDay());
  renderCallListValueOptions();
}

function renderCallListValueOptions() {
  const type = byId("callListType").value || "entity";
  fillSelect("callListValue", callRuleOptions(type), byId("callListValue").value);
}

function renderCallList() {
  if (!byId("callListDay")) return;
  const day = state.callListDay || byId("callListDay").value || todayCallDay();
  byId("callListDay").value = day;
  const accounts = accountsForCallDay(day);
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  byId("callListTitle").textContent = `${day} Calls`;
  byId("callListCount").textContent = `${accounts.length} accounts`;
  byId("callListTodayPanel").querySelector(".panel-header span").textContent = dateLabel;
  byId("callListSetupPanel").querySelector(".panel-header span").textContent = "Assign by Day";
  byId("callListView").querySelectorAll("[data-call-list-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.callListMode === state.callListMode);
  });
  byId("callListView").dataset.mode = state.callListMode;
  byId("callListWeekdays").innerHTML = callListDays()
    .map((weekday) => `<button class="sort-tab ${weekday === day ? "is-active" : ""}" data-call-day="${weekday}" type="button">${weekday.slice(0, 3)}</button>`)
    .join("");
  byId("callListView").querySelector(".call-list-layout").dataset.mode = state.callListMode;
  byId("dailyCallList").classList.remove("is-list", "is-kanban");
  byId("dailyCallList").classList.toggle("is-list", state.layouts.callList === "list");
  byId("dailyCallList").classList.toggle("is-kanban", state.layouts.callList === "kanban");
  byId("callListRules").innerHTML = state.callLists.rules.length
    ? state.callLists.rules
        .map(
          (rule) => `<div class="call-rule">
            <span>${escapeHtml(rule.day)} • ${escapeHtml(rule.type)} • ${escapeHtml(rule.value)}</span>
            <div class="call-rule-actions">
              ${calendarButtons(callRuleEvent(rule), "Add Recurring Block")}
              <button class="mini-button" data-remove-call-rule="${rule.id}" type="button">Remove</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="empty-state">No call list assignments yet.</p>`;
  const callItems = accounts
        .map((account) => {
          const key = callCompletionKey(day, account.id);
          const done = state.callLists.completed[key];
          return `<div class="call-item ${done ? "is-complete" : ""}">
            <input type="checkbox" data-call-account="${account.id}" data-call-day="${day}" ${done ? "checked" : ""} />
            <button class="call-account-button" data-open-call-account="${account.id}" type="button">
              <strong>${escapeHtml(account.client)}</strong>
              <small>${escapeHtml([account.poc, account.phone, account.email].filter(Boolean).join(" • "))}</small>
            </button>
            <div class="call-item-calendar">
              ${calendarButtons(callListEvent(account, day), "Add to Calendar")}
            </div>
          </div>`;
        });
  byId("dailyCallList").innerHTML = accounts.length
    ? state.layouts.callList === "kanban"
      ? `<div class="kanban-shell">
          <button class="kanban-nav kanban-nav-left" data-kanban-scroll="left" type="button" aria-label="Scroll kanban left">‹</button>
          <div class="kanban-board">
          <section class="kanban-column"><h3>To Call <span>${accounts.filter((account) => !state.callLists.completed[callCompletionKey(day, account.id)]).length}</span></h3><div class="kanban-items">${accounts
            .filter((account) => !state.callLists.completed[callCompletionKey(day, account.id)])
            .map((account) => callItems[accounts.indexOf(account)])
            .join("")}</div></section>
          <section class="kanban-column"><h3>Complete <span>${accounts.filter((account) => state.callLists.completed[callCompletionKey(day, account.id)]).length}</span></h3><div class="kanban-items">${accounts
            .filter((account) => state.callLists.completed[callCompletionKey(day, account.id)])
            .map((account) => callItems[accounts.indexOf(account)])
            .join("")}</div></section>
          </div>
          <button class="kanban-nav kanban-nav-right" data-kanban-scroll="right" type="button" aria-label="Scroll kanban right">›</button>
        </div>`
      : callItems.join("")
    : `<p class="empty-state">No calls assigned for ${escapeHtml(day)}.</p>`;
}

function noteTakerRecords() {
  return allActivityRecords()
    .filter((entry) => entry.source === "Note Taker")
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
}

function renderNoteTaker() {
  const form = byId("noteTakerForm");
  if (!form) return;
  byId("noteClientOptions").innerHTML = accountNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  fillSelect("noteEntityInput", ["", ...accountEntityOptions()], byId("noteEntityInput").value || "");
  fillSelect("noteCountyInput", ["", ...accountCountyOptions()], byId("noteCountyInput").value || "");
  if (!byId("noteDateInput").value) byId("noteDateInput").value = toLocalDateKey(new Date());
  const records = noteTakerRecords().filter(includesSearch);
  byId("noteTakerCount").textContent = `${records.length} notes`;
  byId("noteTakerLog").innerHTML = records.length ? records.map(activityTimelineItem).join("") : empty("No notes saved yet.");
}

function syncNoteClientFields() {
  const account = findAccountByName(byId("noteClientInput")?.value || "");
  if (!account) return;
  byId("noteAddressInput").value = account.address || "";
  fillSelect("noteEntityInput", ["", ...accountEntityOptions()], account.entity || "");
  fillSelect("noteCountyInput", ["", ...accountCountyOptions()], account.county || "");
}

function setNoteNewAccountVisible(visible) {
  const fields = byId("noteNewAccountFields");
  const panel = byId("noteNewAccountPanel");
  const button = byId("toggleNoteNewAccountButton");
  if (!fields || !panel || !button) return;
  fields.hidden = !visible;
  panel.classList.toggle("is-collapsed", !visible);
  button.textContent = visible ? "Hide" : "Show";
  button.setAttribute("aria-expanded", visible ? "true" : "false");
}

function resetNoteTakerForm() {
  byId("noteTakerForm").reset();
  byId("noteDateInput").value = toLocalDateKey(new Date());
  setNoteNewAccountVisible(false);
  updateNoteMediaSummary();
  renderNoteTaker();
}

function pluralizeFile(count, label) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function updateNoteMediaSummary() {
  const cameraCount = byId("noteCameraInput")?.files?.length || 0;
  const libraryCount = byId("notePhotoInput")?.files?.length || 0;
  const audioCount = byId("noteAudioInput")?.files?.length || 0;
  if (byId("noteMediaSummary")) {
    const total = cameraCount + libraryCount;
    byId("noteMediaSummary").textContent = total
      ? `${pluralizeFile(total, "picture/video")} selected.`
      : "Take new photos/videos or select multiple from your phone library.";
  }
  if (byId("noteAudioSummary")) {
    byId("noteAudioSummary").textContent = audioCount ? `${pluralizeFile(audioCount, "voice memo")} selected.` : "Record a memo on your phone or upload audio.";
  }
}

function noteDateTime(dateValueString) {
  const date = dateValueString || toLocalDateKey(new Date());
  const now = new Date();
  return `${date}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

function readFilesAsDataUrls(files) {
  return Promise.all(
    [...(files || [])].map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: reader.result,
              uploadedAt: new Date().toISOString(),
            });
          reader.readAsDataURL(file);
        })
    )
  );
}

async function saveNoteTakerEntry(formEl) {
  const form = new FormData(formEl);
  const client = String(form.get("client") || "").trim();
  const note = String(form.get("note") || "").trim();
  if (!client || !note) return;
  const noteFiles = [
    ...(byId("noteCameraInput").files || []),
    ...(byId("notePhotoInput").files || []),
    ...(byId("noteAudioInput").files || []),
  ];
  if (!confirmLargeLocalFiles(noteFiles, "note attachments")) return;
  let account = findAccountByName(client);
  if (!account) {
    account = {
      id: `local-account-${Date.now()}`,
      sourceRow: "Local",
      clientRanking: "Prospecting",
      entity: form.get("entity") || "",
      county: form.get("county") || "",
      action: "N/A",
      client,
      address: form.get("address") || "",
      poc: form.get("poc") || "",
      phone: formatPhoneNumber(form.get("phone")) || "",
      email: form.get("email") || "",
      nextStep: "",
      activity: new Date().toISOString(),
    };
    savedCrm.accounts.push(account);
    data.accounts.push(account);
    saveCrm();
  }
  const cameraMedia = await readFilesAsDataUrls(byId("noteCameraInput").files);
  const photos = await readFilesAsDataUrls(byId("notePhotoInput").files);
  const voice = await readFilesAsDataUrls(byId("noteAudioInput").files);
  const facility = String(form.get("facility") || "").trim();
  const address = String(form.get("address") || "").trim();
  const noteLines = [
    facility ? `Facility: ${facility}` : "",
    address ? `Address: ${address}` : "",
    note,
  ].filter(Boolean);
  addAccountActivity(account.id, noteLines.join("\n"), false, {
    source: "Note Taker",
    facility,
    address,
    createdAt: noteDateTime(form.get("date")),
    files: [...cameraMedia, ...photos, ...voice],
  });
  renderFilters();
  render();
  resetNoteTakerForm();
  showDetail("account", account.id);
}

function setCallListMode(mode) {
  state.callListMode = mode === "setup" ? "setup" : "today";
  renderCallList();
}

function addCallListRule(form) {
  const rule = {
    id: `call-rule-${Date.now()}`,
    day: form.get("day"),
    type: form.get("type"),
    value: form.get("value"),
  };
  if (!rule.day || !rule.type || !rule.value) return;
  state.callLists.rules.push(rule);
  saveCallLists();
  renderCallList();
}

function completeCallListItem(accountId, day, checked, addDefaultActivity = true, refresh = true) {
  const key = callCompletionKey(day, accountId);
  if (checked) {
    state.callLists.completed[key] = new Date().toISOString();
    if (addDefaultActivity) addAccountActivity(accountId, `Completed ${day} call list call.`, false);
  } else {
    delete state.callLists.completed[key];
    saveCallLists();
  }
  saveCallLists();
  if (refresh) renderCallList();
}

function handleCallListCheckbox(callCheckbox) {
  if (!callCheckbox) return;
  if (callCheckbox.checked) {
    callCheckbox.closest(".call-item")?.classList.add("is-complete");
    completeCallListItem(callCheckbox.dataset.callAccount, callCheckbox.dataset.callDay, true, false, false);
    openCallActivityDialog(callCheckbox.dataset.callAccount, callCheckbox.dataset.callDay, true);
  } else {
    callCheckbox.closest(".call-item")?.classList.remove("is-complete");
    completeCallListItem(callCheckbox.dataset.callAccount, callCheckbox.dataset.callDay, false);
  }
}

function openCallActivityDialog(accountId, day = "", completeCall = false) {
  const account = cleanAccounts().find((item) => item.id === accountId);
  if (!account) return;
  const latest = latestAccountActivity(account);
  byId("callActivityForm").reset();
  byId("callActivityAccountId").value = account.id;
  byId("callActivityDay").value = day;
  byId("callActivityComplete").value = completeCall ? "yes" : "";
  byId("callActivityTitle").textContent = account.client || "Client Call";
  byId("callActivityDetails").innerHTML = `
    <div class="field-grid">
      ${field("Contact", account.poc)}
      ${field("Title", account.title)}
      ${account.phone ? `<div class="field"><span>Phone</span><strong><a href="tel:${escapeHtml(String(account.phone).replace(/[^0-9+]/g, ""))}">${escapeHtml(account.phone)}</a></strong></div>` : ""}
      ${account.email ? `<div class="field"><span>Email</span><strong><a href="mailto:${escapeHtml(account.email)}">${escapeHtml(account.email)}</a></strong></div>` : ""}
      ${field("Entity", account.entity)}
      ${field("County", account.county)}
      ${field("Address", account.address)}
      ${field("Last Activity", latest ? `${compactDate(latest.createdAt)} - ${latest.note || latest.source || ""}` : "No activity logged yet")}
    </div>
  `;
  openDialog("callActivityDialog");
}

function saveCallActivity(form) {
  const accountId = form.get("accountId");
  addAccountActivity(accountId, form.get("activity"), false);
  if (form.get("completeCall") === "yes") completeCallListItem(accountId, form.get("day"), true, false);
  byId("callActivityDialog").close();
  renderCallList();
}

function addCallOutcomeToActivity(outcome) {
  const textarea = byId("callActivityForm")?.elements.activity;
  if (!textarea || !outcome) return;
  const current = String(textarea.value || "").trim();
  textarea.value = current ? `${current}\n${outcome}` : outcome;
  textarea.focus();
}

function quickRecordTitle(type, record) {
  if (type === "project") return record.projectName || record.client || "Project";
  if (type === "proposal") return record.project || record.client || "Proposal";
  if (type === "contractor") return record.companyName || "Contractor";
  return "Details";
}

function openRecordQuickDialog(type, id) {
  const record = findRecord(type, id);
  if (!record) return;
  byId("recordQuickType").textContent = type === "project" ? "Project" : type === "proposal" ? "Proposal" : "Contractor";
  byId("recordQuickTitle").textContent = quickRecordTitle(type, record);
  byId("recordQuickContent").innerHTML =
    type === "project"
      ? projectQuickContent(record)
      : type === "proposal"
        ? proposalQuickContent(record)
        : contractorQuickContent(record.companyName || id);
  openDialog("recordQuickDialog");
}

function shouldIgnoreRecordTap(event) {
  return Boolean(
    event.target.closest(
      "a, button, input, select, textarea, label, summary, details, [data-contact-link], [data-open-account-dialog], [data-open-project-checklist], [data-open-takeoff-project], [data-load-takeoff-estimate], [data-delete-takeoff-estimate], [data-delete-record], [data-edit-record], [data-log-record-activity], .editable-field"
    )
  );
}

function openRecordFromMobileTap(type, id) {
  if (type === "account") openAccountProfileDialog(id);
  else if (["project", "proposal", "contractor"].includes(type)) openRecordQuickDialog(type, id);
  else showDetail(type, id);
}

function handleMobileQuickAdd(action) {
  if (action === "task") {
    openTaskDialog();
    return;
  }
  if (action === "note") {
    setView("noteTaker");
    return;
  }
  if (action === "activity") {
    setView("activityLog");
    return;
  }
  if (action === "account") {
    openAccountDialog();
    return;
  }
  if (action === "project") {
    resetProjectForm();
    openDialog("projectDialog");
    return;
  }
  if (action === "punch") {
    openPunchListDialog();
    return;
  }
  if (action === "proposal") {
    resetProposalForm();
    openDialog("proposalDialog");
  }
}

function projectQuickContent(record) {
  return `<div class="field-grid">
    ${editableField("project", record.id, "abcList", "ABC Score", record.abcList, abcScores)}
    ${editableField("project", record.id, "projectType", "Project Type", record.projectType, projectTypes)}
    ${editableField("project", record.id, "stage", "Stage", record.stage, projectStages)}
    ${editableField("project", record.id, "projectName", "Project", record.projectName)}
    ${editableField("project", record.id, "client", "Client", record.client)}
    ${editableField("project", record.id, "address", "Project Address", record.address)}
    ${editableField("project", record.id, "nextFollowUp", "Follow-up Date", record.nextFollowUp)}
    ${field("Start", record.anticipatedStartDate)}
    ${editableField("project", record.id, "materials", "Materials", record.materials ? moneyWithCents.format(Number(record.materials) || 0) : "")}
    ${editableField("project", record.id, "squareFeet", "SQ/FT", record.squareFeet)}
    ${editableField("project", record.id, "projectCommission", "Commission", projectCommission(record) ? moneyWithCents.format(projectCommission(record)) : "")}
    ${editableField("project", record.id, "wiseTrophy", "Wise Trophy", record.wiseTrophy || record.wiseTropy ? moneyWithCents.format(Number(record.wiseTrophy || record.wiseTropy) || 0) : "")}
  </div>
  ${quickActionSection("project", record)}
  ${projectSystemSection(record)}
  ${projectTakeoffEstimateSection(record)}
  ${projectChecklistButton(record)}
  ${projectBiddingContractorControls(record)}
  ${projectAwardedContractorControls(record)}
  ${projectUploadSections(record)}
  ${deleteButton("project", record.id, "project")}`;
}

function proposalQuickContent(record) {
  return `<div class="field-grid">
    ${editableField("proposal", record.id, "stage", "Stage", record.stage, proposalStages)}
    ${editableField("proposal", record.id, "project", "Project", record.project)}
    ${editableField("proposal", record.id, "client", "Client", record.client)}
    ${editableField("proposal", record.id, "nextFollowUp", "Follow-up Date", record.nextFollowUp)}
    ${editableField("proposal", record.id, "bidDueDate", "Bid Due", compactDate(record.bidDueDate))}
    ${editableField("proposal", record.id, "materials", "Estimated Material Amount", record.materials ? moneyWithCents.format(Number(record.materials) || 0) : "")}
  </div>
  ${quickActionSection("proposal", record)}
  ${proposalTrackingControls(record)}
  ${proposalUploadSections(record)}
  ${deleteButton("proposal", record.id, "proposal")}`;
}

function contractorQuickContent(name) {
  const profile = ensureContractorProfile(name);
  const summary = contractorSummary(name);
  const performance = contractorPerformance({ ...profile, ...summary });
  const supportContacts = profile.supportContacts || [];
  return `<div class="modal-section-header">
    <div>
      <h4>Contractor Profile</h4>
      ${contactLinks(profile, "profile-contact-links")}
    </div>
    <button class="edit-button" data-edit-record="contractor" data-edit-id="${escapeHtml(profile.companyName)}" type="button">Edit</button>
  </div>
  <div class="field-grid">
    ${editableField("contractor", profile.companyName, "companyName", "Company Name", profile.companyName)}
    ${editableField("contractor", profile.companyName, "poc", "Point of Contact", profile.poc)}
    ${editableField("contractor", profile.companyName, "title", "Title", profile.title)}
    ${editableField("contractor", profile.companyName, "phone", "Phone", formatPhoneNumber(profile.phone) || profile.phone)}
    ${editableField("contractor", profile.companyName, "email", "Email", profile.email)}
    <div class="field"><span>Color</span><strong><input type="color" data-contractor-color="${escapeHtml(profile.companyName)}" value="${escapeHtml(profile.color || "#0057a8")}" /></strong></div>
    ${editableField("contractor", profile.companyName, "address", "Address", profile.address)}
    ${field("Opportunities", summary.opportunities)}
    ${field("Wins", summary.wins)}
    ${field("Response Rate", `${performance.responseRate}%`)}
    ${field("Win Rate", `${performance.winRate}%`)}
    ${field("Performance Score", `${performance.score}/100`)}
    ${field("Last Opportunity Given", compactDate(summary.lastGiven))}
    ${field("Last Opportunity Won", compactDate(summary.lastWon))}
  </div>
  <section class="detail-section">
    <h4>Support Contacts</h4>
    <div class="stack-list">
      ${supportContacts.length ? supportContacts.map((contact, index) => supportContactCard(profile.companyName, contact, index)).join("") : `<p class="empty-state">No support contacts yet.</p>`}
    </div>
    <button class="secondary-button support-add-button" data-add-support-contact="${escapeHtml(profile.companyName)}" type="button">Add support contact</button>
  </section>
  ${contractorProposalRequestSection(profile.companyName, summary.proposals)}
  ${deleteButton("contractor", profile.companyName, "contractor")}`;
}

function fillAccountDialogSelects(account = {}) {
  const entityOptions = [...new Set(["", account.entity || "", ...accountEntityOptions(), "K-12", "Higher Education", "Healthcare", "Manufacturing", "Municipal", "Religious", "Private", "Private School", "Architect", "Financial Institute"])];
  const countyOptions = [...new Set(["", account.county || "", ...accountCountyOptions()])];
  fillSelect("accountEntityInput", entityOptions, account.entity || "");
  fillSelect("accountCountyInput", countyOptions, account.county || "");
}

function openAccountDialog(accountId = "") {
  const account = accountId ? findRecord("account", accountId) : null;
  const form = byId("accountForm");
  form.reset();
  fillAccountDialogSelects(account || {});
  byId("accountDialogTitle").textContent = account ? "Account Details" : "Add Account";
  byId("accountIdInput").value = account?.id || "";
  form.elements.client.value = account?.client || "";
  form.elements.entity.value = account?.entity || "";
  form.elements.county.value = account?.county || "";
  form.elements.clientRanking.value = account?.clientRanking || "Prospecting";
  form.elements.sharedRep.value = account?.sharedRep || "";
  form.elements.nextFollowUp.value = account?.nextFollowUp || "";
  form.elements.poc.value = account?.poc || "";
  form.elements.title.value = account?.title || "";
  form.elements.phone.value = formatPhoneNumber(account?.phone) || "";
  form.elements.email.value = account?.email || "";
  form.elements.address.value = account?.address || "";
  byId("deleteAccountDialogButton").hidden = !account;
  byId("accountDialogActivity").innerHTML = account
    ? accountActivityEntries(account).slice(0, 5).map(activityEntry).join("") || `<p class="empty-state">No activity logged yet.</p>`
    : "";
  openDialog("accountDialog");
}

function saveAccountFromDialog(form) {
  const id = form.get("id");
  const payload = {
    client: form.get("client") || "",
    entity: form.get("entity") || "",
    county: form.get("county") || "",
    clientRanking: form.get("clientRanking") || "Prospecting",
    sharedRep: form.get("sharedRep") || "",
    nextFollowUp: form.get("nextFollowUp") || "",
    poc: form.get("poc") || "",
    title: form.get("title") || "",
    phone: formatPhoneNumber(form.get("phone")) || "",
    email: form.get("email") || "",
    address: form.get("address") || "",
  };
  let accountId = id;
  if (id) {
    Object.entries(payload).forEach(([key, value]) => persistRecordEdit("account", id, key, value, false));
  } else {
    if (shouldStopForDuplicate("account", payload.client, cleanAccounts().map((account) => account.client))) return;
    const account = {
      id: `local-account-${Date.now()}`,
      sourceRow: "Local",
      action: "",
      nextStep: "",
      activity: new Date().toISOString(),
      ...payload,
    };
    savedCrm.accounts.push(account);
    data.accounts.push(account);
    accountId = account.id;
    saveCrm();
    promptFollowUpActivity("account", account, "", account.nextFollowUp);
  }
  if (String(form.get("activity") || "").trim()) addAccountActivity(accountId, form.get("activity"), false);
  renderFilters();
  render();
  byId("accountDialog").close();
  if (state.view === "accounts" && state.accountMode === "browse") showDetail("account", accountId);
}

async function renameAccount(accountId) {
  const account = findRecord("account", accountId);
  if (!account) return alert("I could not find that account.");
  const oldName = account.client || "";
  const nextName = await gripPrompt("Rename account", oldName);
  const cleaned = String(nextName || "").trim();
  if (!cleaned || cleaned === oldName) return;
  const oldKey = normalize(oldName);
  persistRecordEdit("account", accountId, "client", cleaned, false);
  data.projects.forEach((project) => {
    if (normalize(project.client) === oldKey) project.client = cleaned;
  });
  savedCrm.projects.forEach((project) => {
    if (normalize(project.client) === oldKey) project.client = cleaned;
  });
  data.proposals.forEach((proposal) => {
    if (normalize(proposal.client) === oldKey) proposal.client = cleaned;
  });
  savedCrm.proposals.forEach((proposal) => {
    if (normalize(proposal.client) === oldKey) proposal.client = cleaned;
  });
  saveCrm();
  renderFilters();
  render();
  if (state.view === "accounts" && state.accountMode === "browse") showDetail("account", accountId);
}

function renderTerritorySettings() {
  byId("repNameInput").value = territorySettings.rep?.name || "";
  byId("repPhoneInput").value = formatPhoneNumber(territorySettings.rep?.phone) || "";
  byId("repEmailInput").value = territorySettings.rep?.email || "";
  byId("territoryPopulationInput").value = territorySettings.population || "";
  fillSelect(
    "territoryStateInput",
    [{ value: "", label: "Select state" }, ...stateAbbreviations],
    territorySettings.state || ""
  );
  byId("entitySettingsList").innerHTML = territoryEntityOptions().length
    ? territoryEntityOptions().map((value) => territorySettingRow("entity", value)).join("")
    : `<p class="empty-state">No entities yet.</p>`;
  byId("countySettingsList").innerHTML = territoryCountyOptions().length
    ? territoryCountyOptions().map((value) => territorySettingRow("county", value)).join("")
    : `<p class="empty-state">No counties yet.</p>`;
}

function territorySettingRow(type, value) {
  const color = territoryColor(type, value) || (type === "entity" ? "#0057a8" : "#f58220");
  return `<div class="territory-row">
    <span><i class="color-swatch" style="background:${escapeHtml(color)}"></i>${escapeHtml(value)}</span>
    <div class="manage-actions">
      <input type="color" value="${escapeHtml(color)}" data-territory-color="${type}" data-territory-value="${escapeHtml(value)}" aria-label="${escapeHtml(value)} color" />
      <button class="mini-button" data-edit-territory="${type}" data-territory-value="${escapeHtml(value)}" type="button">Edit</button>
      <button class="mini-button danger-mini" data-delete-territory="${type}" data-territory-value="${escapeHtml(value)}" type="button">Delete</button>
    </div>
  </div>`;
}

function openTerritorySettings() {
  renderTerritorySettings();
  openDialog("territoryDialog");
}

function saveTerritoryProfile(form) {
  territorySettings.rep = {
    name: form.get("repName") || "",
    phone: formatPhoneNumber(form.get("repPhone")) || "",
    email: form.get("repEmail") || "",
  };
  territorySettings.state = String(form.get("territoryState") || "").trim().toUpperCase();
  territorySettings.population = String(form.get("territoryPopulation") || "").trim();
  saveTerritorySettings();
  renderBrand();
  renderNewsReport();
}

function openGoalSettings() {
  byId("goalForm").elements.materialGoal.value = territorySettings.goals.material || "";
  byId("goalForm").elements.commissionGoal.value = territorySettings.goals.commission || "";
  byId("goalForm").elements.wiseGoal.value = territorySettings.goals.wise || "";
  openDialog("goalDialog");
}

function addTerritoryValue(type, value, color = "") {
  const cleaned = String(value || "").trim();
  if (!cleaned) return;
  const list = type === "entity" ? territorySettings.entities : territorySettings.counties;
  const hidden = type === "entity" ? territorySettings.hiddenEntities : territorySettings.hiddenCounties;
  const colorMap = type === "entity" ? territorySettings.colors.entity : territorySettings.colors.county;
  if (!list.some((item) => normalize(item) === normalize(cleaned))) list.push(cleaned);
  if (color) colorMap[cleaned] = color;
  const hiddenIndex = hidden.findIndex((item) => normalize(item) === normalize(cleaned));
  if (hiddenIndex >= 0) hidden.splice(hiddenIndex, 1);
  saveTerritorySettings();
  renderTerritorySettings();
  renderFilters();
}

function deleteTerritoryValue(type, value) {
  const listKey = type === "entity" ? "entities" : "counties";
  const hiddenKey = type === "entity" ? "hiddenEntities" : "hiddenCounties";
  const colorMap = type === "entity" ? territorySettings.colors.entity : territorySettings.colors.county;
  territorySettings[listKey] = territorySettings[listKey].filter((item) => normalize(item) !== normalize(value));
  Object.keys(colorMap).forEach((key) => {
    if (normalize(key) === normalize(value)) delete colorMap[key];
  });
  if (!territorySettings[hiddenKey].some((item) => normalize(item) === normalize(value))) territorySettings[hiddenKey].push(value);
  saveTerritorySettings();
  renderTerritorySettings();
  renderFilters();
  render();
}

function updateTerritoryColor(type, value, color) {
  const map = type === "entity" ? territorySettings.colors.entity : territorySettings.colors.county;
  const existingKey = Object.keys(map).find((key) => normalize(key) === normalize(value)) || value;
  map[existingKey] = color;
  saveTerritorySettings();
  renderTerritorySettings();
  render();
}

function editTerritoryValue(type, oldValue) {
  const nextValue = prompt(`Edit ${type}`, oldValue);
  if (!nextValue || !String(nextValue).trim()) return;
  const cleaned = String(nextValue).trim();
  const listKey = type === "entity" ? "entities" : "counties";
  const hiddenKey = type === "entity" ? "hiddenEntities" : "hiddenCounties";
  const map = type === "entity" ? territorySettings.colors.entity : territorySettings.colors.county;
  const oldColor = territoryColor(type, oldValue);
  territorySettings[listKey] = territorySettings[listKey].map((item) => (normalize(item) === normalize(oldValue) ? cleaned : item));
  territorySettings[hiddenKey] = territorySettings[hiddenKey].filter((item) => normalize(item) !== normalize(cleaned));
  Object.keys(map).forEach((key) => {
    if (normalize(key) === normalize(oldValue)) delete map[key];
  });
  if (oldColor) map[cleaned] = oldColor;
  saveTerritorySettings();
  renderTerritorySettings();
  renderFilters();
  render();
}

function saveGoalsFromSettings(form) {
  territorySettings.goals = {
    material: Number(form.get("materialGoal") || 0),
    commission: Number(form.get("commissionGoal") || 0),
    wise: Number(form.get("wiseGoal") || 0),
  };
  saveTerritorySettings();
  renderDashboard();
  byId("goalDialog").close();
}

function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    localStorage: {
      garlandCrmData: localStorage.getItem("garlandCrmData"),
      garlandProposalUpdates: localStorage.getItem("garlandProposalUpdates"),
      garlandCrmNotes: localStorage.getItem("garlandCrmNotes"),
      garlandAccountActivities: localStorage.getItem("garlandAccountActivities"),
      garlandProposalAttachments: localStorage.getItem("garlandProposalAttachments"),
      garlandScopeDatabase: localStorage.getItem("garlandScopeDatabase"),
      garlandCallLists: localStorage.getItem("garlandCallLists"),
      garlandTasks: localStorage.getItem("garlandTasks"),
      garlandPunchLists: localStorage.getItem("garlandPunchLists"),
      garlandTerritorySettings: localStorage.getItem("garlandTerritorySettings"),
      garlandPriceBooks: localStorage.getItem("garlandPriceBooks"),
      garlandPriceBookProducts: localStorage.getItem("garlandPriceBookProducts"),
      garlandTakeoffManualProducts: localStorage.getItem("garlandTakeoffManualProducts"),
      garlandFavoriteSystems: localStorage.getItem("garlandFavoriteSystems"),
      garlandLastBackupAt: localStorage.getItem("garlandLastBackupAt"),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `garland-crm-backup-${toLocalDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  localStorage.setItem("garlandLastBackupAt", new Date().toISOString());
  renderDashboard();
}

function downloadTextFile(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportFileName(label, extension) {
  const name = String(label || "grip-export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${name || "grip-export"}-${toLocalDateKey(new Date())}.${extension}`;
}

function exportSummaryHtml(selector) {
  const node = document.querySelector(selector);
  return node ? node.innerHTML : "";
}

function exportTableHtml(selector) {
  const node = document.querySelector(selector);
  const table = node?.tagName === "TABLE" ? node : node?.closest("table");
  if (!table) return "";
  const clone = table.cloneNode(true);
  clone.querySelectorAll("a").forEach((link) => {
    link.replaceWith(document.createTextNode(link.textContent || ""));
  });
  return clone.outerHTML;
}

function exportReportContent(type) {
  if (type === "takeoff") {
    return {
      title: "GRIP Takeoff Estimate",
      summary: exportSummaryHtml("#takeoffSummary"),
      table: exportTableHtml("#takeoffResults"),
      notes: "",
    };
  }
  return {
    title: "GRIP Warranty Summary Chart",
    summary: exportSummaryHtml("#warrantySummaryCards"),
    table: exportTableHtml("#warrantySummaryRows"),
    notes: byId("warrantySummaryNotes")?.value || "",
  };
}

function reportExportHtml(type) {
  const report = exportReportContent(type);
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(report.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
        h1 { margin: 0 0 6px; color: #0057a8; font-size: 24px; }
        .date { color: #4b5563; font-size: 12px; margin-bottom: 18px; }
        .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .summary span { border: 1px solid #d8e0eb; border-radius: 6px; padding: 8px 10px; background: #f5f8fc; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #0057a8; color: #fff; text-align: left; }
        th, td { border: 1px solid #cfd8e3; padding: 7px; vertical-align: top; }
        tr:nth-child(even) td { background: #f8fafc; }
        pre { white-space: pre-wrap; border: 1px solid #cfd8e3; padding: 12px; background: #f8fafc; font-family: Arial, sans-serif; font-size: 11px; }
        @media print { body { margin: 12mm; } button { display: none; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="date">Exported ${new Date().toLocaleString()}</div>
      <div class="summary">${report.summary}</div>
      ${report.table}
      ${report.notes ? `<h2>System Notes</h2><pre>${escapeHtml(report.notes)}</pre>` : ""}
    </body>
  </html>`;
}

function exportReportExcel(type) {
  const title = type === "takeoff" ? "GRIP Takeoff Estimate" : "GRIP Warranty Summary Chart";
  downloadTextFile(exportFileName(title, "xls"), reportExportHtml(type), "application/vnd.ms-excel;charset=utf-8");
}

function exportReportPdf(type) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Your browser blocked the export window. Allow pop-ups for GRIP, then try Export PDF again.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(reportExportHtml(type));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function accountProfileHtml(account) {
  const related = relatedFor(account.client || "");
  const counts = accountProposalCounts(account);
  const activities = accountActivityEntries(account).slice().sort((a, b) => compareNumber(dateValue(a.createdAt), dateValue(b.createdAt), "desc"));
  const rows = (items, titleKey, detailKey) =>
    items.length
      ? items.map((item) => `<li><strong>${escapeHtml(item[titleKey] || item.client || "Record")}</strong><span>${escapeHtml(item[detailKey] || item.stage || "")}</span></li>`).join("")
      : `<li><span>None listed</span></li>`;
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(account.client || "Account Profile")}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
        h1 { color: #0057a8; margin: 0 0 4px; }
        h2 { margin-top: 22px; color: #f58220; font-size: 16px; text-transform: uppercase; }
        .meta, .score { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
        .box { border: 1px solid #d8e0eb; border-radius: 6px; padding: 10px; background: #f8fafc; }
        .box small { display: block; color: #4b5563; text-transform: uppercase; font-weight: 700; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { border-bottom: 1px solid #e5e7eb; padding: 8px 0; display: flex; justify-content: space-between; gap: 12px; }
        p { white-space: pre-wrap; }
        @media print { body { margin: 12mm; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(account.client || "Account Profile")}</h1>
      <p>${escapeHtml([account.entity, account.county, account.clientRanking].filter(Boolean).join(" | "))}</p>
      <div class="meta">
        <div class="box"><small>Point of Contact</small>${escapeHtml(account.poc || "Not listed")}</div>
        <div class="box"><small>Phone</small>${escapeHtml(account.phone || "Not listed")}</div>
        <div class="box"><small>Email</small>${escapeHtml(account.email || "Not listed")}</div>
        <div class="box"><small>Address</small>${escapeHtml(account.address || "Not listed")}</div>
        <div class="box"><small>Shared Rep</small>${escapeHtml(account.sharedRep || "None")}</div>
        <div class="box"><small>Next Follow-Up</small>${escapeHtml(compactDate(account.nextFollowUp) || "Not set")}</div>
      </div>
      <div class="score">
        <div class="box"><small>Open Proposals</small>${counts.open}</div>
        <div class="box"><small>Won Proposals</small>${counts.won}</div>
        <div class="box"><small>Lost Proposals</small>${counts.lost}</div>
      </div>
      <h2>Projects</h2><ul>${rows(related.projects, "projectName", "stage")}</ul>
      <h2>Proposals</h2><ul>${rows(related.proposals, "project", "stage")}</ul>
      <h2>Recent Activity</h2><ul>${activities.length ? activities.slice(0, 12).map((item) => `<li><strong>${escapeHtml(compactDate(item.createdAt) || "No date")}</strong><span>${escapeHtml(item.note || "")}</span></li>`).join("") : `<li><span>No activity logged.</span></li>`}</ul>
      <h2>Notes</h2><p>${escapeHtml(state.notes[account.id] || "No saved notes.")}</p>
    </body>
  </html>`;
}

function exportAccountProfilePdf(accountId) {
  const account = findRecord("account", accountId);
  if (!account) return alert("I could not find that account.");
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Your browser blocked the export window. Allow pop-ups for GRIP, then try again.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(accountProfileHtml(account));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function contactsFor(type) {
  if (type === "contractor") {
    return contractorRecords().map((contractor) => ({
      company: contractor.companyName,
      name: contractor.poc,
      title: contractor.title,
      phone: contractor.phone,
      email: contractor.email,
      address: contractor.address,
      category: "Contractor",
    }));
  }
  return cleanAccounts().map((account) => ({
    company: account.client,
    name: account.poc,
    title: account.title,
    phone: account.phone,
    email: account.email,
    address: account.address,
    category: [account.entity, account.county].filter(Boolean).join(" / "),
  }));
}

function exportContactsCsv(type) {
  const rows = contactsFor(type);
  const headers = ["Company", "Name", "Title", "Phone", "Email", "Address", "Category"];
  const csv = [headers.map(csvCell).join(","), ...rows.map((row) => [row.company, row.name, row.title, row.phone, row.email, row.address, row.category].map(csvCell).join(","))].join("\n");
  downloadTextFile(`grip-${type}-contacts-${toLocalDateKey(new Date())}.csv`, csv, "text/csv;charset=utf-8");
}

function exportContactsVcard(type) {
  const cards = contactsFor(type)
    .filter((contact) => contact.name || contact.company || contact.phone || contact.email)
    .map((contact) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${calendarText(contact.name || contact.company)}`,
        contact.company ? `ORG:${calendarText(contact.company)}` : "",
        contact.title ? `TITLE:${calendarText(contact.title)}` : "",
        contact.phone ? `TEL:${calendarText(contact.phone)}` : "",
        contact.email ? `EMAIL:${calendarText(contact.email)}` : "",
        contact.address ? `ADR;TYPE=WORK:;;${calendarText(contact.address)};;;;` : "",
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n")
    )
    .join("\r\n");
  downloadTextFile(`grip-${type}-contacts-${toLocalDateKey(new Date())}.vcf`, cards, "text/vcard;charset=utf-8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function importAccountContactsCsv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    if (rows.length < 2) return alert("No contacts found in that CSV.");
    const headers = rows[0].map((header) => normalize(header));
    const indexOf = (...names) => headers.findIndex((header) => names.some((name) => header.includes(name)));
    const idx = {
      company: indexOf("company", "account", "client"),
      name: indexOf("name", "poc", "contact"),
      title: indexOf("title"),
      phone: indexOf("phone"),
      email: indexOf("email"),
      address: indexOf("address"),
      entity: indexOf("entity", "category"),
      county: indexOf("county"),
    };
    let imported = 0;
    rows.slice(1).forEach((row) => {
      const client = row[idx.company] || row[idx.name] || "";
      if (!client.trim()) return;
      if (findAccountByName(client)) return;
      const account = {
        id: `local-account-${Date.now()}-${imported}`,
        sourceRow: "Imported Contact",
        client,
        poc: idx.name >= 0 ? row[idx.name] : "",
        title: idx.title >= 0 ? row[idx.title] : "",
        phone: idx.phone >= 0 ? formatPhoneNumber(row[idx.phone]) : "",
        email: idx.email >= 0 ? row[idx.email] : "",
        address: idx.address >= 0 ? row[idx.address] : "",
        entity: idx.entity >= 0 ? row[idx.entity] : "",
        county: idx.county >= 0 ? row[idx.county] : "",
        clientRanking: "Prospecting",
        activity: new Date().toISOString(),
      };
      savedCrm.accounts.push(account);
      data.accounts.push(account);
      imported += 1;
    });
    saveCrm();
    renderFilters();
    render();
    alert(`${imported} account contacts imported.`);
  };
  reader.readAsText(file);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const storage = payload.localStorage || payload;
      Object.entries(storage).forEach(([key, value]) => {
        if (key.startsWith("garland") && value !== null && value !== undefined) localStorage.setItem(key, value);
      });
      window.location.reload();
    } catch (error) {
      alert("That backup file could not be imported.");
    }
  };
  reader.readAsText(file);
}

function applySavedFilter(filter) {
  state.search = "";
  byId("globalSearch").value = "";
  state.filters.entity = "All entities";
  state.filters.rank = "All rankings";
  state.filters.accountActivity = "All activity";
  state.filters.proposalBidStatus = "All bid statuses";
  state.filters.proposalStage = "All proposal stages";
  state.filters.proposalAging = "all";
  state.filters.dataQuality = "all";
  if (filter === "sharedAccounts") {
    setView("accounts");
    const shared = cleanAccounts().find((account) => account.sharedRep);
    state.search = shared?.sharedRep || "Shared Rep";
    byId("globalSearch").value = state.search;
  } else if (filter === "aAccounts") {
    setView("accounts");
    state.filters.rank = "A";
  } else if (filter === "openProposals") {
    setView("proposals");
    state.filters.proposalStage = "All proposal stages";
  } else if (filter === "staleAccounts") {
    setView("accounts");
    state.filters.accountActivity = "red";
  } else if (filter === "missingBids") {
    setView("proposals");
    state.filters.proposalBidStatus = "Missing bids";
  } else if (filter === "followUps") {
    setView("followUpQueue");
    state.filters.queueUrgency = "all";
  }
  renderFilters();
  render();
}

function relatedSection(title, records, renderer) {
  if (!records.length) return "";
  return `<section class="detail-section"><h4>${title}</h4><div class="stack-list">${records.map(renderer).join("")}</div></section>`;
}

function proposalUploadSections(proposal) {
  return `<section class="detail-section">
    <h4>Proposal Files</h4>
    <div class="upload-grid">
      ${uploadBox(proposal.id, "photoReport", "Photo Report")}
      ${uploadBox(proposal.id, "scopeOfWork", "Scope of Work")}
      ${scopeDatabaseTools(proposal.id, "proposal")}
      ${uploadBox(proposal.id, "proposalPricing", "Proposal Pricing")}
    </div>
  </section>`;
}

function projectUploadSections(project) {
  return `<section class="detail-section">
    <h4>Project Files</h4>
    <div class="upload-grid">
      ${uploadBox(project.id, "projectSpecifications", "Specifications")}
      ${uploadBox(project.id, "projectDrawings", "Drawings")}
      ${uploadBox(project.id, "projectWindUplift", "Wind-Uplift")}
      ${uploadBox(project.id, "projectTechnicalDocuments", "Technical Documents")}
      ${uploadBox(project.id, "projectScopeOfWork", "Scope of Work")}
      ${scopeDatabaseTools(project.id, "project")}
      ${uploadBox(project.id, "projectBidForm", "Bid Form")}
      ${uploadBox(project.id, "projectBids", "Bids")}
      ${uploadBox(project.id, "projectAddendum", "Addendum")}
      ${uploadBox(project.id, "projectOtherFiles", "Other Files")}
    </div>
  </section>`;
}

function scopeUploadCategory(type) {
  return type === "project" ? "projectScopeOfWork" : "scopeOfWork";
}

function scopeDatabaseTools(recordId, type) {
  const uploadCategory = scopeUploadCategory(type);
  const files = state.attachments[recordId]?.[uploadCategory] || [];
  const dbOptions = scopeDatabaseRecords()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(`${item.category} - ${item.name}`)}</option>`)
    .join("");
  return `<div class="scope-tools" data-scope-tools="${escapeHtml(recordId)}" data-scope-target-type="${escapeHtml(type)}">
    <div class="scope-tool-panel">
      <strong>Save uploaded scope to database</strong>
      <select data-scope-upload-file>
        <option value="">Choose uploaded scope</option>
        ${files.map((file, index) => `<option value="${index}">${escapeHtml(file.name)}</option>`).join("")}
      </select>
      <select data-scope-upload-category>
        <option>Repair</option>
        <option>Coating</option>
        <option>Restoration</option>
        <option>Reroof</option>
      </select>
      <button class="mini-button" data-save-scope-upload="${escapeHtml(recordId)}" type="button">Save to Scope of Work Database</button>
    </div>
    <div class="scope-tool-panel">
      <strong>Attach scope from database</strong>
      <select data-scope-db-select>
        <option value="">Choose saved scope</option>
        ${dbOptions}
      </select>
      <button class="mini-button" data-attach-scope-db="${escapeHtml(recordId)}" type="button">Attach Scope</button>
    </div>
  </div>`;
}

function uploadBox(recordId, category, label) {
  const files = state.attachments[recordId]?.[category] || [];
  const isWindUplift = normalize(category).includes("winduplift") || normalize(label).includes("wind uplift");
  return `<div class="upload-box" data-drop-record="${escapeHtml(recordId)}" data-drop-category="${escapeHtml(category)}">
    <div>
      <strong>${label}</strong>
      <div class="upload-actions">
        <label class="mini-button">
          Upload
          <input class="file-input" type="file" data-upload-category="${category}" data-upload-record="${escapeHtml(recordId)}" multiple />
        </label>
        ${isWindUplift ? `<a class="mini-button utility-mini" href="${windUpliftUrl}" target="_blank" rel="noopener">Order Wind Uplift</a>` : ""}
      </div>
    </div>
    <div class="file-list">
      ${
        files.length
          ? files
              .map(
                (file, index) => `<div class="file-row">
                  ${fileLink(file)}
                  <button class="mini-button" data-remove-file="${index}" data-file-category="${category}" data-file-record="${escapeHtml(recordId)}" type="button">Remove</button>
                </div>`
              )
              .join("")
          : `<p class="empty-state">No files uploaded yet.</p>`
      }
    </div>
    ${driveLinkForm(recordId, category)}
  </div>`;
}

function fileLink(file) {
  if (file.url) return `<a href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.name || "Google Drive file")}</a>`;
  return `<a href="${file.dataUrl}" download="${escapeHtml(file.name)}">${escapeHtml(file.name)}</a>`;
}

function driveLinkForm(recordId, category) {
  return `<form class="drive-link-form" data-drive-link-record="${escapeHtml(recordId)}" data-drive-link-category="${escapeHtml(category)}">
    <div class="drive-link-title">
      <strong>Link from Drive</strong>
      <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener">Open Drive</a>
    </div>
    <input name="driveName" placeholder="Optional file name" />
    <input name="driveUrl" type="url" placeholder="Paste share link" required />
    <button class="mini-button" type="submit">Attach Link</button>
  </form>`;
}

function contractorProposalUploadKey(contractor) {
  return `contractorProposal::${contractor}`;
}

function contractorProposalUploadBox(proposalId, contractor) {
  const category = contractorProposalUploadKey(contractor);
  const files = state.attachments[proposalId]?.[category] || [];
  return `<div class="contractor-upload" data-drop-record="${escapeHtml(proposalId)}" data-drop-category="${escapeHtml(category)}">
    <label class="mini-button">
      Upload proposal
      <input class="file-input" type="file" data-upload-category="${escapeHtml(category)}" data-upload-record="${escapeHtml(proposalId)}" multiple />
    </label>
    ${
      files.length
        ? `<div class="contractor-file-list">${files
            .map(
              (file, index) => `<span class="contractor-file">
                ${fileLink(file)}
                <button class="mini-button" data-remove-file="${index}" data-file-category="${escapeHtml(category)}" data-file-record="${escapeHtml(proposalId)}" type="button">×</button>
              </span>`
            )
            .join("")}</div>`
        : ""
    }
    ${driveLinkForm(proposalId, category)}
  </div>`;
}

function saveDriveLink(recordId, category, formEl) {
  const form = new FormData(formEl);
  const url = String(form.get("driveUrl") || "").trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) return alert("Paste a full Google Drive link that starts with https://");
  if (!state.attachments[recordId]) state.attachments[recordId] = {};
  if (!state.attachments[recordId][category]) state.attachments[recordId][category] = [];
  state.attachments[recordId][category].push({
    name: String(form.get("driveName") || "").trim() || "Google Drive file",
    url,
    driveLink: true,
    uploadedAt: new Date().toISOString(),
  });
  saveProposalAttachments();
  formEl.reset();
  const type = findRecord("project", recordId) ? "project" : "proposal";
  showDetail(type, recordId);
}

function saveProposalAttachments() {
  localStorage.setItem("garlandProposalAttachments", JSON.stringify(state.attachments));
}

function saveProjectChecklists() {
  localStorage.setItem("garlandProjectChecklists", JSON.stringify(state.projectChecklists));
}

function projectChecklistProgress(projectId) {
  const saved = state.projectChecklists[projectId] || {};
  const answered = projectChecklistItems.filter((item) => {
    const itemValue = saved[item.id] || {};
    return Object.values(itemValue).some((value) => value !== "" && value !== false && value !== null && value !== undefined);
  }).length;
  return { answered, total: projectChecklistItems.length };
}

function projectChecklistButton(project) {
  const progress = projectChecklistProgress(project.id);
  return `<section class="detail-section checklist-launch-section">
    <div>
      <h4>Project Checklist</h4>
      <p>${progress.answered} of ${progress.total} items started</p>
    </div>
    <button class="primary-button" data-open-project-checklist="${escapeHtml(project.id)}" type="button">Project Checklist</button>
  </section>`;
}

function checklistValue(saved, itemId, key = "value") {
  return saved[itemId]?.[key] ?? "";
}

function yesNoSelect(name, value = "") {
  return `<select name="${escapeHtml(name)}">
    <option value="">Select</option>
    <option value="Yes" ${value === "Yes" ? "selected" : ""}>Yes</option>
    <option value="No" ${value === "No" ? "selected" : ""}>No</option>
  </select>`;
}

function checklistFieldLabel(label) {
  return String(label || "")
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function checklistNumber(name, value = "", suffix = "inches") {
  const label = checklistFieldLabel(suffix);
  if (normalize(suffix).includes("inch")) {
    return `<label class="fraction-field"><span>${escapeHtml(label)}</span>
      <div>
        <select data-inch-preset="${escapeHtml(name)}">${inchFractionSelectOptions(value)}</select>
        <input name="${escapeHtml(name)}" list="inchFractionOptions" inputmode="decimal" placeholder="Type custom" value="${escapeHtml(value)}" />
      </div>
    </label>`;
  }
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="number" min="0" step="0.01" value="${escapeHtml(value)}" /></label>`;
}

function checklistUploadCategory(itemId) {
  return `projectChecklist::${itemId}`;
}

function checklistUploadBox(projectId, item) {
  const category = checklistUploadCategory(item.id);
  const files = state.attachments[projectId]?.[category] || [];
  const isWindUplift = item.id === "windUpliftCalculations" || normalize(item.label).includes("wind uplift");
  return `<div class="checklist-upload" data-checklist-drop-record="${escapeHtml(projectId)}" data-checklist-drop-category="${escapeHtml(category)}">
    <div>
      <strong>Photo</strong>
      <div class="upload-actions">
        <label class="mini-button">
          Upload / Camera
          <input class="file-input" type="file" accept="image/*" capture="environment" data-checklist-upload-record="${escapeHtml(projectId)}" data-checklist-upload-category="${escapeHtml(category)}" multiple />
        </label>
        ${isWindUplift ? `<a class="mini-button utility-mini" href="${windUpliftUrl}" target="_blank" rel="noopener">Order Wind Uplift</a>` : ""}
      </div>
    </div>
    <div class="file-list">
      ${
        files.length
          ? files
              .map(
                (file, index) => `<div class="file-row">
                  ${fileLink(file)}
                  <button class="mini-button" data-remove-file="${index}" data-file-category="${escapeHtml(category)}" data-file-record="${escapeHtml(projectId)}" type="button">Remove</button>
                </div>`
              )
              .join("")
          : `<p class="empty-state">Drop photos here or use Upload / Camera.</p>`
      }
    </div>
  </div>`;
}

function checklistShouldShowDetails(item, saved) {
  if (checklistValue(saved, item.id, "na") === "yes") return false;
  if (!item.photo && !item.description && !["yesnoDescription", "yesnoDate"].includes(item.type)) return false;
  if (!["yesno", "yesnoDescription", "yesnoDate"].includes(item.type)) return true;
  return checklistValue(saved, item.id) === "Yes";
}

function renderChecklistInputs(item, saved) {
  const id = item.id;
  const value = checklistValue(saved, id);
  if (item.type === "checkbox") {
    return `<label class="check-tile checklist-check"><input type="checkbox" name="${id}__value" value="yes" ${value === true || value === "yes" ? "checked" : ""} /><span>Complete</span></label>`;
  }
  if (item.type === "select") {
    return `<label><span>Selection</span><select name="${id}__value">${item.options
      .map((option) => `<option ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`)
      .join("")}</select></label>`;
  }
  if (item.type === "yesno") return `<label><span>Answer</span>${yesNoSelect(`${id}__value`, value)}</label>`;
  if (item.type === "number") return checklistNumber(`${id}__value`, value, item.suffix || "value");
  if (item.type === "yesnoNumber") {
    return `<label><span>Present?</span>${yesNoSelect(`${id}__value`, value)}</label>${checklistNumber(`${id}__height`, checklistValue(saved, id, "height"), item.suffix || "inches")}`;
  }
  if (item.type === "parapet") {
    return `${checklistNumber(`${id}__height`, checklistValue(saved, id, "height"), "height in inches")}
      <label><span>Continuous?</span>${yesNoSelect(`${id}__continuous`, checklistValue(saved, id, "continuous"))}</label>
      <label><span>Over 36 inches?</span>${yesNoSelect(`${id}__over36`, checklistValue(saved, id, "over36"))}</label>`;
  }
  if (item.type === "countDiameter") {
    return `${checklistNumber(`${id}__count`, checklistValue(saved, id, "count"), "count")}${checklistNumber(`${id}__diameter`, checklistValue(saved, id, "diameter"), "diameter inches")}`;
  }
  if (item.type === "countWidthHeight") {
    return `${checklistNumber(`${id}__count`, checklistValue(saved, id, "count"), "count")}${checklistNumber(`${id}__width`, checklistValue(saved, id, "width"), "width inches")}${checklistNumber(`${id}__height`, checklistValue(saved, id, "height"), "height inches")}`;
  }
  if (item.type === "countWidthDiameter") {
    return `${checklistNumber(`${id}__count`, checklistValue(saved, id, "count"), "count")}${checklistNumber(`${id}__width`, checklistValue(saved, id, "width"), "width inches")}${checklistNumber(`${id}__diameter`, checklistValue(saved, id, "diameter"), "diameter inches")}`;
  }
  if (item.type === "doubleYesNo") {
    return item.labels
      .map((label, index) => `<label><span>${escapeHtml(label)}</span>${yesNoSelect(`${id}__value${index + 1}`, checklistValue(saved, id, `value${index + 1}`))}</label>`)
      .join("");
  }
  if (item.type === "yesnoDescription") {
    return `<label><span>Answer</span>${yesNoSelect(`${id}__value`, value)}</label>
      <label class="full-field"><span>Description</span><textarea name="${id}__description">${escapeHtml(checklistValue(saved, id, "description"))}</textarea></label>`;
  }
  if (item.type === "yesnoDate") {
    return `<label><span>Answer</span>${yesNoSelect(`${id}__value`, value)}</label>
      <label><span>Date</span><input name="${id}__date" type="date" value="${escapeHtml(checklistValue(saved, id, "date"))}" /></label>`;
  }
  if (item.type === "sectionChecks") {
    const sections = [
      ["01100", "Summary of Work"],
      ["00720", "General Conditions"],
      ["072200", "Roof Deck and Insulation"],
      ["076200", "Edge Metal, Sheet Metal Flashing and Trim"],
      ["061000", "Rough Carpentry"],
    ];
    return `<div class="checklist-subchecks">${sections
      .map(([key, label]) => `<label><input type="checkbox" name="${id}__${key}" value="yes" ${checklistValue(saved, id, key) === "yes" ? "checked" : ""} /> ${escapeHtml(`${key} - ${label}`)}</label>`)
      .join("")}</div>`;
  }
  if (item.type === "projectCenterCosts") {
    const costs = [
      ["uploaded", "Uploaded everything into Project Center"],
      ["woodNailer", "Line item cost for wood nailer replacement"],
      ["deckReplacement", "Line item cost for deck replacement"],
      ["drainReplacement", "Line item cost for drain replacement"],
      ["mechanicalUnits", "Line item cost for raising mechanical units"],
      ["roofHatch", "Line item cost for new roof hatch"],
    ];
    return `<div class="checklist-subchecks">${costs
      .map(([key, label]) => `<label><input type="checkbox" name="${id}__${key}" value="yes" ${checklistValue(saved, id, key) === "yes" ? "checked" : ""} /> ${escapeHtml(label)}</label>`)
      .join("")}</div>`;
  }
  return `<input name="${id}__value" value="${escapeHtml(value)}" />`;
}

function renderProjectChecklist(projectId) {
  const project = findRecord("project", projectId);
  if (!project) return;
  const saved = state.projectChecklists[projectId] || {};
  byId("projectChecklistProjectId").value = projectId;
  byId("projectChecklistTitle").textContent = project.projectName || project.client || "Project Checklist";
  byId("projectChecklistContent").innerHTML = projectChecklistItems
    .map(
      (item) => {
        const isNa = checklistValue(saved, item.id, "na") === "yes";
        return `<section class="checklist-item ${isNa ? "is-na" : ""}">
        <div class="checklist-item-top">
          <div class="checklist-question">
            <span>${escapeHtml(item.number)}</span>
            <strong>${escapeHtml(item.label)}</strong>
          </div>
          <button class="na-toggle-button ${isNa ? "is-active" : ""}" data-toggle-checklist-na="${escapeHtml(item.id)}" type="button">${isNa ? "Marked N/A" : "N/A"}</button>
          <input type="hidden" name="${item.id}__na" value="${isNa ? "yes" : ""}" />
        </div>
        ${!isNa ? `<div class="checklist-fields">${renderChecklistInputs(item, saved)}</div>` : ""}
        ${
          !isNa && item.description && item.type !== "yesnoDescription" && checklistShouldShowDetails(item, saved)
            ? `<label class="full-field"><span>Description</span><textarea name="${item.id}__description">${escapeHtml(checklistValue(saved, item.id, "description"))}</textarea></label>`
            : ""
        }
        ${!isNa && item.photo && checklistShouldShowDetails(item, saved) ? checklistUploadBox(projectId, item) : ""}
      </section>`;
      }
    )
    .join("");
}

function openProjectChecklist(projectId) {
  renderProjectChecklist(projectId);
  if (byId("recordQuickDialog")?.open) byId("recordQuickDialog").close();
  openDialog("projectChecklistDialog");
}

function saveProjectChecklistFromForm(formEl) {
  const projectId = saveProjectChecklistDraft();
  if (!projectId) return;
  byId("projectChecklistDialog").close();
  showDetail("project", projectId);
}

function printProjectChecklist() {
  saveProjectChecklistDraft();
  document.body.classList.add("printing-checklist");
  window.print();
  setTimeout(() => document.body.classList.remove("printing-checklist"), 500);
}

function toggleProjectChecklistNa(itemId) {
  const formEl = byId("projectChecklistForm");
  const projectId = String(new FormData(formEl).get("projectId") || "");
  if (!projectId) return;
  saveProjectChecklistDraft();
  if (!state.projectChecklists[projectId]) state.projectChecklists[projectId] = {};
  if (!state.projectChecklists[projectId][itemId]) state.projectChecklists[projectId][itemId] = {};
  const item = state.projectChecklists[projectId][itemId];
  item.na = item.na === "yes" ? "" : "yes";
  saveProjectChecklists();
  renderProjectChecklist(projectId);
}

function saveProjectChecklistDraft() {
  const formEl = byId("projectChecklistForm");
  const form = new FormData(formEl);
  const projectId = String(form.get("projectId") || "");
  if (!projectId) return "";
  const next = {};
  projectChecklistItems.forEach((item) => {
    const prefix = `${item.id}__`;
    const values = {};
    [...form.entries()].forEach(([key, value]) => {
      if (key.startsWith(prefix)) values[key.slice(prefix.length)] = value;
    });
    values.na = form.get(`${item.id}__na`) === "yes" ? "yes" : "";
    if (item.type === "checkbox") values.value = form.has(`${item.id}__value`);
    next[item.id] = values;
  });
  state.projectChecklists[projectId] = next;
  saveProjectChecklists();
  return projectId;
}

function clearProjectChecklist(projectId) {
  if (!projectId || !confirm("Clear this project checklist?")) return;
  delete state.projectChecklists[projectId];
  saveProjectChecklists();
  renderProjectChecklist(projectId);
  showDetail("project", projectId);
}

function addChecklistFiles(projectId, category, files) {
  if (!files || !files.length) return;
  if (!confirmLargeLocalFiles(files, "checklist attachments")) return;
  if (!state.attachments[projectId]) state.attachments[projectId] = {};
  if (!state.attachments[projectId][category]) state.attachments[projectId][category] = [];
  [...files].forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      state.attachments[projectId][category].push({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
        uploadedAt: new Date().toISOString(),
      });
      saveProposalAttachments();
      renderProjectChecklist(projectId);
      showDetail("project", projectId);
    };
    reader.readAsDataURL(file);
  });
}

function recordTitleForScope(recordId) {
  const project = findRecord("project", recordId);
  if (project) return project.projectName || project.client || "Project";
  const proposal = findRecord("proposal", recordId);
  if (proposal) return proposal.project || proposal.client || "Proposal";
  return "Record";
}

function saveUploadedScopeToDatabase(recordId, fileIndex, scopeCategory) {
  const type = findRecord("project", recordId) ? "project" : "proposal";
  const uploadCategory = scopeUploadCategory(type);
  const file = state.attachments[recordId]?.[uploadCategory]?.[Number(fileIndex)];
  if (!file) return alert("Choose an uploaded scope first.");
  const entry = {
    id: `scope-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: file.dataUrl,
    url: file.url || "",
    driveLink: Boolean(file.driveLink),
    category: scopeCategory || "Repair",
    sourceType: type,
    sourceId: recordId,
    sourceTitle: recordTitleForScope(recordId),
    savedAt: new Date().toISOString(),
  };
  state.scopeDatabase.unshift(entry);
  saveScopeDatabase();
  renderScopeDatabase();
  showDetail(type, recordId);
}

function attachScopeFromDatabase(recordId, scopeId) {
  const item = scopeDatabaseRecords().find((entry) => entry.id === scopeId);
  if (!item) return alert("Choose a saved scope first.");
  const type = findRecord("project", recordId) ? "project" : "proposal";
  const uploadCategory = scopeUploadCategory(type);
  if (!state.attachments[recordId]) state.attachments[recordId] = {};
  if (!state.attachments[recordId][uploadCategory]) state.attachments[recordId][uploadCategory] = [];
  state.attachments[recordId][uploadCategory].push({
    name: item.name,
    type: item.type,
    size: item.size,
    dataUrl: item.dataUrl,
    url: item.url || "",
    driveLink: Boolean(item.driveLink),
    uploadedAt: new Date().toISOString(),
    fromScopeDatabase: item.id,
  });
  saveProposalAttachments();
  showDetail(type, recordId);
}

function deleteScopeDatabaseEntry(id) {
  if (!confirm("Delete this saved scope of work from the database?")) return;
  state.scopeDatabase = state.scopeDatabase.filter((entry) => entry.id !== id);
  saveScopeDatabase();
  renderScopeDatabase();
}

function scopeLibraryCategory(item) {
  const text = normalize(`${item.title} ${item.id}`);
  if (text.includes("coating") || text.includes("silicone") || text.includes("restoration")) return "Restoration";
  if (text.includes("replacement") || text.includes("thermoplastic") || text.includes("modified bitumen")) return "Reroof";
  if (text.includes("repair") || text.includes("leak")) return "Repair";
  return "Repair";
}

function scopeLibraryFormData(libraryId) {
  const form = new FormData();
  form.set("scopeType", libraryId);
  return form;
}

function scopeLibraryRecord(item) {
  const text = scopeTemplateText(scopeLibraryFormData(item.id));
  return {
    id: `built-in-scope-${item.id}`,
    libraryId: item.id,
    builtIn: true,
    name: item.title,
    type: "text/plain",
    size: text.length,
    dataUrl: textFileDataUrl(text),
    category: scopeLibraryCategory(item),
    sourceType: "Built-In Template",
    sourceId: item.id,
    sourceTitle: "Preloaded Scope of Work Library",
    templateText: text,
    savedAt: "",
  };
}

function builtInScopeDatabaseRecords() {
  return scopeWorkLibrary.map(scopeLibraryRecord);
}

function scopeDatabaseRecords() {
  return [...builtInScopeDatabaseRecords(), ...state.scopeDatabase];
}

const scopeWorkLibrary = [
  {
    id: "localized-metal-r-panel-repair",
    title: "Localized Metal R-Panel Repair",
    overview:
      "Localized repair for a damaged R-panel, puncture, hole, rusted panel, failed coating, or localized leak condition.",
    workItems: [
      {
        title: "Damaged R-Panel Repair",
        steps: [
          'Mechanically remove existing coating by wire brushing to expose sound substrate.',
          'Prepare a minimum 18" x 18" repair area around the damaged panel condition.',
          'Provide minimum 4" overlap onto the surrounding field of the roof system.',
          "If rust is discovered, treat affected area with rust inhibitor and primer prior to reinforcement.",
          "Install reinforcing tape or polyester reinforcement centered over the repair area.",
          "Apply silicone coating system over the reinforced area per manufacturer coverage rates.",
          "Achieve minimum total dry film thickness of 25 to 35 mils unless otherwise directed.",
        ],
      },
      {
        title: "Final Seal and Inspection",
        steps: [
          "Confirm repair area is fully sealed and bonded.",
          "Water test repair area if active leak condition was reported.",
          "Correct deficiencies before final walkthrough.",
        ],
      },
    ],
  },
  {
    id: "metal-roof-seam-fastener-restoration",
    title: "Metal Roof Seam and Fastener Restoration",
    overview: "Metal roof restoration scope for open seams, backed-out fasteners, failed washers, rust, or coating breakdown.",
    workItems: [
      {
        title: "Surface Preparation",
        steps: [
          "Pressure wash roof surface to remove dirt, oxidation, loose coating, and contaminants.",
          "Mechanically abrade rusted or poorly bonded areas as needed.",
          "Treat rust with rust inhibitor and primer before coating application.",
          "Allow substrate to dry prior to installation of reinforcement or coating.",
        ],
      },
      {
        title: "Seam Reinforcement",
        steps: [
          "Reinforce panel seams using approved reinforcing tape or polyester reinforcement.",
          "Center reinforcement over seams and fully embed into base coat.",
          "Ensure full adhesion with no fishmouths, wrinkles, or voids.",
        ],
      },
      {
        title: "Fastener Reinforcement",
        steps: [
          "Inspect all exposed fasteners.",
          "Replace backed-out, stripped, or failed fasteners with new gasketed fasteners.",
          "Encapsulate each fastener with silicone coating or approved flashing material.",
          "Confirm fasteners are sealed prior to field coating.",
        ],
      },
      {
        title: "Coating Application",
        steps: [
          "Apply silicone coating system in accordance with manufacturer guidelines.",
          "Apply base coat and top coat at required coverage rates.",
          "Achieve required dry film thickness for warranty term requested.",
        ],
      },
    ],
  },
  {
    id: "full-metal-roof-silicone-coating",
    title: "Full Metal Roof Silicone Coating System",
    overview: "Full restoration coating scope over an existing R-panel metal roof.",
    workItems: [
      {
        title: "Cleaning and Preparation",
        steps: [
          "Pressure wash entire roof surface.",
          "Remove loose coating, oxidation, debris, and contaminants.",
          "Mechanically prepare rusted areas.",
          "Treat rust with rust inhibitor and primer.",
          "Confirm roof is dry and acceptable for coating application.",
        ],
      },
      {
        title: "Detail Reinforcement",
        steps: [
          "Reinforce all panel seams with approved tape or polyester reinforcement.",
          "Reinforce transitions, penetrations, ridge caps, laps, curbs, and details.",
          "Replace and seal compromised fasteners.",
          "Apply detail coating at manufacturer recommended thickness.",
        ],
      },
      {
        title: "Field Coating",
        steps: [
          "Apply silicone roof coating system across the entire roof area.",
          "Apply coating at manufacturer required coverage rate for specified warranty.",
          "Maintain uniform application and required dry film thickness.",
          "Provide wet mil checks during application and final DFT verification.",
        ],
      },
      {
        title: "Testing and Manufacturer Inspection",
        steps: [
          "Manufacturer representative shall inspect work minimum two times per week during installation.",
          "Contractor shall correct deficiencies identified during inspections.",
          "Final inspection required prior to warranty issuance.",
        ],
      },
      {
        title: "Warranty",
        steps: ["Provide requested warranty term, typically 10 years unless otherwise noted."],
      },
    ],
  },
  {
    id: "ridge-cap-restoration",
    title: "Ridge Cap Restoration",
    overview: "Ridge cap restoration for leaking, failed coating, or deteriorated seams.",
    workItems: [
      {
        title: "Ridge Cap Preparation",
        steps: [
          "Clean and prepare full ridge cap area.",
          "Mechanically remove failing coating along both sides of ridge cap.",
          "Treat rust with rust inhibitor and primer where present.",
        ],
      },
      {
        title: "Ridge Seam Reinforcement",
        steps: [
          'Install 6" reinforcing tape or polyester reinforcement along both sides of ridge seams.',
          "Fully embed reinforcement into base coat.",
          "Ensure reinforcement is smooth and fully adhered.",
        ],
      },
      {
        title: "Coating Application",
        steps: [
          "Apply silicone coating system over reinforced ridge cap area.",
          "Achieve minimum total dry film thickness of 30 to 40 mils for enhanced durability.",
          "Extend coating beyond reinforced areas as required to create a watertight transition.",
        ],
      },
    ],
  },
  {
    id: "two-ply-modified-bitumen-replacement",
    title: "2-Ply Modified Bitumen Roof Replacement",
    overview: "Long-term replacement scope for FM-style assemblies, cold storage, high-wind, hail, or institutional roof replacement.",
    workItems: [
      {
        title: "Tear-Off and Deck Preparation",
        steps: [
          "Remove existing roof system down to structural deck.",
          "Dispose of all debris off site.",
          "Only remove roof areas that can be made watertight the same day.",
          "Inspect deck and notify owner of damaged or deteriorated conditions before proceeding.",
        ],
      },
      {
        title: "Insulation Installation",
        steps: [
          "Install polyisocyanurate insulation in required thickness.",
          "Mechanically fasten or adhere insulation in accordance with project-specific wind uplift requirements.",
          "Maintain positive drainage and required flashing heights.",
        ],
      },
      {
        title: "Cover Board Installation",
        steps: [
          'Install minimum 5/8" gypsum cover board or approved high-performance cover board.',
          "Adhere or fasten cover board in accordance with manufacturer and wind uplift requirements.",
          "Stagger joints and ensure smooth substrate for membrane installation.",
        ],
      },
      {
        title: "Base Ply Installation",
        steps: [
          "Install one ply of ASTM D6163 Type III Grade S SBS modified bitumen base sheet.",
          "Fully heat fuse or cold apply as selected for the project.",
          "Maintain proper side laps, end laps, and bleed out.",
        ],
      },
      {
        title: "Cap Sheet Installation",
        steps: [
          "Install one ply of ASTM D6162 or ASTM D6164 mineral-surfaced SBS modified bitumen cap sheet.",
          "Fully adhere cap sheet in accordance with manufacturer guidelines.",
          "Broadcast matching granules into bleed out where required.",
        ],
      },
      {
        title: "Flashings and Details",
        steps: [
          "Complete all base flashings, curbs, corners, penetrations, drains, and transitions per manufacturer details.",
          'Maintain minimum 8" flashing height above finished roof surface where possible.',
          "Notify owner where existing conditions prevent required flashing height.",
        ],
      },
      {
        title: "Edge Metal",
        steps: [
          "Install new minimum 22-gauge prefinished metal edge system.",
          "Include continuous cleat.",
          "Install in accordance with ANSI/SPRI ES-1 requirements.",
        ],
      },
      {
        title: "Final Inspection",
        steps: ["Complete manufacturer inspection.", "Correct all deficiencies prior to final acceptance."],
      },
    ],
  },
  {
    id: "thermoplastic-recover-replacement",
    title: "Thermoplastic Roof Recover or Replacement",
    overview: "Thermoplastic single-ply recover or replacement scope for TPO, PVC, or KEE-style systems.",
    workItems: [
      {
        title: "Existing Roof Preparation",
        steps: [
          "Perform pre-job rooftop inspection with owner representative.",
          "Remove existing roof system or prepare recover substrate as required.",
          "Dispose of debris off site.",
          "Verify existing conditions, drains, curbs, penetrations, and edge details.",
        ],
      },
      {
        title: "Insulation and Cover Board",
        steps: [
          "Install insulation layer as required by project design.",
          "Install cover board where required for durability, substrate stability, or warranty.",
          "Fasten or adhere components per manufacturer and wind uplift requirements.",
        ],
      },
      {
        title: "Membrane Installation",
        steps: [
          "Install thermoplastic membrane in accordance with manufacturer specifications.",
          "Fully adhere, mechanically attach, or induction weld as required by project design.",
          "Heat weld seams and probe all seams after cooling.",
        ],
      },
      {
        title: "Flashings and Penetrations",
        steps: [
          "Flash parapets, curbs, walls, pipes, drains, stacks, and penetrations per manufacturer details.",
          "Install pre-molded boots or field-fabricated flashings where required.",
          "Install walk pads at service sides of rooftop equipment and access points.",
        ],
      },
      {
        title: "Edge Metal and Drains",
        steps: [
          "Install coated metal edge at gutters and open perimeters.",
          "Install drain inserts or retrofit drains where required.",
          "Confirm watertight tie-ins at drains and scuppers.",
        ],
      },
      {
        title: "Final Inspection and Warranty",
        steps: ["Clean roof and remove debris.", "Complete manufacturer inspection.", "Provide requested warranty term."],
      },
    ],
  },
  {
    id: "drain-sump-water-test-repair",
    title: "Drain, Sump, and Water Test Repair",
    overview: "Repair scope for leaks related to drains, ponding, or unsumped retrofit drains.",
    workItems: [
      {
        title: "Drain Investigation",
        steps: [
          "Inspect existing drain bowl, clamping ring, strainer, sump, and tie-in conditions.",
          "Remove debris and confirm drain is open.",
          "Verify whether drain is properly sumped below surrounding roof surface.",
        ],
      },
      {
        title: "Drain Repair",
        steps: [
          "Remove existing deficient flashing or membrane tie-in.",
          "Rework sump area as required to promote drainage.",
          "Install new drain flashing per manufacturer details.",
          "Install retrofit drain if existing drain condition cannot be properly tied in.",
        ],
      },
      {
        title: "Water Testing",
        steps: [
          "Perform controlled water test at drain area.",
          "Monitor interior for water intrusion.",
          "Document results and notify owner of findings.",
          "Correct deficiencies before final acceptance.",
        ],
      },
    ],
  },
  {
    id: "pipe-curb-flashing-repair",
    title: "Pipe Penetration, Curb, and Flashing Repair",
    overview: "Repair scope for leaks at pipes, HVAC curbs, pitch pans, abandoned curbs, or wall transitions.",
    workItems: [
      {
        title: "Existing Detail Preparation",
        steps: [
          "Remove loose sealant, failed coating, and deteriorated flashing material.",
          "Clean and dry the substrate.",
          "Mechanically abrade areas as needed to achieve proper adhesion.",
        ],
      },
      {
        title: "Flashing Repair",
        steps: [
          "Install manufacturer-approved flashing material at pipe, curb, or penetration.",
          "Reinforce transitions with mesh, tape, or membrane flashing as required.",
          "Seal termination points with compatible sealant.",
          "Ensure repair ties into sound roof membrane.",
        ],
      },
      {
        title: "Testing",
        steps: [
          "Perform targeted water test if leak was active.",
          "Monitor interior location during test.",
          "Correct deficiencies before final walkthrough.",
        ],
      },
    ],
  },
  {
    id: "emergency-leak-temporary-repair",
    title: "Emergency Leak Response / Temporary Repair",
    overview: "Immediate leak response scope intended to stabilize the condition before a permanent scope is finalized.",
    workItems: [
      {
        title: "Leak Investigation",
        steps: [
          "Inspect reported leak area from roof and interior.",
          "Identify likely source of water intrusion.",
          "Document observed conditions with photos.",
        ],
      },
      {
        title: "Temporary Repair",
        steps: [
          "Clean and dry repair area as conditions allow.",
          "Apply compatible temporary sealant, flashing tape, mastic, or membrane patch.",
          "Extend temporary repair beyond suspected leak source.",
          "Confirm repair is watertight to the extent possible.",
        ],
      },
      {
        title: "Follow-Up Recommendation",
        steps: [
          "Provide written recommendation for permanent repair or replacement.",
          "Identify whether additional testing is required.",
          "Note that temporary repair is not a long-term corrective solution.",
        ],
      },
    ],
  },
  {
    id: "general-project-requirements-addon",
    title: "General Project Requirements Add-On",
    overview: "General project requirements to include with roofing scopes when appropriate.",
    workItems: [
      {
        title: "General Project Requirements",
        steps: [
          "Contractor shall verify all measurements, quantities, and field conditions prior to ordering materials.",
          "Contractor shall protect existing building, roof, landscaping, equipment, and interior contents.",
          "Contractor shall maintain watertight conditions at all times.",
          "Contractor shall only remove roof areas that can be dried in the same workday.",
          "Contractor shall coordinate work schedule with owner.",
          "Contractor shall comply with OSHA and site safety requirements.",
          "Contractor shall provide daily cleanup and remove debris from site.",
          "Contractor shall notify owner and manufacturer representative of unforeseen conditions.",
          "Contractor shall not alter structural components without written approval.",
          "Contractor shall complete final walkthrough with owner and manufacturer representative.",
        ],
      },
    ],
  },
];

function scopeLibraryType(id) {
  return scopeWorkLibrary.find((item) => item.id === id) || null;
}

function formatScopeWorkItems(items) {
  return items
    .map((item, index) => {
      const steps = item.steps.map((step) => `- ${step}`).join("\n");
      return `${index + 1}: ${item.title}\n${steps}`;
    })
    .join("\n");
}

function territoryRepSignatureName() {
  return String(territorySettings.rep?.name || "").trim() || "Garland Representative";
}

function scopeManualWorkItems(form) {
  const dynamicItems = form.getAll("workItems").map((item) => String(item || "").trim()).filter(Boolean);
  const legacyItems = [String(form.get("workItem1") || "").trim(), String(form.get("workItem2") || "").trim()].filter(Boolean);
  return dynamicItems.length ? dynamicItems : legacyItems;
}

function scopeWorkItemFromManualText(text, index) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return {
      title: lines[0].replace(/:$/, ""),
      steps: lines.slice(1).map((line) => line.replace(/^[-•]\s*/, "")),
    };
  }
  return {
    title: index === 0 ? "Project Scope Task" : "Additional Scope Task",
    steps: [
      text,
      "Include clear task steps and surface preparation requirements.",
      "Include Garland product references, application rates, mil thickness, overlap requirements, cure times, or manufacturer requirements when applicable.",
      "Include field verification, testing, or inspection language where needed.",
    ],
  };
}

function scopeTemplateText(form) {
  const dueDate = compactDate(addDays(new Date(), 7));
  const project = String(form.get("project") || "").trim();
  const location = String(form.get("location") || "").trim();
  const client = String(form.get("clientName") || "").trim() || "[Client Name]";
  const type = scopeLibraryType(String(form.get("scopeType") || ""));
  const overview =
    String(form.get("overview") || "").trim() ||
    type?.overview ||
    "Provide all labor, material, equipment, supervision, safety controls, and field verification necessary to complete the roofing work described below. The intent of this scope is to establish a clear basis of pricing, identify required preparation and installation steps, and ensure all work is performed in accordance with Garland requirements, project conditions, and manufacturer guidelines.";
  const manualItems = scopeManualWorkItems(form);
  const workItems = manualItems.length
    ? manualItems.map(scopeWorkItemFromManualText)
    : type?.workItems || [
        {
          title: "Roof Area Preparation",
          steps: [
            "Complete cleaning, field verification, substrate review, and preparation of all areas scheduled to receive work.",
            "Confirm existing conditions are acceptable before installation begins.",
          ],
        },
        {
          title: "Roofing Work",
          steps: [
            "Complete roofing repairs, detailing, flashing, drain, seam, fastener, coating, or roof system work as required by the selected scope and field conditions.",
            "Include required testing or inspection procedures when applicable.",
          ],
        },
      ];
  return `SCOPE OF WORK

Project: ${project}
Location: ${location}
Due Date: ${dueDate}

Overview:
${overview}

Work Items:

${formatScopeWorkItems(workItems)}

General Requirements:
- Contractor is responsible for verifying all measurements, quantities, and field conditions.
- All products shall be applied according to manufacturer published guidelines and data sheets.
- Work area shall be kept clean and protected throughout the project.
- Contractor shall protect the building from water intrusion during construction.
- Contractor shall notify owner or manufacturer representative of any unforeseen conditions before proceeding.
- Contractor shall protect all adjacent surfaces, building occupants, landscaping, vehicles, and equipment.
- Contractor shall provide daily cleanup and remove all debris from the project site.
- Final walkthrough required with client representative or manufacturer's representative upon completion.
- Include manufacturer inspection requirements when requested.
- Include warranty language when requested.
- Contractor shall correct any deficiencies identified during the final inspection.

Contractor Email:
Subject: Scope of Work for ${project || "[Project Name]"}

${client},

Attached is the scope of work for ${project || "[Project Name]"}. The proposal due date is ${dueDate}.

Please review the scope, verify field conditions, and include all labor, material, equipment, supervision, safety requirements, protection, cleanup, warranty requirements, and any necessary field verification in your proposal.

Thank you,
${territoryRepSignatureName()}
The Garland Company
`;
}

function updateScopeTemplatePreview() {
  byId("scopeTemplatePreview").value = scopeTemplateText(new FormData(byId("scopeForm")));
}

function scopeWorkItemTemplate(index, value = "") {
  return `<label class="scope-work-item">
    <span>Work Item ${index}</span>
    <textarea name="workItems" placeholder="Summary, preparation, Garland products, rates, overlaps, cure times, verification">${escapeHtml(value)}</textarea>
    ${index > 1 ? `<button class="mini-button" data-remove-scope-work-item type="button">Remove</button>` : ""}
  </label>`;
}

function renumberScopeWorkItems() {
  const items = [...byId("scopeWorkItemsList").querySelectorAll(".scope-work-item")];
  items.forEach((item, index) => {
    item.querySelector("span").textContent = `Work Item ${index + 1}`;
    const existingRemove = item.querySelector("[data-remove-scope-work-item]");
    if (index === 0 && existingRemove) existingRemove.remove();
    if (index > 0 && !existingRemove) item.insertAdjacentHTML("beforeend", `<button class="mini-button" data-remove-scope-work-item type="button">Remove</button>`);
  });
}

function resetScopeWorkItems() {
  byId("scopeWorkItemsList").innerHTML = scopeWorkItemTemplate(1);
}

function setScopeWorkItems(items) {
  const values = items.length ? items : [""];
  byId("scopeWorkItemsList").innerHTML = values.map((value, index) => scopeWorkItemTemplate(index + 1, value)).join("");
}

function scopeWorkItemEditText(item) {
  return `${item.title}\n${item.steps.map((step) => `- ${step}`).join("\n")}`;
}

function useScopeTemplate(libraryId) {
  const template = scopeLibraryType(libraryId);
  if (!template) return;
  const form = byId("scopeForm");
  form.reset();
  form.elements.name.value = template.title;
  form.elements.category.value = scopeLibraryCategory(template);
  form.elements.scopeType.value = template.id;
  form.elements.overview.value = template.overview || "";
  setScopeWorkItems(template.workItems.map(scopeWorkItemEditText));
  updateScopeTemplatePreview();
  openDialog("scopeDialog");
}

function addScopeWorkItem() {
  const count = byId("scopeWorkItemsList").querySelectorAll(".scope-work-item").length + 1;
  byId("scopeWorkItemsList").insertAdjacentHTML("beforeend", scopeWorkItemTemplate(count));
}

function saveStandaloneScope(formEl) {
  const form = new FormData(formEl);
  const file = formEl.elements.file.files?.[0];
  const generatedText = scopeTemplateText(form);
  if (!file && !String(form.get("scopeType") || form.get("project") || form.get("overview") || scopeManualWorkItems(form).join(" ")).trim()) return alert("Upload a scope or fill in the template fields.");
  if (!file) {
    state.scopeDatabase.unshift({
      id: `scope-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: form.get("name") || `${form.get("project") || "Generated"} Scope of Work`,
      type: "text/plain",
      size: generatedText.length,
      dataUrl: textFileDataUrl(generatedText),
      category: form.get("category") || "Repair",
      sourceType: "Generated Scope of Work",
      sourceId: "",
      sourceTitle: "Generated from template",
      templateText: generatedText,
      savedAt: new Date().toISOString(),
    });
    saveScopeDatabase();
    renderScopeDatabase();
    byId("scopeDialog").close();
    formEl.reset();
    resetScopeWorkItems();
    byId("scopeTemplatePreview").value = "";
    setView("scopeDatabase");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.scopeDatabase.unshift({
      id: `scope-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: form.get("name") || file.name,
      type: file.type,
      size: file.size,
      dataUrl: reader.result,
      category: form.get("category") || "Repair",
      sourceType: "Scope of Work Database",
      sourceId: "",
      sourceTitle: "Uploaded directly",
      templateText: generatedText,
      savedAt: new Date().toISOString(),
    });
    saveScopeDatabase();
    renderScopeDatabase();
    byId("scopeDialog").close();
    formEl.reset();
    resetScopeWorkItems();
    byId("scopeTemplatePreview").value = "";
    setView("scopeDatabase");
  };
  reader.readAsDataURL(file);
}

function addProposalFiles(proposalId, category, files) {
  if (!files || !files.length) return;
  if (!confirmLargeLocalFiles(files, "proposal or project attachments")) return;
  if (!state.attachments[proposalId]) state.attachments[proposalId] = {};
  if (!state.attachments[proposalId][category]) state.attachments[proposalId][category] = [];
  [...files].forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      state.attachments[proposalId][category].push({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
        uploadedAt: new Date().toISOString(),
      });
      saveProposalAttachments();
      const type = findRecord("project", proposalId) ? "project" : "proposal";
      showDetail(type, proposalId);
    };
    reader.readAsDataURL(file);
  });
}

function handleDroppedFiles(dropZone, files) {
  if (!dropZone || !files?.length) return;
  addProposalFiles(dropZone.dataset.dropRecord, dropZone.dataset.dropCategory, files);
  dropZone.classList.remove("is-dragging");
}

function projectCanHaveAwardedContractor(project) {
  return stageRank(project.stage) >= stageRank("Project Awarded");
}

function projectBiddingContractorControls(project) {
  const selected = splitContractors(project.biddingContractors);
  const options = [...new Set([...contractorNames(), ...selected])].sort((a, b) => a.localeCompare(b));
  return `<section class="detail-section">
    <h4>Bidding Contractors</h4>
    <div class="proposal-contractor-menus" data-project-bidding="${project.id}">
      ${selectedContractorSummary(selected)}
      <div>
        <span>Bidding Contractors</span>
        <div class="contractor-option-list">
          ${
            options.length
              ? options.map((contractor) => `<label><input type="checkbox" data-project-bidding-contractor="${escapeHtml(contractor)}" ${selected.includes(contractor) ? "checked" : ""} /> <span${contractorStyle(contractor)}>${escapeHtml(contractor)}</span></label>`).join("")
              : `<p class="empty-state">No contractors yet.</p>`
          }
        </div>
      </div>
    </div>
  </section>`;
}

function selectedContractorSummary(contractors) {
  return `<div class="selected-contractor-summary">
    <strong>Selected</strong>
    <div>${contractors.length ? contractors.map((contractor) => `<span class="pill"${contractorStyle(contractor)}>${escapeHtml(contractor)}</span>`).join("") : `<span class="empty-state">No contractors selected.</span>`}</div>
  </div>`;
}

function projectAwardedContractorControls(project) {
  if (!projectCanHaveAwardedContractor(project)) return "";
  const bidding = splitContractors(project.biddingContractors);
  const awarded = project.awardedContractor || "Not awarded yet";
  const options = ["Not awarded yet", ...new Set([...bidding, project.awardedContractor].filter(Boolean))].map((contractor) => {
    const selected = awarded === contractor ? "selected" : "";
    return `<option ${selected}>${escapeHtml(contractor)}</option>`;
  });
  return `<section class="detail-section">
    <h4>Awarded Contractor</h4>
    <label class="full-field">
      <span>Awarded Contractor</span>
      <select data-project-awarded="${project.id}">${options.join("")}</select>
    </label>
  </section>`;
}

function contractorProfileEditForm(profile) {
  return `<form class="contractor-detail-form" data-contractor-profile="${escapeHtml(profile.companyName)}">
    <div class="field-grid">
      <label class="field"><span>Company Name</span><input name="companyName" value="${escapeHtml(profile.companyName || "")}" required /></label>
      <label class="field"><span>Point of Contact</span><input name="poc" value="${escapeHtml(profile.poc || "")}" /></label>
      <label class="field"><span>Title</span><input name="title" value="${escapeHtml(profile.title || "")}" /></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" value="${escapeHtml(formatPhoneNumber(profile.phone) || profile.phone || "")}" /></label>
      <label class="field"><span>Email</span><input name="email" type="email" value="${escapeHtml(profile.email || "")}" /></label>
      <label class="field"><span>Color</span><input name="color" type="color" value="${escapeHtml(profile.color || "#0057a8")}" /></label>
      <label class="field full-field"><span>Address</span><input name="address" value="${escapeHtml(profile.address || "")}" /></label>
    </div>
    <div class="modal-actions contractor-detail-save">
      <button class="secondary-button" data-cancel-contractor-edit="${escapeHtml(profile.companyName)}" type="button">Cancel</button>
      <button class="primary-button" type="submit">Save Contractor</button>
    </div>
  </form>`;
}

function showContractorDetail(name, editMode = false) {
  setDetailsHidden(false);
  const profile = ensureContractorProfile(name);
  const summary = contractorSummary(name);
  const performance = contractorPerformance({ ...profile, ...summary });
  const supportContacts = profile.supportContacts || [];
  byId("detailContent").innerHTML = `
    ${detailHeader("contractor", profile.companyName, escapeHtml(profile.companyName), `${summary.opportunities} opportunities • ${summary.wins} wins`)}
    ${contactLinks(profile, "profile-contact-links")}
    ${
      editMode
        ? contractorProfileEditForm(profile)
        : `<div class="field-grid">
          ${editableField("contractor", profile.companyName, "companyName", "Company Name", profile.companyName)}
          ${editableField("contractor", profile.companyName, "poc", "Point of Contact", profile.poc)}
          ${editableField("contractor", profile.companyName, "title", "Title", profile.title)}
          ${editableField("contractor", profile.companyName, "phone", "Phone", formatPhoneNumber(profile.phone) || profile.phone)}
          ${editableField("contractor", profile.companyName, "email", "Email", profile.email)}
          <div class="field"><span>Color</span><strong><input type="color" data-contractor-color="${escapeHtml(profile.companyName)}" value="${escapeHtml(profile.color || "#0057a8")}" /></strong></div>
          ${editableField("contractor", profile.companyName, "address", "Address", profile.address)}
          ${field("Opportunities", summary.opportunities)}
          ${field("Wins", summary.wins)}
          ${field("Response Rate", `${performance.responseRate}%`)}
          ${field("Win Rate", `${performance.winRate}%`)}
          ${field("Performance Score", `${performance.score}/100`)}
          ${field("Last Opportunity Given", compactDate(summary.lastGiven))}
          ${field("Last Opportunity Won", compactDate(summary.lastWon))}
        </div>`
    }

    <section class="detail-section">
      <h4>Support Contacts</h4>
      <div class="stack-list">
        ${
          supportContacts.length
            ? supportContacts.map((contact, index) => supportContactCard(profile.companyName, contact, index)).join("")
            : `<p class="empty-state">No support contacts yet.</p>`
        }
      </div>
      <button class="secondary-button support-add-button" data-add-support-contact="${escapeHtml(profile.companyName)}" type="button">Add support contact</button>
    </section>

    ${contractorProposalRequestSection(profile.companyName, summary.proposals)}
    ${deleteButton("contractor", profile.companyName, "contractor")}
  `;
  byId("detailDrawer").classList.add("is-open");
}

function contractorProposalRequestSection(contractorName, proposals) {
  return `<section class="detail-section">
    <h4>Proposal Requests</h4>
    <div class="stack-list">
      ${
        proposals.length
          ? proposals
              .map(
                (proposal) => `<div class="stack-item">
                  <strong>${escapeHtml(proposal.project || proposal.client || "Proposal")}</strong>
                  <p>${escapeHtml([proposal.client, proposal.bidDueDate ? `Due ${compactDate(proposal.bidDueDate)}` : ""].filter(Boolean).join(" • "))}</p>
                  ${proposalRequestButton(proposal, contractorName)}
                </div>`
              )
              .join("")
          : `<p class="empty-state">No proposal opportunities tied to this contractor yet.</p>`
      }
    </div>
  </section>`;
}

function supportContactCard(companyName, contact, index) {
  const formattedPhone = formatPhoneNumber(contact.phone) || contact.phone || "";
  const phoneHref = contact.phone ? `tel:${String(contact.phone).replace(/[^0-9+]/g, "")}` : "";
  const emailHref = contact.email ? `mailto:${contact.email}` : "";
  return `<div class="support-contact-card">
    <button class="support-contact-main" type="button">
      <strong>${escapeHtml(contact.name || "Unnamed Contact")}</strong>
      <span>${escapeHtml([contact.title, contact.role].filter(Boolean).join(" • "))}</span>
      <small>${escapeHtml([formattedPhone, contact.email].filter(Boolean).join(" • "))}</small>
    </button>
    <div class="support-contact-actions">
      ${contact.phone ? `<a class="mini-button" href="${escapeHtml(phoneHref)}">Call</a>` : ""}
      ${contact.email ? `<a class="mini-button" href="${escapeHtml(emailHref)}">Email</a>` : ""}
      <button class="mini-button" data-remove-support="${index}" data-contractor-name="${escapeHtml(companyName)}" type="button">Remove</button>
    </div>
  </div>`;
}

function saveContractorProfile(oldName, form) {
  const profile = ensureContractorProfile(oldName);
  const oldKey = normalize(profile.companyName);
  profile.companyName = form.get("companyName") || profile.companyName;
  profile.poc = form.get("poc") || "";
  profile.title = form.get("title") || "";
  profile.phone = formatPhoneNumber(form.get("phone")) || "";
  profile.email = form.get("email") || "";
  profile.address = form.get("address") || "";
  profile.color = form.get("color") || profile.color || "#0057a8";

  if (normalize(profile.companyName) !== oldKey) {
    data.projects.forEach((project) => {
      const before = [project.biddingContractors, project.awardedContractor].join("|");
      project.biddingContractors = splitContractors(project.biddingContractors)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = profile.companyName;
      const after = [project.biddingContractors, project.awardedContractor].join("|");
      if (before !== after && !savedCrm.projects.some((item) => item.id === project.id)) {
        savedCrm.edits.projects[project.id] = {
          ...(savedCrm.edits.projects[project.id] || {}),
          biddingContractors: project.biddingContractors,
          awardedContractor: project.awardedContractor,
        };
      }
    });
    data.proposals.forEach((proposal) => {
      const before = [proposal.biddingContractors, proposal.bidsReceived, proposal.awardedContractor].join("|");
      proposal.biddingContractors = splitContractors(proposal.biddingContractors)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      proposal.bidsReceived = splitContractors(proposal.bidsReceived)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      if (normalize(proposal.awardedContractor) === oldKey) proposal.awardedContractor = profile.companyName;
      const after = [proposal.biddingContractors, proposal.bidsReceived, proposal.awardedContractor].join("|");
      if (before !== after) {
        proposalUpdates[proposal.id] = {
          ...(proposalUpdates[proposal.id] || {}),
          biddingContractors: proposal.biddingContractors,
          bidsReceived: proposal.bidsReceived,
          awardedContractor: proposal.awardedContractor,
        };
      }
    });
    savedCrm.proposals.forEach((proposal) => {
      proposal.biddingContractors = splitContractors(proposal.biddingContractors)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      proposal.bidsReceived = splitContractors(proposal.bidsReceived)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      if (normalize(proposal.awardedContractor) === oldKey) proposal.awardedContractor = profile.companyName;
    });
    savedCrm.projects.forEach((project) => {
      project.biddingContractors = splitContractors(project.biddingContractors)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = profile.companyName;
    });
    Object.values(savedCrm.edits.projects || {}).forEach((project) => {
      project.biddingContractors = splitContractors(project.biddingContractors)
        .map((contractor) => (normalize(contractor) === oldKey ? profile.companyName : contractor))
        .join(", ");
      if (normalize(project.awardedContractor) === oldKey) project.awardedContractor = profile.companyName;
    });
    localStorage.setItem("garlandProposalUpdates", JSON.stringify(proposalUpdates));
  }
  saveCrm();
  renderFilters();
  render();
  showContractorDetail(profile.companyName);
}

function updateContractorColor(name, color) {
  const profile = ensureContractorProfile(name);
  if (!profile) return;
  profile.color = color;
  saveCrm();
  renderContractors();
  render();
}

function addSupportContact(companyName, form) {
  const profile = ensureContractorProfile(companyName);
  profile.supportContacts = profile.supportContacts || [];
  profile.supportContacts.push({
    name: form.get("name") || "",
    role: form.get("role") || "Support",
    title: form.get("title") || "",
    phone: formatPhoneNumber(form.get("phone")) || "",
    email: form.get("email") || "",
  });
  saveCrm();
  renderContractors();
  showContractorDetail(profile.companyName);
}

function openSupportContactDialog(companyName) {
  byId("supportContactForm").reset();
  byId("supportContactContractor").value = companyName;
  openDialog("supportContactDialog");
}

function renderContractorChecklist() {
  const selected = new Set(state.selectedContractors);
  const contractors = contractorNames();
  byId("contractorChecklist").innerHTML = `${selectedContractorSummary([...selected])}${contractors
    .map(
      (name) => `<label class="check-tile">
        <input type="checkbox" name="biddingContractors" value="${escapeHtml(name)}" ${selected.has(name) ? "checked" : ""} />
        <span${contractorStyle(name)}>${escapeHtml(name)}</span>
      </label>`
    )
    .join("")}`;
  renderReceivedChecklist();
}

function renderReceivedChecklist(selectedReceived = []) {
  const received = new Set(selectedReceived);
  byId("receivedChecklist").innerHTML = state.selectedContractors.length
    ? `${selectedContractorSummary([...received])}${state.selectedContractors
        .map(
          (name) => `<label class="check-tile">
            <input type="checkbox" name="bidsReceived" value="${escapeHtml(name)}" ${received.has(name) ? "checked" : ""} />
            <span${contractorStyle(name)}>${escapeHtml(name)}</span>
          </label>`
        )
        .join("")}`
    : `<p class="empty-state">Select bidding contractors first.</p>`;
  fillSelect("awardedContractorInput", ["Not awarded yet", ...state.selectedContractors], "Not awarded yet");
}

function renderProjectContractorChecklist() {
  const selected = new Set(state.selectedProjectContractors);
  const body = byId("projectContractorPickerBody");
  byId("projectContractorChecklist").innerHTML = `${selectedContractorSummary([...selected])}${contractorNames()
    .map(
      (name) => `<label class="check-tile">
        <input type="checkbox" name="projectBiddingContractors" value="${escapeHtml(name)}" ${selected.has(name) ? "checked" : ""} />
        <span${contractorStyle(name)}>${escapeHtml(name)}</span>
      </label>`
    )
    .join("")}`;
  const toggle = byId("toggleProjectContractorsButton");
  if (toggle) {
    toggle.textContent = body && !body.hidden
      ? "Hide contractors"
      : selected.size
        ? `Show contractors (${selected.size} selected)`
        : "Show contractors";
  }
}

function currentProjectSystemCatalog() {
  const type = normalizeProjectTypeLabel(byId("projectTypeInput")?.value || defaultProjectType);
  return systemBuilderCatalog[type] || systemBuilderCatalog[defaultProjectType];
}

function currentProjectSystemMaterial() {
  const catalog = currentProjectSystemCatalog();
  return catalog.materials.find((item) => item.name === byId("systemMaterialInput")?.value) || catalog.materials[0];
}

function currentProjectSystem() {
  const material = currentProjectSystemMaterial();
  return material?.systems.find((item) => item.product === byId("systemProductInput")?.value) || material?.systems[0] || {};
}

function fillSystemSelect(id, values, value = "") {
  const options = (values && values.length ? values : ["Not applicable"]).map((item) => String(item));
  fillSelect(id, options, value && options.includes(value) ? value : options[0]);
  byId(id).disabled = options.length === 1 && options[0] === "Not applicable";
}

function setSystemFieldState(id, visible) {
  const field = byId(id);
  if (!field) return;
  field.hidden = !visible;
  field.classList.toggle("system-field-hidden", !visible);
}

function applySystemBuilderMode(projectType) {
  const isRestoration = normalizeProjectTypeLabel(projectType) === "Restoration";
  if (byId("systemMaterialLabel")) byId("systemMaterialLabel").textContent = isRestoration ? "Existing substrate" : "Existing / material type";
  if (byId("systemProductLabel")) byId("systemProductLabel").textContent = isRestoration ? "Fluid-applied product" : "System";
  ["systemCapSheetField", "systemCapAdhesiveField", "systemBaseSheetField", "systemBaseAdhesiveField", "systemSurfacingField"].forEach((id) => {
    setSystemFieldState(id, !isRestoration);
  });
}

function systemLogic(system, selected = {}) {
  const cap = normalize(selected.capSheet);
  const base = normalize(selected.baseSheet);
  const product = normalize(system.product);
  const material = normalize(selected.material);
  const logic = {
    capSheets: system.capSheets || [],
    capAdhesives: system.capAdhesives || [],
    baseSheets: system.baseSheets || [],
    baseAdhesives: system.baseAdhesives || [],
    surfacing: system.surfacing || [],
    warnings: [],
  };

  if (normalizeProjectTypeLabel(selected.projectType) === "Restoration") {
    logic.capSheets = [];
    logic.capAdhesives = [];
    logic.baseSheets = [];
    logic.baseAdhesives = [];
    logic.surfacing = [];
    logic.warnings.push("Restoration flow uses the selected fluid-applied product, primer, reinforcement/coverage notes, and substrate-specific prep. Cap sheet, base sheet, and surfacing fields are intentionally hidden.");
    return logic;
  }

  if (cap.includes("stressply iv plus") || product.includes("stressply iv")) {
    logic.capAdhesives = ["Torch Applied"];
    logic.baseSheets = ["HPR Torchbase", "Ultra-Shield Torchbase", "SA Base IV"];
    logic.baseAdhesives = base.includes("sa base iv") ? ["Self-Adhered"] : ["Torch Applied"];
    logic.warnings.push("StressPly IV Plus is a torch-applied membrane. Use torch-applied adhesive logic with a compatible torch base.");
  }

  if (cap.includes("stressply sa") || cap.includes("versiply") || product.includes("self-adhering")) {
    logic.capAdhesives = ["Self-Adhered"];
    logic.baseSheets = ["HPR SA FR Base Sheet"];
    logic.baseAdhesives = ["Self-Adhered"];
    logic.warnings.push("Self-adhered assemblies use self-adhered cap/base logic in this builder.");
  }

  if (base.includes("torchbase") || base.includes("ultra-shield torch")) {
    logic.baseAdhesives = ["Torch Applied"];
    if (!logic.warnings.some((item) => item.includes("torch base"))) {
      logic.warnings.push("Selected torch base sheet locks the base adhesive to Torch Applied.");
    }
  }

  if (base.includes("sa base") || base.includes("sa fr")) {
    logic.baseAdhesives = ["Self-Adhered"];
    logic.warnings.push("Selected self-adhered base sheet locks the base adhesive to Self-Adhered.");
  }

  if (cap.includes("kee stone") || product.includes("kee stone")) {
    logic.capAdhesives = logic.capAdhesives.filter((item) => normalize(item).includes("kee lock") || normalize(item).includes("hot asphalt"));
    if (!logic.capAdhesives.length) logic.capAdhesives = ["KEE-Lock Foam", "KEE-Lock Spatter Spray"];
    logic.surfacing = ["No surfacing"];
    logic.warnings.push("KEE-Stone assemblies use KEE-Lock adhesive options and no surfacing.");
  }

  if (normalize(selected.warrantyType).includes("premium ndl")) {
    logic.warnings.push("Premium NDL requires Garland surfacing/edge-metal requirements and higher inspection frequency per warranty chart.");
  }

  if (product.includes("bur") || material.includes("gravel surface")) {
    logic.warnings.push("BUR/gravel assemblies should keep flood coat and aggregate requirements in the specification roll-up.");
  }

  if (normalize(selected.projectType).includes("recover")) {
    logic.warnings.push("Recover work should include structural review, moisture scan/infrared scan, and attachment verification before final system selection.");
  }

  return logic;
}

function productCoverageLines(system, selections) {
  const lines = [];
  const add = (label, value, coverage = "") => {
    if (!value || value === "Not applicable") return;
    const mappedCoverage = productCoverageRate(value, coverage);
    const milNote = productMilNote(value);
    lines.push(`- ${label}: ${value}${mappedCoverage && mappedCoverage !== "-" ? ` | ${mappedCoverage}` : ""}${milNote ? ` | ${milNote}` : ""}`);
  };
  const isRestoration = normalizeProjectTypeLabel(selections.projectType) === "Restoration";
  add(isRestoration ? "Fluid-applied product" : "System", selections.product, system.description || "");
  add("Primer", selections.primer, "as listed in chart");
  if (!isRestoration) {
    add("Cap sheet", selections.capSheet, productSizeNote(selections.capSheet));
    add("Cap sheet adhesive", selections.capAdhesive, coverageNote(selections.capAdhesive));
    add("Base sheet", selections.baseSheet, productSizeNote(selections.baseSheet));
    add("Base sheet adhesive", selections.baseAdhesive, coverageNote(selections.baseAdhesive));
    add("Surfacing", selections.surfacing, coverageNote(selections.surfacing));
  }
  add("Contractor warranty", selections.contractorWarranty, "");
  return lines;
}

function productSizeNote(product) {
  const value = normalize(product);
  if (!value || value === "not applicable") return "";
  if (value.includes("stressply iv plus")) return "torch-applied SBS membrane, 180-195 mil; verify roll size on submittal";
  if (value.includes("ultra-shield torch")) return "nominal 110 mil SBS torch-applied base membrane; verify roll size on submittal";
  if (value.includes("stressply") || value.includes("optimax") || value.includes("kee stone") || value.includes("flexbase") || value.includes("stressbase") || value.includes("torchbase")) {
    return "roll good; verify roll size/quantity on product data and takeoff";
  }
  if (value.includes("fabric")) return "fabric reinforcement; size by field/base coat requirements";
  return "";
}

function coverageNote(product) {
  const value = normalize(product);
  if (!value || value === "not applicable") return "";
  const mapped = mappedProductData(product);
  if (mapped?.coverage) return [mapped.coverage, mapped.wetMil || mapped.dryMil || "", mapped.note || ""].filter(Boolean).join(" | ");
  if (value.includes("black knight cold")) return "restoration/flood coat ranges commonly 6.0-8.0 gal./sq. where listed";
  if (value.includes("weatherscreen")) return "restoration gravel systems commonly 6.0-8.0 gal./sq. where listed";
  if (value.includes("cool sil eliminator")) return "Cool-Sil Eliminator 8.0 gal./sq.; Cool-Sil 2.0 gal./sq. where listed";
  if (value.includes("cool sil") || value.includes("white knight") || value.includes("liquitec")) return "coating rates depend on substrate/reinforcement; see system notes";
  if (value.includes("torch")) return "torch applied; coverage/roll count by membrane takeoff";
  if (value.includes("green lock")) return "Green-Lock Plus Membrane Adhesive: IP 2-2.5 gal./sq.; FC 4-5 gal./sq.";
  if (value.includes("hpr all temp asphalt")) return "HPR All-Temp Asphalt: IP 25 lb./sq.; FC 60 lb./sq.";
  if (value.includes("generic hot asphalt")) return "Generic hot asphalt selected; no hot asphalt quantity predicted.";
  if (value.includes("weatherking") || value.includes("garlastic")) return "adhesive coverage to be confirmed by current product data/submittal";
  if (value.includes("kee lock")) return "foam/spatter spray pattern per KEE application guide";
  if (value.includes("hot asphalt")) return "hot-applied; coverage by specification";
  if (value.includes("r mer")) return "metal system component; size/panel layout by shop drawings and takeoff";
  return "";
}

function primerForSystem(system, material) {
  const primer = system?.primer || "Not applicable";
  const substrate = normalize(material);
  if ((substrate === "single ply" || substrate === "metal") && normalize(primer).includes("garla block")) {
    return "Not required";
  }
  return primer;
}

function productReferencesFor(value) {
  const normalized = normalize(value);
  if (!normalized || normalized === "not applicable") return [];
  const refs = productReferenceLinks.filter((item) => normalized.includes(normalize(item.match)));
  if (refs.length < 2) return refs;
  const broadMatches = new Set(["stressply", "stressbase 80", "garla-block", "garla block", "revitalizer"]);
  return refs.filter((ref) => {
    const match = normalize(ref.match);
    if (!broadMatches.has(match)) return true;
    return !refs.some((other) => {
      const otherMatch = normalize(other.match);
      return other !== ref && otherMatch.includes(match) && otherMatch !== match;
    });
  });
}

function productReferenceFor(value) {
  return productReferencesFor(value)[0] || null;
}

function productReferenceLines(selections) {
  const seen = new Set();
  return [
    selections.product,
    selections.capSheet,
    selections.capAdhesive,
    selections.baseSheet,
    selections.baseAdhesive,
    selections.surfacing,
    selections.primer,
    selections.description,
  ]
    .flatMap(productReferencesFor)
    .filter((ref) => {
      if (seen.has(ref.url)) return false;
      seen.add(ref.url);
      return true;
    })
    .map((ref) => `- ${ref.label}: ${ref.url}`);
}

function warrantyRequirementLines(warrantyType, contractorWarranty, material, product) {
  const materialType = normalize(material);
  const productType = normalize(product);
  if (materialType.includes("metal systems") || productType.includes("r mer")) {
    const lines = [
      "- Metal systems: follow the metal warranty matrix for panel, underlayment, shop drawings, seamer rental, and slope limitations.",
      "- Garland Select 40-year NDL: R-Mer Shield with R-Mer Seal; shop drawings required; seamer rental required; 2:12 minimum slope.",
      "- Garland Preferred 30-year NDL: R-Mer Shield with R-Mer Seal, non-Garland underlayment, or open framing; shop drawings required; seamer rental required; 1/4:12 minimum slope.",
      "- 30-year Limited R-Mer Loc: R-Mer Seal, non-Garland underlayment, or open framing; shop drawings required; seamer rental required; 3:12 minimum slope.",
      "- 20-year Limited R-Mer Loc: R-Mer Seal or non-Garland underlayment; shop drawings required; seamer rental required; 1-1/2:12 to 3:12 slope.",
      "- 10-year Limited R-Mer Wall-Pan: R-Mer Seal or Intelliwrap underlayment; shop drawings not required per chart; seamer rental required; slope not applicable.",
      "- Metal finish warranty: 30-year limited paint finish for fluorocarbon standing seam, edge metal, and wall panels; silicone modified polyester for R-Mer Lite products.",
      "- Material-only warranties: 10-year limited R-Mer Seal for metal and shingle applications; 10-year limited Terra-Seal for clay/concrete tile applications; 20-year limited coatings materials; 5-year restoration materials.",
    ];
    if (productType.includes("garland select")) return lines.filter((line) => line.includes("Metal systems") || line.includes("Garland Select") || line.includes("Metal finish"));
    if (productType.includes("garland preferred")) return lines.filter((line) => line.includes("Metal systems") || line.includes("Garland Preferred") || line.includes("Metal finish"));
    if (productType.includes("30 year") || productType.includes("30-year")) return lines.filter((line) => line.includes("Metal systems") || line.includes("30-year Limited") || line.includes("Metal finish"));
    if (productType.includes("20 year") || productType.includes("20-year")) return lines.filter((line) => line.includes("Metal systems") || line.includes("20-year Limited") || line.includes("Metal finish"));
    if (productType.includes("wall pan")) return lines.filter((line) => line.includes("Metal systems") || line.includes("Wall-Pan") || line.includes("Metal finish"));
    return lines;
  }
  const warranty = normalize(warrantyType);
  const contractor = normalize(contractorWarranty);
  if (warranty.includes("premium ndl")) {
    const lines = [
      "- Premium NDL: NDL on material and labor; length 20-40 years.",
      "- Drainage: 1/4:12 verified; 1/8:12 allowed with Black-Knight Cold or WPG Coal Tar Pitch flood coat and gravel.",
      "- Inspections: every other working day inspection reports in RAMP.",
      "- Edge metal: Garland pre-manufactured edge metal only; Edge-to-Edge is standard in the warranty.",
      "- Surfacing: Garland flood coat and gravel, mineral surfaced cap sheet with Garland coating, or KEE-Stone.",
      "- Contractor warranty: minimum 4-year with Garland rep inspection prior to expiration.",
      "- Exception: 20-year Premium NDL maximum if ANSI/SPRI ES-1 compliant edge metal formed with Garland flat stock is used and/or a 2-year contractor warranty is issued; all other requirements remain.",
      "- Exception: 20-year Premium NDL maximum if no Garland surface coating is applied to the granulated cap sheet; all other requirements remain.",
      "- Exception: 30-year Premium NDL maximum if a 3-year contractor warranty is issued with Garland rep inspection prior to expiration; all other requirements remain.",
    ];
    if (contractor.includes("2 year") || contractor.includes("2-year")) lines.push("- Selected contractor warranty triggers the 20-year Premium NDL maximum exception.");
    if (contractor.includes("3 year") || contractor.includes("3-year")) lines.push("- Selected contractor warranty triggers the 30-year Premium NDL maximum exception.");
    return lines;
  }
  if (warranty.includes("system ndl")) {
    return [
      "- System NDL: NDL on Garland material; labor limited to original project non-Garland spend; length 20-30 years.",
      "- Drainage: 1/4:12 verified; 1/8:12 allowed with Black-Knight Cold or WPG Coal Tar Pitch flood coat and gravel.",
      "- Inspections: weekly inspection reports in RAMP.",
      "- Edge metal: Garland pre-manufactured, Garland flat stock, or IMETCO pre-manufactured edge metal; must be ANSI/SPRI ES-1 compliant.",
      "- Contractor warranty: minimum 3-year with Garland rep inspection prior to expiration.",
      "- Edge-to-Edge exception: available if Garland pre-manufactured or IMETCO pre-manufactured edge metal is used.",
    ];
  }
  if (warranty.includes("standard")) {
    return [
      "- Garland Standard: limited to original Garland material spend; length 20-30 years.",
      "- Drainage: positive drainage per IBC.",
      "- Inspections: typical inspections per sales policy manual.",
      "- Edge metal: ANSI/SPRI ES-1 compliant edge metal.",
      "- Contractor warranty: minimum 2-year.",
      "- Edge-to-Edge option: not available; no exceptions listed.",
    ];
  }
  return ["- Restoration/limited warranty: follow the restoration warranty chart for substrate, primer, reinforcement, and coverage rate."];
}

function systemRollupNotes(system, logic) {
  const selections = {
    warrantyType: byId("systemWarrantyTypeInput")?.value || "",
    material: byId("systemMaterialInput")?.value || "",
    product: byId("systemProductInput")?.value || "",
    projectType: byId("projectTypeInput")?.value || "",
    term: byId("systemWarrantyTermInput")?.value || "",
    capSheet: byId("systemCapSheetInput")?.value || "",
    capAdhesive: byId("systemCapAdhesiveInput")?.value || "",
    baseSheet: byId("systemBaseSheetInput")?.value || "",
    baseAdhesive: byId("systemBaseAdhesiveInput")?.value || "",
    surfacing: byId("systemSurfacingInput")?.value || "",
    primer: byId("systemPrimerInput")?.value || "",
    contractorWarranty: byId("contractorWarrantyInput")?.value || "",
    description: system.description || "",
  };
  const references = productReferenceLines(selections);
  return [
    `Warranty: ${selections.warrantyType || "Not selected"}${selections.term ? ` | ${selections.term}` : ""}`,
    `Material/System Type: ${selections.material || "Not selected"}`,
    "",
    "Product roll-up:",
    ...productCoverageLines(system, selections),
    "",
    "Coverage / requirements:",
    system.description ? `- ${system.description}` : "- Verify coverage rates against current Garland product data and final specification.",
    ...standardCoverageSpecLanguage.split("\n").map((line) => `- ${line}`),
    ...(logic.warnings || []).map((item) => `- ${item}`),
    "- Final coverage rates, sizes, and attachment patterns should be verified against the current Garland product data, warranty chart, and project specification.",
    "",
    "Warranty requirements / exceptions:",
    ...warrantyRequirementLines(selections.warrantyType, selections.contractorWarranty, selections.material, selections.product),
    "",
    "Product reference links:",
    ...(references.length ? references : ["- No direct product link mapped yet; verify against current Garland product data."]),
  ].join("\n");
}

function contractorWarrantyChoices(warrantyType) {
  const value = normalize(warrantyType);
  if (value.includes("premium ndl")) return ["Not selected", "4-year contractor warranty", "5-year contractor warranty"];
  if (value.includes("system ndl")) return ["Not selected", "3-year contractor warranty", "4-year contractor warranty", "5-year contractor warranty"];
  if (value.includes("standard")) return ["Not selected", "2-year contractor warranty", "3-year contractor warranty", "4-year contractor warranty", "5-year contractor warranty"];
  return contractorWarrantyOptions;
}

function renderSystemBuilder() {
  if (!byId("projectTypeInput")) return;
  const catalog = currentProjectSystemCatalog();
  const selectedProjectType = normalizeProjectTypeLabel(byId("projectTypeInput").value || defaultProjectType);
  applySystemBuilderMode(selectedProjectType);
  const previousMaterial = byId("systemMaterialInput")?.value || "";
  const previousProduct = byId("systemProductInput")?.value || "";
  const previousCapSheet = byId("systemCapSheetInput")?.value || "";
  const previousCapAdhesive = byId("systemCapAdhesiveInput")?.value || "";
  const previousBaseSheet = byId("systemBaseSheetInput")?.value || "";
  const previousBaseAdhesive = byId("systemBaseAdhesiveInput")?.value || "";
  const previousSurfacing = byId("systemSurfacingInput")?.value || "";
  fillSelect("projectTypeInput", projectTypes, selectedProjectType);
  fillSystemSelect("systemWarrantyTypeInput", catalog.warrantyTypes, byId("systemWarrantyTypeInput")?.value || "");
  fillSystemSelect("systemMaterialInput", catalog.materials.map((item) => item.name), previousMaterial);
  const material = currentProjectSystemMaterial();
  fillSystemSelect("systemProductInput", material.systems.map((item) => item.product), previousProduct);
  const system = currentProjectSystem();
  const preliminary = systemLogic(system, {
    projectType: selectedProjectType,
    material: byId("systemMaterialInput")?.value || "",
    capSheet: previousCapSheet,
    baseSheet: previousBaseSheet,
    warrantyType: byId("systemWarrantyTypeInput")?.value || "",
  });
  fillSystemSelect("systemWarrantyTermInput", system.terms?.map((term) => `${term}-year`) || [], byId("systemWarrantyTermInput")?.value || "");
  fillSystemSelect("systemCapSheetInput", expandProductChoices(preliminary.capSheets), previousCapSheet);
  const logic = systemLogic(system, {
    projectType: selectedProjectType,
    material: byId("systemMaterialInput")?.value || "",
    capSheet: byId("systemCapSheetInput")?.value || "",
    baseSheet: byId("systemBaseSheetInput")?.value || previousBaseSheet,
    warrantyType: byId("systemWarrantyTypeInput")?.value || "",
  });
  fillSystemSelect("systemCapAdhesiveInput", expandProductChoices(logic.capAdhesives), previousCapAdhesive);
  fillSystemSelect("systemBaseSheetInput", expandProductChoices(logic.baseSheets), previousBaseSheet);
  const finalLogic = systemLogic(system, {
    projectType: selectedProjectType,
    material: byId("systemMaterialInput")?.value || "",
    capSheet: byId("systemCapSheetInput")?.value || "",
    baseSheet: byId("systemBaseSheetInput")?.value || "",
    warrantyType: byId("systemWarrantyTypeInput")?.value || "",
  });
  fillSystemSelect("systemBaseAdhesiveInput", expandProductChoices(finalLogic.baseAdhesives), previousBaseAdhesive);
  fillSystemSelect("systemSurfacingInput", logic.surfacing, previousSurfacing);
  fillSelect("contractorWarrantyInput", contractorWarrantyChoices(byId("systemWarrantyTypeInput")?.value || ""), byId("contractorWarrantyInput")?.value || "Not selected");
  byId("systemPrimerInput").value = primerForSystem(system, byId("systemMaterialInput")?.value || "");
  byId("systemNotesInput").value = systemRollupNotes(system, finalLogic);
}

function addContractor(name) {
  const cleaned = String(name || "").trim();
  if (!cleaned) return;
  if (shouldStopForDuplicate("contractor", cleaned, contractorNames())) return;
  ensureContractorProfile(cleaned);
  if (!state.selectedContractors.includes(cleaned)) state.selectedContractors.push(cleaned);
  byId("newContractorName").value = "";
  renderContractorChecklist();
}

function addProjectContractor(name) {
  const cleaned = String(name || "").trim();
  if (!cleaned) return;
  if (shouldStopForDuplicate("contractor", cleaned, contractorNames())) return;
  ensureContractorProfile(cleaned);
  if (!state.selectedProjectContractors.includes(cleaned)) state.selectedProjectContractors.push(cleaned);
  byId("newProjectContractorName").value = "";
  renderProjectContractorChecklist();
}

function updateNewClientVisibility() {
  const client = byId("proposalClientSearch").value.trim();
  const form = byId("proposalForm");
  const account = findAccountByName(client);
  const status = byId("clientInfoStatus");

  byId("newClientFields").hidden = false;

  if (!client) {
    status.textContent = "Select a client to populate account details, or type a new one.";
    clearAccountFields(form);
    return;
  }

  if (!account) {
    status.textContent = "Client not found. Add the account details here.";
    clearAccountFields(form);
    return;
  }

  status.textContent = "Existing client found. Account details are filled below and can be edited.";
  form.elements.entity.value = account.entity || "";
  form.elements.county.value = account.county || "";
  form.elements.clientRanking.value = account.clientRanking || "Prospecting";
  form.elements.address.value = account.address || "";
  form.elements.poc.value = account.poc || "";
  form.elements.title.value = account.title || "";
  form.elements.phone.value = formatPhoneNumber(account.phone) || "";
  form.elements.email.value = account.email || "";
}

function clearAccountFields(form) {
  ["entity", "county", "address", "poc", "title", "phone", "email"].forEach((name) => {
    form.elements[name].value = "";
  });
  form.elements.clientRanking.value = "Prospecting";
}

function applyAccountValuesToForm(form, account, names) {
  names.forEach((name) => {
    if (form.elements[name]) form.elements[name].value = account?.[name] || "";
  });
}

function accountBackfillPayload(form, names) {
  return names.reduce((payload, name) => {
    payload[name] = form.get(name) || "";
    return payload;
  }, {});
}

function backfillAccountFromWork(client, values = {}) {
  const cleanedClient = String(client || "").trim();
  if (!cleanedClient) return null;
  let account = findAccountByName(cleanedClient);
  if (!account) {
    account = {
      id: `local-account-${Date.now()}`,
      sourceRow: "Local",
      clientRanking: values.clientRanking || "Prospecting",
      entity: values.entity || "",
      county: values.county || "",
      action: "N/A",
      client: cleanedClient,
      address: values.address || "",
      poc: values.poc || "",
      title: values.title || "",
      phone: formatPhoneNumber(values.phone) || "",
      email: values.email || "",
      nextFollowUp: values.nextFollowUp || "",
      nextStep: "",
      activity: new Date().toISOString(),
    };
    savedCrm.accounts.push(account);
    data.accounts.push(account);
    saveCrm();
    return account;
  }
  Object.entries(values).forEach(([key, value]) => {
    if (key === "client" || !normalize(value) || normalize(account[key])) return;
    persistRecordEdit("account", account.id, key, value, false);
    account[key] = value;
  });
  return account;
}

function resetProposalForm() {
  byId("proposalForm").reset();
  byId("proposalDueDate").value = toDateInput(addDays(today, 7));
  byId("proposalStageInput").value = "Working on Ramp & SOW";
  state.selectedContractors = [];
  byId("newClientFields").hidden = false;
  byId("clientInfoStatus").textContent = "Select a client to populate account details, or type a new one.";
  renderContractorChecklist();
}

function resetProjectForm() {
  byId("projectForm").reset();
  byId("projectScoreInput").value = "C (25%)";
  byId("projectStageInput").value = "Prospecting";
  byId("projectStartYearInput").value = String(today.getFullYear());
  byId("projectAddressInput").readOnly = true;
  byId("projectCommissionInput").value = "";
  byId("projectWiseTrophyInput").value = "";
  byId("projectTypeInput").value = defaultProjectType;
  byId("projectClientInfoStatus").textContent = "Select a client to populate account contact details, or use these fields to fill missing account information.";
  state.selectedProjectContractors = [];
  byId("projectContractorPickerBody").hidden = true;
  byId("toggleProjectContractorsButton").textContent = "Show contractors";
  renderSystemBuilder();
  renderProjectContractorChecklist();
}

function updateProjectClientAddress() {
  const account = findAccountByName(byId("projectClientSearch").value.trim());
  const form = byId("projectForm");
  const address = byId("projectAddressInput");
  if (account?.address && address.readOnly !== false) address.value = account.address;
  applyAccountValuesToForm(form, account, ["poc", "title", "phone", "email"]);
  byId("projectClientInfoStatus").textContent = account
    ? "Existing client found. Blank account contact fields can be filled from this project."
    : "Client not found. Add account contact details here if you want GRIP to create the account.";
}

function handleProjectMaterialsInput() {
  const materials = Number(byId("projectMaterialsInput").value || 0);
  if (!Number.isNaN(materials)) {
    const commission = materials * 0.25;
    byId("projectCommissionInput").value = commission.toFixed(2);
    byId("projectWiseTrophyInput").value = (commission * 4).toFixed(2);
  }
}

function handleProjectCommissionInput() {
  const commission = Number(byId("projectCommissionInput").value || 0);
  if (!Number.isNaN(commission)) byId("projectWiseTrophyInput").value = (commission * 4).toFixed(2);
}

function missingRequiredFields(fields) {
  return fields.filter((field) => !normalize(field.value)).map((field) => field.label);
}

function stopForMissingFields(recordType, fields) {
  const missing = missingRequiredFields(fields);
  if (!missing.length) return false;
  alert(`Please fill in these required ${recordType} fields before saving:\n\n${missing.join("\n")}`);
  return true;
}

function similarityScore(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;
  const leftParts = new Set(left.split(/\s+/).filter((part) => part.length > 2));
  const rightParts = right.split(/\s+/).filter((part) => part.length > 2);
  if (!leftParts.size || !rightParts.length) return 0;
  const shared = rightParts.filter((part) => leftParts.has(part)).length;
  return shared / Math.max(leftParts.size, rightParts.length);
}

function closestDuplicateName(name, candidates, ignored = []) {
  const ignoredSet = new Set(ignored.map(normalize));
  return candidates
    .filter((candidate) => candidate && !ignoredSet.has(normalize(candidate)))
    .map((candidate) => ({ candidate, score: similarityScore(name, candidate) }))
    .filter((item) => item.score >= 0.72)
    .sort((a, b) => b.score - a.score || compareText(a.candidate, b.candidate))[0]?.candidate || "";
}

function shouldStopForDuplicate(type, name, candidates, ignored = []) {
  const match = closestDuplicateName(name, candidates, ignored);
  if (!match) return false;
  return !confirm(`This ${type} looks similar to an existing ${type}:\n\n${match}\n\nContinue creating "${name}" anyway?`);
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (
    stopForMissingFields("project", [
      { label: "Client", value: form.get("client") },
      { label: "ABC Score", value: form.get("abcList") },
      { label: "Project Name", value: form.get("projectName") },
      { label: "Project Address", value: form.get("address") },
      { label: "Project Stage", value: form.get("stage") },
      { label: "Project Type", value: form.get("projectType") },
    ])
  ) {
    return;
  }
  if (
    shouldStopForDuplicate(
      "project",
      form.get("projectName"),
      cleanProjects().map((project) => project.projectName || project.client)
    )
  ) {
    return;
  }
  backfillAccountFromWork(form.get("client"), {
    address: form.get("address") || "",
    ...accountBackfillPayload(form, ["poc", "title", "phone", "email"]),
  });
  const project = {
    id: `local-project-${Date.now()}`,
    sourceRow: "Local",
    abcList: form.get("abcList") || "C (25%)",
    stage: form.get("stage") || "Prospecting",
    projectType: normalizeProjectTypeLabel(form.get("projectType") || defaultProjectType),
    client: form.get("client") || "",
    projectName: form.get("projectName") || "",
    address: form.get("address") || "",
    anticipatedStartDate: `${form.get("startQuarter")} ${form.get("startYear")}`,
    nextFollowUp: form.get("nextFollowUp") || "",
    biddingContractors: state.selectedProjectContractors.join(", "),
    materials: Number(form.get("materials") || 0),
    squareFeet: Number(form.get("squareFeet") || 0),
    projectCommission: Number(form.get("commission") || 0),
    wiseTrophy: Number(form.get("wiseTrophy") || 0),
    systemWarrantyType: form.get("systemWarrantyType") || "",
    systemMaterial: form.get("systemMaterial") || "",
    systemProduct: form.get("systemProduct") || "",
    systemWarrantyTerm: form.get("systemWarrantyTerm") || "",
    systemCapSheet: form.get("systemCapSheet") || "",
    systemCapAdhesive: form.get("systemCapAdhesive") || "",
    systemBaseSheet: form.get("systemBaseSheet") || "",
    systemBaseAdhesive: form.get("systemBaseAdhesive") || "",
    systemSurfacing: form.get("systemSurfacing") || "",
    systemPrimer: form.get("systemPrimer") || "",
    contractorWarranty: form.get("contractorWarranty") || "",
    systemNotes: form.get("systemNotes") || "",
    takeoffEstimateIds: [],
  };
  savedCrm.projects.push(project);
  data.projects.push(project);
  saveCrm();
  promptFollowUpActivity("project", project, "", project.nextFollowUp);
  renderFilters();
  render();
  byId("projectDialog").close();
  resetProjectForm();
  setView("projects");
  showDetail("project", project.id);
}

function handleProposalSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const client = String(form.get("client") || "").trim();
  if (
    stopForMissingFields("proposal", [
      { label: "Client", value: client },
      { label: "Project Name", value: form.get("project") },
      { label: "Due Date", value: form.get("bidDueDate") },
      { label: "Stage", value: form.get("stage") },
      { label: "Entity", value: form.get("entity") },
      { label: "County", value: form.get("county") },
    ])
  ) {
    return;
  }
  backfillAccountFromWork(client, {
    clientRanking: form.get("clientRanking") || "Prospecting",
    entity: form.get("entity") || "",
    county: form.get("county") || "",
    address: form.get("address") || "",
    nextFollowUp: form.get("nextFollowUp") || "",
    ...accountBackfillPayload(form, ["poc", "title", "phone", "email"]),
  });

  const bidsReceived = [...event.currentTarget.querySelectorAll('input[name="bidsReceived"]:checked')].map((input) => input.value);
  const awarded = form.get("awardedContractor") === "Not awarded yet" ? "" : form.get("awardedContractor");
  const proposal = {
    id: `local-proposal-${Date.now()}`,
    sourceRow: "Local",
    client,
    project: form.get("project") || "",
    bidDueDate: form.get("bidDueDate") || "",
    nextFollowUp: form.get("nextFollowUp") || "",
    stage: form.get("stage") || "Working on Ramp & SOW",
    notes: "",
    biddingContractors: state.selectedContractors.join(", "),
    bidsReceived: bidsReceived.join(", "),
    awardedContractor: awarded || "",
    materials: Number(form.get("materials") || 250),
  };
  savedCrm.proposals.push(proposal);
  data.proposals.push(proposal);
  saveCrm();
  promptFollowUpActivity("proposal", proposal, "", proposal.nextFollowUp);
  renderFilters();
  render();
  byId("proposalDialog").close();
  resetProposalForm();
  setView("proposals");
  showDetail("proposal", proposal.id);
}

function proposalTrackingControls(record) {
  if (!record || !("project" in record)) return "";
  const allContractors = contractorNames();
  const bidding = [...new Set([...splitContractors(record.biddingContractors), record.awardedContractor].filter(Boolean))];
  const biddingOptions = [...new Set([...allContractors, ...bidding])].sort((a, b) => a.localeCompare(b));
  const received = new Set(splitContractors(record.bidsReceived).filter((contractor) => bidding.includes(contractor)));
  const awardedList = [...received];
  if (record.awardedContractor && !awardedList.includes(record.awardedContractor)) awardedList.push(record.awardedContractor);
  const awardedOptions = ["Not awarded yet", ...awardedList].map((contractor) => {
    const selected = (record.awardedContractor || "Not awarded yet") === contractor ? "selected" : "";
    return `<option ${selected}>${escapeHtml(contractor)}</option>`;
  });
  return `<section class="detail-section">
    <h4>Contractor Tracking</h4>
    <div class="proposal-tracker" data-proposal-tracker="${record.id}">
      <div class="proposal-contractor-menus">
        <div>
          <span>Bidding Contractors</span>
          ${selectedContractorSummary(bidding)}
          <div class="contractor-option-list">
            ${biddingOptions.map((contractor) => `<label><input type="checkbox" data-bidding-contractor="${escapeHtml(contractor)}" ${bidding.includes(contractor) ? "checked" : ""} /> <span${contractorStyle(contractor)}>${escapeHtml(contractor)}</span></label>`).join("")}
          </div>
        </div>
        <div>
          <span>Bids Received</span>
          ${selectedContractorSummary([...received])}
          <div class="contractor-option-list">
            ${
              bidding.length
                ? bidding.map((contractor) => `<label><input type="checkbox" data-received-contractor="${escapeHtml(contractor)}" ${received.has(contractor) ? "checked" : ""} /> <span${contractorStyle(contractor)}>${escapeHtml(contractor)}</span></label>`).join("")
                : `<p class="empty-state">Select bidding contractors first.</p>`
            }
          </div>
        </div>
        <label>
          <span>Awarded Contractor</span>
          <select data-awarded-select="${record.id}">${awardedOptions.join("")}</select>
        </label>
      </div>
      <div class="proposal-request-list">
        <h5>Request Proposals</h5>
        ${
          bidding.length
            ? bidding
                .map(
                  (contractor) => `<div class="tracker-row">
                    <strong><span class="pill"${contractorStyle(contractor)}>${escapeHtml(contractor)}</span></strong>
                    ${proposalRequestButton(record, contractor)}
                  </div>`
                )
                .join("")
            : `<p class="empty-state">Select bidding contractors first.</p>`
        }
      </div>
      ${
        received.size
          ? [...received]
              .map(
                (contractor) => `<div class="tracker-row">
                  <strong><span class="pill"${contractorStyle(contractor)}>${escapeHtml(contractor)}</span></strong>
                  ${contractorProposalUploadBox(record.id, contractor)}
                </div>`
              )
              .join("")
          : `<p class="empty-state">Choose contractors under Bids Received to upload their proposals.</p>`
      }
    </div>
  </section>`;
}

function countOutreachDue() {
  try {
    const o = JSON.parse(localStorage.getItem("garlandOutreach") || "{}");
    const today = new Date().toISOString().slice(0, 10);
    const active = (o.campaigns || []).find(c => c.status === "active");
    if (!active) return 0;
    return (o.contacts || []).filter(c => {
      if (c.campaignId !== active.id || c.doNotContact || c.status === "Unsubscribed") return false;
      const f = c.followUp || {};
      return (f.day3Due  && f.day3Due  <= today && !f.day3Sent)  ||
             (f.day7Due  && f.day7Due  <= today && !f.day7Sent)  ||
             (f.day14Due && f.day14Due <= today && !f.day14Sent);
    }).length;
  } catch (_) { return 0; }
}

function renderNavBadges() {
  const overdue = followUpQueueRecords().filter((item) => ["overdue", "today"].includes(item.urgency)).length;
  document.querySelectorAll('[data-view="followUpQueue"]').forEach((btn) => {
    btn.querySelectorAll(".nav-due-badge").forEach((b) => b.remove());
    if (overdue > 0) btn.insertAdjacentHTML("beforeend", `<span class="nav-due-badge">${overdue}</span>`);
  });
  const outreachDue = countOutreachDue();
  document.querySelectorAll('[data-view="outreach"]').forEach((btn) => {
    btn.querySelectorAll(".nav-due-badge").forEach((b) => b.remove());
    if (outreachDue > 0) btn.insertAdjacentHTML("beforeend", `<span class="nav-due-badge">${outreachDue}</span>`);
  });
}

// ── Global search overlay ─────────────────────────────────────────

function closeGlobalSearch() {
  const el = byId("globalSearchResults");
  if (el) el.hidden = true;
}

function renderGlobalSearch(query) {
  const el = byId("globalSearchResults");
  if (!el) return;
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) { el.hidden = true; return; }

  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hit = s => String(s || "").toLowerCase().includes(q);

  // Accounts
  const acctHits = cleanAccounts().filter(a =>
    hit(a.client) || hit(a.poc) || hit(a.county) || hit(a.entity) || hit(a.sharedRep)
  ).slice(0, 6);

  // Pipeline deals
  let dealHits = [];
  try {
    const deals = JSON.parse(localStorage.getItem("garlandPipeline") || "[]");
    dealHits = deals.filter(d => hit(d.title) || hit(d.accountName) || hit(d.county)).slice(0, 4);
  } catch (_) {}

  // Outreach prospects
  let prospectHits = [];
  try {
    const o = JSON.parse(localStorage.getItem("garlandOutreach") || "{}");
    prospectHits = (o.contacts || []).filter(c =>
      hit(c.firstName) || hit(c.lastName) || hit(c.company) || hit(c.email)
    ).slice(0, 4);
  } catch (_) {}

  if (!acctHits.length && !dealHits.length && !prospectHits.length) {
    el.innerHTML = `<p class="gs-empty">No results for "${esc(query)}"</p>`;
    el.hidden = false;
    return;
  }

  let html = "";

  if (acctHits.length) {
    html += `<p class="gs-group-label">Accounts</p>`;
    html += acctHits.map(a => `
      <div class="gs-item" tabindex="0" data-gs-type="account" data-gs-id="${esc(a.id)}">
        <span class="gs-item-icon">🏢</span>
        <div class="gs-item-text">
          <div class="gs-item-name">${esc(a.client)}</div>
          <div class="gs-item-meta">${[a.entity, a.county].filter(Boolean).join(" · ")}</div>
        </div>
        <span class="gs-item-badge">${esc(a.clientRanking || "Account")}</span>
      </div>`).join("");
  }

  if (dealHits.length) {
    if (html) html += `<div class="gs-divider"></div>`;
    html += `<p class="gs-group-label">Pipeline Deals</p>`;
    html += dealHits.map(d => `
      <div class="gs-item" tabindex="0" data-gs-type="deal" data-gs-id="${esc(d.id)}">
        <span class="gs-item-icon">◈</span>
        <div class="gs-item-text">
          <div class="gs-item-name">${esc(d.title || d.accountName)}</div>
          <div class="gs-item-meta">${esc(d.accountName)}${d.amount ? " · $" + Number(d.amount).toLocaleString() : ""}</div>
        </div>
        <span class="gs-item-badge">${esc(d.stage)}</span>
      </div>`).join("");
  }

  if (prospectHits.length) {
    if (html) html += `<div class="gs-divider"></div>`;
    html += `<p class="gs-group-label">Prospects</p>`;
    html += prospectHits.map(p => {
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.company || p.email;
      return `
      <div class="gs-item" tabindex="0" data-gs-type="prospect" data-gs-id="${esc(p.id)}">
        <span class="gs-item-icon">✉</span>
        <div class="gs-item-text">
          <div class="gs-item-name">${esc(name)}</div>
          <div class="gs-item-meta">${esc(p.company || p.email || "")}</div>
        </div>
        <span class="gs-item-badge">${esc(p.status || "Prospect")}</span>
      </div>`;
    }).join("");
  }

  el.innerHTML = html;
  el.hidden = false;

  el.querySelectorAll(".gs-item").forEach(item => {
    const activate = () => {
      const type = item.dataset.gsType;
      const id = item.dataset.gsId;
      closeGlobalSearch();
      byId("globalSearch").value = "";
      state.search = "";
      if (type === "account") {
        showDetail("account", id);
      } else if (type === "deal") {
        setView("pipeline");
        setTimeout(() => window.gripPipeline?.render(), 50);
      } else if (type === "prospect") {
        setView("outreach");
      }
    };
    item.addEventListener("click", activate);
    item.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") activate(); });
  });
}

function render() {
  applyPhoneModeDefaults();
  syncMobilePreviewButton();
  renderBrand();
  renderDashboard();
  renderTasks();
  renderFollowUpQueue();
  renderAccounts();
  renderActivityLog();
  renderNewsReport();
  renderProjects();
  renderPunchLists();
  renderTakeoffEstimator();
  renderWarrantySummaryChart();
  renderProposals();
  renderScopeDatabase();
  renderContractors();
  renderCallList();
  renderNoteTaker();
  renderNavBadges();
}

function clearDetailDrawer() {
  byId("detailDrawer").classList.remove("is-open");
  byId("detailContent").innerHTML = `<p class="empty-detail">Select a record to see contacts, next steps, projects, and proposals together.</p>`;
}

function setDetailsHidden(hidden) {
  state.detailsHidden = hidden;
  byId("appShell").classList.toggle("details-hidden", hidden);
  const lbl = byId("detailToggleLabel");
  if (lbl) lbl.textContent = hidden ? "Show" : "Details";
  const tog = byId("detailToggle");
  if (tog) tog.setAttribute("title", hidden ? "Show detail panel" : "Hide detail panel");
  const arrow = tog?.querySelector("svg");
  if (arrow) arrow.style.transform = hidden ? "rotate(180deg)" : "";
}

function setView(view) {
  state.view = view;
  if (view !== "dashboard") state.filters.dataQuality = "all";
  clearDetailDrawer();
  closeMobileMoreMenu();
  if (view === "callList") {
    state.callListMode = "today";
    state.callListDay = todayCallDay();
    if (byId("callListDay")) byId("callListDay").value = state.callListDay;
    renderCallList();
  }
  const projectSubViews = ["punchList", "takeoffEstimator", "warrantySummary"];
  document.querySelectorAll(".nav-button").forEach((button) => {
    const isMatch = button.dataset.view === view;
    const isProjectParent = button.dataset.view === "projects" && projectSubViews.includes(view) && !button.classList.contains("nav-sub-button");
    button.classList.toggle("is-active", isMatch || isProjectParent);
  });
  const overflowViews = ["punchList", "takeoffEstimator", "warrantySummary", "followUpQueue", "tasks", "noteTaker", "activityLog", "scopeDatabase", "contractors", "newsReport", "outreach"];
  byId("mobileMoreButton")?.classList.toggle("is-active", overflowViews.includes(view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("is-active", section.id === `${view}View`));
  if (view === "newsReport") renderNewsReport();
  if (view === "tasks") renderTasks();
  if (view === "punchList") renderPunchLists();
  if (view === "takeoffEstimator") renderTakeoffEstimator();
  if (view === "warrantySummary") renderWarrantySummaryChart();
  if (view === "noteTaker") renderNoteTaker();
  if (view === "outreach") { if (window.gripOutreach) window.gripOutreach.render(); }
  if (view === "today")     { if (window.gripToday)    window.gripToday.render(); }
  if (view === "pipeline")  { if (window.gripPipeline) window.gripPipeline.render(); }
  if (view === "territory") { if (window.gripTerritory) window.gripTerritory.render(); }
  const _viewTitles = { today: "Today", dashboard: "Dashboard", pipeline: "Pipeline", territory: "Territory", accounts: "Accounts", projects: "Projects", punchList: "Punch List", takeoffEstimator: "Takeoff Estimator", warrantySummary: "Warranty Summary Chart", proposals: "Proposals", scopeDatabase: "Scope of Work", tasks: "Tasks", callList: "Call List", followUpQueue: "Follow-Up Queue", activityLog: "Activity Log", newsReport: "Your News Report", contractors: "Contractors", noteTaker: "Note Taker", outreach: "Assistant" };
  const _resolvedTitle = _viewTitles[view] || view;
  byId("viewTitle").textContent = _resolvedTitle;
  updateMobileViewLabel(_resolvedTitle);
  closeMobileFullMenu();
  if (view === "dashboard") {
    showDueTodayProposalDialog();
    showTaskDailyAlertDialog();
  }
}
window.setView = setView;
window.showDetail = showDetail;

function closeMobileMoreMenu() {
  const menu = byId("mobileMoreMenu");
  const button = byId("mobileMoreButton");
  if (menu) { menu.hidden = true; menu.classList.remove("is-open"); }
  if (button) button.setAttribute("aria-expanded", "false");
  closeMobileFullMenu();
}

function toggleMobileMoreMenu() {
  const menu = byId("mobileMoreMenu");
  const button = byId("mobileMoreButton");
  if (!menu || !button) return;
  const open = menu.hidden;
  menu.hidden = !open;
  menu.classList.toggle("is-open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function openRoofNotesDialog(accountId) {
  const dlg = byId("roofNotesDialog");
  if (!dlg) return;
  const notes = JSON.parse(localStorage.getItem("garlandRoofNotes") || "{}");
  const n = notes[accountId] || {};
  const form = byId("roofNotesForm");
  if (form) {
    byId("roofNotesAccountId").value = accountId;
    form.elements.namedItem("system").value = n.system || "";
    form.elements.namedItem("roofAge").value = n.roofAge || "";
    form.elements.namedItem("sqFt").value = n.sqFt || "";
    form.elements.namedItem("stories").value = n.stories || "";
    form.elements.namedItem("condition").value = n.condition || "";
    form.elements.namedItem("garlandProducts").value = n.garlandProducts || "";
    form.elements.namedItem("lastInspection").value = n.lastInspection || "";
    form.elements.namedItem("notes").value = n.notes || "";
  }
  dlg.showModal();
}

function openPreVisitDossier(accountId) {
  const dlg = byId("preDossierDialog");
  const content = byId("preDossierContent");
  if (!dlg || !content) return;
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) return;
  const acts = state.activities[accountId] || [];
  const recent = acts.slice(-5).reverse();
  const roofNotes = JSON.parse(localStorage.getItem("garlandRoofNotes") || "{}")[accountId] || {};
  const pipeline = JSON.parse(localStorage.getItem("garlandPipeline") || "[]").filter(d => d.accountId === accountId);
  const outreach = JSON.parse(localStorage.getItem("garlandOutreach") || "{}");
  const prospect = (outreach.contacts || []).find(c => c.accountId === accountId);

  const fmtD = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  content.innerHTML = `
    <div class="dossier">
      <div class="dossier-section">
        <h4 class="dossier-h">${esc(account.client)}</h4>
        <div class="dossier-grid">
          <span class="dossier-label">Contact</span><span>${esc(account.poc || "—")}</span>
          <span class="dossier-label">Title</span><span>${esc(account.title || "—")}</span>
          <span class="dossier-label">Phone</span><span>${esc(account.phone || "—")}</span>
          <span class="dossier-label">Email</span><span>${esc(account.email || "—")}</span>
          <span class="dossier-label">County</span><span>${esc(account.county || "—")}</span>
          <span class="dossier-label">Entity</span><span>${esc(account.entity || "—")}</span>
          <span class="dossier-label">Address</span><span>${esc(account.address || "—")}</span>
        </div>
      </div>
      ${Object.keys(roofNotes).length ? `
      <div class="dossier-section">
        <h4 class="dossier-h">Roof &amp; Facility</h4>
        <div class="dossier-grid">
          ${roofNotes.system ? `<span class="dossier-label">System</span><span>${esc(roofNotes.system)}</span>` : ""}
          ${roofNotes.roofAge ? `<span class="dossier-label">Installed</span><span>${esc(roofNotes.roofAge)}</span>` : ""}
          ${roofNotes.sqFt ? `<span class="dossier-label">Sq Ft</span><span>${esc(roofNotes.sqFt)}</span>` : ""}
          ${roofNotes.condition ? `<span class="dossier-label">Condition</span><span>${esc(roofNotes.condition)}</span>` : ""}
          ${roofNotes.garlandProducts ? `<span class="dossier-label">Garland Products</span><span>${esc(roofNotes.garlandProducts)}</span>` : ""}
          ${roofNotes.notes ? `<span class="dossier-label">Notes</span><span>${esc(roofNotes.notes)}</span>` : ""}
        </div>
      </div>` : ""}
      ${pipeline.length ? `
      <div class="dossier-section">
        <h4 class="dossier-h">Open Deals</h4>
        ${pipeline.map(d => `<div class="dossier-deal"><span>${esc(d.title || d.accountName)}</span><span class="dossier-stage">${esc(d.stage)}</span>${d.amount ? `<span>$${Number(d.amount).toLocaleString()}</span>` : ""}</div>`).join("")}
      </div>` : ""}
      ${prospect ? `
      <div class="dossier-section">
        <h4 class="dossier-h">Payton Outreach</h4>
        <div class="dossier-grid">
          <span class="dossier-label">Status</span><span>${esc(prospect.status || "—")}</span>
          <span class="dossier-label">Last Email</span><span>${prospect.lastContactedAt ? fmtD(prospect.lastContactedAt.slice(0,10)) : "—"}</span>
        </div>
      </div>` : ""}
      <div class="dossier-section">
        <h4 class="dossier-h">Recent Activity</h4>
        ${recent.length ? recent.map(a => `<div class="dossier-activity"><span class="dossier-act-date">${esc((a.date || a.at || "").slice(0,10))}</span><span>${esc(a.note || a.text || "")}</span></div>`).join("") : "<p style='color:var(--muted);font-size:13px'>No activity logged yet.</p>"}
      </div>
    </div>`;
  dlg.showModal();
}
window.openRoofNotesDialog = openRoofNotesDialog;
window.openPreVisitDossier = openPreVisitDossier;

function bindEvents() {
  document.querySelector(".sidebar").addEventListener("click", (event) => {
    const more = event.target.closest("#mobileMoreButton");
    if (more) {
      toggleMobileMoreMenu();
      return;
    }
    const button = event.target.closest("[data-view]");
    if (button) setView(button.dataset.view);
  });
  byId("detailToggle").addEventListener("click", () => setDetailsHidden(!state.detailsHidden));
  byId("newTaskButton").addEventListener("click", () => openTaskDialog());
  byId("newTaskHeroButton").addEventListener("click", () => openTaskDialog());
  byId("callListView").addEventListener("click", (event) => {
    const callCheckbox = event.target.closest("[data-call-account]");
    if (callCheckbox) {
      event.stopPropagation();
      handleCallListCheckbox(callCheckbox);
      return;
    }
    const dayButton = event.target.closest("[data-call-day]");
    if (dayButton) {
      state.callListDay = dayButton.dataset.callDay;
      byId("callListDay").value = state.callListDay;
      renderCallList();
      return;
    }
    const button = event.target.closest("[data-call-list-mode]");
    if (button) setCallListMode(button.dataset.callListMode);
  });
  document.querySelectorAll("[data-view-toggle]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-layout]");
      if (!button) return;
      setLayout(group.dataset.viewToggle, button.dataset.layout);
    });
  });
  byId("accountsView").addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-mode]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setAccountMode(button.dataset.accountMode);
  });
  byId("territorySettingsButton").addEventListener("click", openTerritorySettings);
  byId("mobileVersionButton").addEventListener("click", toggleMobilePreview);
  byId("mobileHeaderToggle")?.addEventListener("click", toggleMobileHeader);
  byId("mobileCompactMenuBtn")?.addEventListener("click", toggleMobileFullMenu);
  byId("mobileFullMenu")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) closeMobileFullMenu();
  });
  document.addEventListener("click", (e) => {
    const bar = byId("mobileCompactBar");
    const menu = byId("mobileFullMenu");
    if (menu?.classList.contains("is-open") && !bar?.contains(e.target) && !menu?.contains(e.target)) {
      closeMobileFullMenu();
    }
  });
  byId("exportBackupButton").addEventListener("click", exportBackup);
  byId("importBackupButton").addEventListener("click", () => byId("backupImportInput").click());
  byId("backupImportInput").addEventListener("change", (event) => {
    importBackup(event.target.files?.[0]);
    event.target.value = "";
  });
  byId("importAccountContactsButton").addEventListener("click", () => byId("accountContactsImportInput").click());
  byId("accountContactsImportInput").addEventListener("change", (event) => {
    importAccountContactsCsv(event.target.files?.[0]);
    event.target.value = "";
  });
  byId("exportAccountContactsButton").addEventListener("click", () => exportContactsCsv("account"));
  byId("exportAccountVcardsButton").addEventListener("click", () => exportContactsVcard("account"));
  byId("exportContractorContactsButton").addEventListener("click", () => exportContactsCsv("contractor"));
  byId("exportContractorVcardsButton").addEventListener("click", () => exportContactsVcard("contractor"));
  byId("copyWeeklyReviewButton").addEventListener("click", () => {
    copyProposalRequestDraft(weeklyReviewText(), "Weekly review copied.");
  });
  byId("cancelWeeklyReviewButton").addEventListener("click", () => byId("weeklyReviewDialog").close());
  byId("closeWeeklyReviewButton").addEventListener("click", () => byId("weeklyReviewDialog").close());
  byId("copyWeeklyReviewDialogButton").addEventListener("click", () => {
    copyProposalRequestDraft(weeklyReviewText(), "Weekly recap copied.");
  });
  byId("printSummaryButton").addEventListener("click", () => window.print());
  byId("cloudSyncButton").addEventListener("click", () => openDialog("cloudSyncDialog"));
  byId("cancelCloudSyncButton").addEventListener("click", () => byId("cloudSyncDialog").close());
  byId("releaseNotesButton").addEventListener("click", () => openDialog("releaseNotesDialog"));

  // ── Supabase auth bindings ──────────────────────────────────────
  byId("gripGoogleSignInButton")?.addEventListener("click", () => {
    const btn = byId("gripGoogleSignInButton");
    if (btn) { btn.textContent = "Opening Google sign-in…"; btn.disabled = true; }
    window.gripSync?.signInWithGoogle();
  });
  byId("gripContinueLocalButton")?.addEventListener("click", () => window.gripSync?.continueLocal());
  byId("gripClearSessionButton")?.addEventListener("click", () => window.gripSync?.clearSessionAndRetry());
  byId("gripSyncStatus")?.addEventListener("click", () => window.gripSync?.forceSync());
  byId("gripSignOutButton")?.addEventListener("click", async () => {
    if (await gripConfirm("Sign out of GRIP cloud sync? Your local data stays on this device.", "Sign Out", "Cancel")) window.gripSync?.signOut();
  });
  byId("cancelReleaseNotesButton").addEventListener("click", () => byId("releaseNotesDialog").close());
  byId("cancelProposalDueTodayButton").addEventListener("click", () => {
    byId("proposalDueTodayDialog").close();
    showTaskDailyAlertDialog();
  });
  byId("closeDueTodayProposalsButton").addEventListener("click", () => {
    byId("proposalDueTodayDialog").close();
    showTaskDailyAlertDialog();
  });
  byId("cancelTaskDailyAlertButton").addEventListener("click", () => byId("taskDailyAlertDialog").close());
  byId("closeTaskDailyAlertButton").addEventListener("click", () => byId("taskDailyAlertDialog").close());
  byId("viewTodayTasksButton").addEventListener("click", () => {
    byId("taskDailyAlertDialog").close();
    openTasksDueToday();
  });
  byId("viewIncompleteTaskAccountsButton").addEventListener("click", () => {
    byId("taskDailyAlertDialog").close();
    setView("accounts");
    state.filters.dataQuality = "accountMissingContact";
    render();
  });
  byId("viewDueTodayProposalsButton").addEventListener("click", () => {
    byId("proposalDueTodayDialog").close();
    setView("proposals");
    state.proposalSort = "dueDate";
    state.filters.proposalStage = "All proposal stages";
    state.filters.proposalBidStatus = "All bid statuses";
    renderFilters();
    renderProposals();
  });
  byId("cancelTerritoryButton").addEventListener("click", () => byId("territoryDialog").close());
  byId("copyNewsPromptButton").addEventListener("click", () => {
    copyProposalRequestDraft(newsReportPrompt(), "Your News Report prompt copied. Paste it into ChatGPT or Gemini to run the 90-day territory scan.");
  });
  byId("territoryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveTerritoryProfile(new FormData(event.currentTarget));
    byId("territoryDialog").close();
  });
  byId("cancelGoalButton").addEventListener("click", () => byId("goalDialog").close());
  byId("goalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveGoalsFromSettings(new FormData(event.currentTarget));
  });
  byId("addEntityButton").addEventListener("click", () => {
    addTerritoryValue("entity", byId("newEntityInput").value, byId("newEntityColorInput").value);
    byId("newEntityInput").value = "";
  });
  byId("addCountyButton").addEventListener("click", () => {
    addTerritoryValue("county", byId("newCountyInput").value, byId("newCountyColorInput").value);
    byId("newCountyInput").value = "";
  });
  byId("globalSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
    renderGlobalSearch(event.target.value);
  });
  byId("globalSearch").addEventListener("focus", (event) => {
    if (event.target.value.trim().length >= 2) renderGlobalSearch(event.target.value);
  });
  byId("globalSearch").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeGlobalSearch();
  });
  document.addEventListener("click", (event) => {
    if (!byId("globalSearchWrap")?.contains(event.target)) closeGlobalSearch();
  });
  byId("taskSearchInput").addEventListener("input", (event) => {
    state.filters.taskSearch = event.target.value;
    renderTasks();
  });
  byId("taskSummaryStrip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-summary-filter]");
    if (!button) return;
    state.filters.taskDue = button.dataset.taskSummaryFilter;
    byId("taskDueFilter").value = state.filters.taskDue;
    renderTasks();
  });
  byId("taskForm").addEventListener("change", (event) => {
    if (event.target.name === "accountMode") syncTaskAccountMode();
    if (event.target.id === "taskAccountSearchInput") {
      fillSelect("taskProjectInput", taskProjectOptions(event.target.value), "");
    }
  });
  byId("taskForm").addEventListener("input", (event) => {
    if (event.target.id === "taskAccountSearchInput") fillSelect("taskProjectInput", taskProjectOptions(event.target.value), "");
  });
  byId("taskForm").addEventListener("click", (event) => {
    const template = event.target.closest("[data-task-template]");
    if (template) {
      applyTaskTemplate(template.dataset.taskTemplate);
      return;
    }
    const due = event.target.closest("[data-task-due]");
    if (due) setTaskDueShortcut(due.dataset.taskDue);
  });
  byId("taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveTaskFromForm(event.currentTarget);
  });
  byId("cancelTaskButton").addEventListener("click", () => byId("taskDialog").close());
  byId("clearTaskButton").addEventListener("click", () => resetTaskForm());
  byId("taskAttachmentInput").addEventListener("change", (event) => {
    addTaskDraftFiles(event.target.files);
    event.target.value = "";
  });
  byId("newPunchListButton").addEventListener("click", () => openPunchListDialog());
  byId("cancelPunchListButton").addEventListener("click", () => byId("punchListDialog").close());
  byId("clearPunchListButton").addEventListener("click", () => resetPunchListForm());
  byId("punchProjectInput").addEventListener("change", syncPunchProjectDefaults);
  byId("punchListForm").addEventListener("submit", (event) => {
    event.preventDefault();
    savePunchListFromForm(event.currentTarget);
  });
  byId("punchSaveAddItemButton").addEventListener("click", () => {
    state.punchKeepOpen = true;
    byId("punchListForm").requestSubmit();
  });
  byId("punchBeforePhotoInput").addEventListener("change", (event) => {
    addPunchDraftFiles("before", event.target.files);
    event.target.value = "";
  });
  byId("punchAfterPhotoInput").addEventListener("change", (event) => {
    addPunchDraftFiles("after", event.target.files);
    event.target.value = "";
  });
  byId("punchSearchInput").addEventListener("input", (event) => {
    state.filters.punchSearch = event.target.value;
    renderPunchLists();
  });
  byId("punchSummaryStrip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-punch-summary-key]");
    if (!button) return;
    state.filters[button.dataset.punchSummaryKey] = button.dataset.punchSummaryValue;
    renderFilters();
    renderPunchLists();
  });
  byId("scopeSearchInput").addEventListener("input", (event) => {
    state.filters.scopeSearch = event.target.value;
    renderScopeDatabase();
  });
  byId("scopeCategoryFilter").addEventListener("change", (event) => {
    state.filters.scopeCategory = event.target.value;
    renderScopeDatabase();
  });
  byId("scopeSortFilter").addEventListener("change", (event) => {
    state.filters.scopeSort = event.target.value;
    renderScopeDatabase();
  });
  byId("scopeSortDirection").addEventListener("click", () => {
    state.filters.scopeDirection = state.filters.scopeDirection === "asc" ? "desc" : "asc";
    syncDirectionButton("scopeSortDirection", state.filters.scopeDirection);
    renderScopeDatabase();
  });
  byId("newScopeButton").addEventListener("click", () => {
    byId("scopeForm").reset();
    resetScopeWorkItems();
    byId("scopeTemplatePreview").value = "";
    openDialog("scopeDialog");
  });
  byId("cancelScopeButton").addEventListener("click", () => byId("scopeDialog").close());
  byId("clearScopeButton").addEventListener("click", () => {
    byId("scopeForm").reset();
    resetScopeWorkItems();
    byId("scopeTemplatePreview").value = "";
  });
  byId("addScopeWorkItemButton").addEventListener("click", addScopeWorkItem);
  byId("scopeWorkItemsList").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-scope-work-item]");
    if (!removeButton) return;
    removeButton.closest(".scope-work-item").remove();
    renumberScopeWorkItems();
    updateScopeTemplatePreview();
  });
  byId("scopeWorkItemsList").addEventListener("input", updateScopeTemplatePreview);
  byId("scopeTypeInput").addEventListener("change", updateScopeTemplatePreview);
  byId("generateScopeButton").addEventListener("click", updateScopeTemplatePreview);
  byId("scopeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveStandaloneScope(event.currentTarget);
  });
  byId("takeoffProjectSelect").addEventListener("change", (event) => loadTakeoffProject(event.target.value));
  byId("saveTakeoffEstimateButton").addEventListener("click", saveCurrentTakeoffEstimate);
  byId("takeoffResetButton").addEventListener("click", () => loadTakeoffProject(""));
  byId("exportTakeoffPdfButton").addEventListener("click", () => exportReportPdf("takeoff"));
  byId("exportTakeoffExcelButton").addEventListener("click", () => exportReportExcel("takeoff"));
  byId("exportWarrantyPdfButton").addEventListener("click", () => exportReportPdf("warranty"));
  byId("exportWarrantyExcelButton").addEventListener("click", () => exportReportExcel("warranty"));
  byId("saveFavoriteSystemButton").addEventListener("click", saveCurrentFavoriteSystem);
  byId("favoriteSystemsButton").addEventListener("click", openFavoriteSystems);
  byId("addTakeoffProductButton").addEventListener("click", addManualTakeoffProduct);
  byId("takeoffProductCategoryInput").addEventListener("change", renderTakeoffProductPicker);
  byId("takeoffProductSearchInput").addEventListener("input", renderTakeoffProductPicker);
  byId("takeoffBuilderTab").addEventListener("click", () => setTakeoffMode("builder"));
  byId("takeoffSystemsTab").addEventListener("click", () => setTakeoffMode("systems"));
  byId("takeoffSavedTab").addEventListener("click", () => setTakeoffMode("saved"));
  byId("takeoffSearchFilter").addEventListener("input", (event) => {
    state.filters.takeoffSearch = event.target.value;
    renderTakeoffEstimator();
  });
  byId("takeoffProjectFilter").addEventListener("change", (event) => {
    state.filters.takeoffProject = event.target.value;
    renderTakeoffEstimator();
  });
  byId("takeoffSortFilter").addEventListener("change", (event) => {
    state.filters.takeoffSort = event.target.value;
    renderTakeoffEstimator();
  });
  byId("takeoffSortDirection").addEventListener("click", () => {
    state.filters.takeoffDirection = state.filters.takeoffDirection === "asc" ? "desc" : "asc";
    syncDirectionButton("takeoffSortDirection", state.filters.takeoffDirection);
    renderTakeoffEstimator();
  });
  byId("takeoffPricingTypeInput").addEventListener("change", (event) => {
    state.filters.takeoffPricingType = event.target.value;
    byId("priceBookProgramInput").value = event.target.value;
    renderTakeoffEstimator();
  });
  byId("takeoffPricingYearInput").addEventListener("change", (event) => {
    state.filters.takeoffPricingYear = event.target.value || String(today.getFullYear());
    byId("priceBookYearInput").value = state.filters.takeoffPricingYear;
    renderTakeoffEstimator();
  });
  byId("priceBookSettingsButton").addEventListener("click", () => {
    renderPriceBookList();
    openDialog("priceBookDialog");
  });
  byId("cancelPriceBookButton").addEventListener("click", () => byId("priceBookDialog").close());
  byId("priceBookFileInput").addEventListener("change", (event) => {
    addPriceBookFiles(event.target.files);
    event.target.value = "";
  });
  ["takeoffNameInput", "takeoffSqftInput", "takeoffSlopeInput", "takeoffWasteInput"].forEach((id) => {
    byId(id).addEventListener("input", renderTakeoffEstimator);
    byId(id).addEventListener("change", renderTakeoffEstimator);
  });
  [
    "takeoffProjectTypeInput",
    "takeoffWarrantyTypeInput",
    "takeoffMaterialInput",
    "takeoffSystemInput",
    "takeoffWarrantyTermInput",
    "takeoffCapSheetInput",
    "takeoffCapAdhesiveInput",
    "takeoffBaseSheetInput",
    "takeoffBaseAdhesiveInput",
    "takeoffSurfacingInput",
  ].forEach((id) => {
    byId(id).addEventListener("change", renderTakeoffEstimator);
  });
  [
    "warrantyProjectTypeInput",
    "warrantyBuildOrderInput",
    "warrantyTypeInput",
    "warrantyMaterialInput",
    "warrantySystemInput",
    "warrantyCapSheetInput",
    "warrantyTermInput",
    "warrantyCapAdhesiveInput",
    "warrantyBaseSheetInput",
    "warrantyBaseAdhesiveInput",
    "warrantySurfacingInput",
    "warrantyContractorWarrantyInput",
  ].forEach((id) => {
    byId(id).addEventListener("change", renderWarrantySummaryChart);
  });
  [
    ["rankFilter", "rank"],
    ["entityFilter", "entity"],
    ["countyFilter", "county"],
    ["accountActivityFilter", "accountActivity"],
    ["accountSortFilter", "accountSort"],
    ["activityAccountFilter", "activityAccount"],
    ["activityEntityFilter", "activityEntity"],
    ["activityCountyFilter", "activityCounty"],
    ["activityRepFilter", "activityRep"],
    ["activityDateFilter", "activityDate"],
    ["callListSortFilter", "callListSort"],
    ["taskDueFilter", "taskDue"],
    ["taskAccountFilter", "taskAccount"],
    ["taskTypeFilter", "taskType"],
    ["taskPriorityFilter", "taskPriority"],
    ["taskStatusFilter", "taskStatus"],
    ["taskAssignedFilter", "taskAssigned"],
    ["taskSortFilter", "taskSort"],
    ["punchProjectFilter", "punchProject"],
    ["punchContractorFilter", "punchContractor"],
    ["punchStatusFilter", "punchStatus"],
    ["punchSeverityFilter", "punchSeverity"],
    ["punchCategoryFilter", "punchCategory"],
    ["punchSortFilter", "punchSort"],
    ["projectStageFilter", "projectStage"],
    ["projectRankFilter", "projectRank"],
    ["projectContractorFilter", "projectContractor"],
    ["projectSortFilter", "projectSort"],
    ["proposalStageFilter", "proposalStage"],
    ["contractorFilter", "contractor"],
    ["proposalBidStatusFilter", "proposalBidStatus"],
    ["contractorSortFilter", "contractorSort"],
    ["contractorWinFilter", "contractorWin"],
    ["queueTypeFilter", "queueType"],
    ["queueUrgencyFilter", "queueUrgency"],
  ].forEach(([id, key]) => {
    byId(id).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyControlColor(event.target);
      render();
    });
  });
  [
    ["accountSortDirection", "accountDirection"],
    ["activitySortDirection", "activityDirection"],
    ["callListSortDirection", "callListDirection"],
    ["taskSortDirection", "taskDirection"],
    ["punchSortDirection", "punchDirection"],
    ["projectSortDirection", "projectDirection"],
    ["proposalSortDirection", "proposalDirection"],
    ["contractorSortDirection", "contractorDirection"],
  ].forEach(([id, key]) => {
    byId(id).addEventListener("click", () => {
      state.filters[key] = state.filters[key] === "asc" ? "desc" : "asc";
      syncDirectionButton(id, state.filters[key]);
      render();
    });
  });
  byId("proposalsView").querySelector(".sort-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.proposalSort = button.dataset.sort;
    byId("proposalsView").querySelectorAll("[data-sort]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    renderProposals();
  });
  byId("newProposalButton").addEventListener("click", () => {
    resetProposalForm();
    openDialog("proposalDialog");
  });
  byId("newProjectButton").addEventListener("click", () => {
    resetProjectForm();
    openDialog("projectDialog");
  });
  byId("newAccountButton").addEventListener("click", () => openAccountDialog());
  byId("cancelAccountButton").addEventListener("click", () => byId("accountDialog").close());
  byId("clearAccountButton").addEventListener("click", () => {
    const id = byId("accountIdInput").value;
    if (id) openAccountDialog(id);
    else byId("accountForm").reset();
  });
  byId("deleteAccountDialogButton").addEventListener("click", async () => {
    const id = byId("accountIdInput").value;
    if (id && await gripConfirm("Delete this account from the CRM?", "Delete", "Cancel")) {
      deleteRecord("account", id);
      byId("accountDialog").close();
    }
  });
  byId("accountForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveAccountFromDialog(new FormData(event.currentTarget));
  });
  byId("cancelProjectButton").addEventListener("click", () => byId("projectDialog").close());
  byId("clearProjectButton").addEventListener("click", resetProjectForm);
  byId("projectClientSearch").addEventListener("input", updateProjectClientAddress);
  [
    "projectTypeInput",
    "systemWarrantyTypeInput",
    "systemMaterialInput",
    "systemProductInput",
    "systemWarrantyTermInput",
    "systemCapSheetInput",
    "systemCapAdhesiveInput",
    "systemBaseSheetInput",
    "systemBaseAdhesiveInput",
    "systemSurfacingInput",
    "contractorWarrantyInput",
  ].forEach((id) => {
    byId(id).addEventListener("change", renderSystemBuilder);
  });
  byId("differentProjectAddressButton").addEventListener("click", () => {
    byId("projectAddressInput").readOnly = false;
    byId("projectAddressInput").focus();
  });
  byId("projectMaterialsInput").addEventListener("input", handleProjectMaterialsInput);
  byId("projectCommissionInput").addEventListener("input", handleProjectCommissionInput);
  byId("projectContractorChecklist").addEventListener("change", () => {
    state.selectedProjectContractors = [...byId("projectContractorChecklist").querySelectorAll('input[name="projectBiddingContractors"]:checked')].map(
      (input) => input.value
    );
    renderProjectContractorChecklist();
  });
  byId("toggleProjectContractorsButton").addEventListener("click", () => {
    const body = byId("projectContractorPickerBody");
    body.hidden = !body.hidden;
    byId("toggleProjectContractorsButton").textContent = body.hidden
      ? state.selectedProjectContractors.length
        ? `Show contractors (${state.selectedProjectContractors.length} selected)`
        : "Show contractors"
      : "Hide contractors";
  });
  byId("addProjectContractorButton").addEventListener("click", () => addProjectContractor(byId("newProjectContractorName").value));
  byId("newProjectContractorName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addProjectContractor(byId("newProjectContractorName").value);
    }
  });
  byId("projectForm").addEventListener("submit", handleProjectSubmit);
  byId("projectForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON" && e.target.tagName !== "TEXTAREA") e.preventDefault();
  });
  byId("cancelProjectChecklistButton").addEventListener("click", () => byId("projectChecklistDialog").close());
  byId("printProjectChecklistButton").addEventListener("click", printProjectChecklist);
  byId("clearProjectChecklistButton").addEventListener("click", () => clearProjectChecklist(byId("projectChecklistProjectId").value));
  byId("projectChecklistForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveProjectChecklistFromForm(event.currentTarget);
  });
  byId("projectChecklistContent").addEventListener("change", (event) => {
    const inchPreset = event.target.closest("[data-inch-preset]");
    if (inchPreset) {
      const input = byId("projectChecklistForm")?.elements[inchPreset.dataset.inchPreset];
      if (input && inchPreset.value) input.value = inchPreset.value;
    }
    saveProjectChecklistDraft();
    renderProjectChecklist(byId("projectChecklistProjectId").value);
  });
  byId("cancelProposalButton").addEventListener("click", () => byId("proposalDialog").close());
  byId("clearProposalButton").addEventListener("click", resetProposalForm);
  byId("proposalClientSearch").addEventListener("input", updateNewClientVisibility);
  byId("contractorChecklist").addEventListener("change", () => {
    state.selectedContractors = [...byId("contractorChecklist").querySelectorAll('input[name="biddingContractors"]:checked')].map(
      (input) => input.value
    );
    renderContractorChecklist();
  });
  byId("receivedChecklist").addEventListener("change", () => {
    const selectedReceived = [...byId("receivedChecklist").querySelectorAll('input[name="bidsReceived"]:checked')].map((input) => input.value);
    renderReceivedChecklist(selectedReceived);
  });
  byId("addContractorButton").addEventListener("click", () => addContractor(byId("newContractorName").value));
  byId("newContractorName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addContractor(byId("newContractorName").value);
    }
  });
  byId("proposalForm").addEventListener("submit", handleProposalSubmit);
  byId("proposalForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON" && e.target.tagName !== "TEXTAREA") e.preventDefault();
  });
  byId("cancelSupportContactButton").addEventListener("click", () => byId("supportContactDialog").close());
  byId("clearSupportContactButton").addEventListener("click", () => byId("supportContactForm").reset());
  byId("supportContactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addSupportContact(form.get("contractor"), form);
    byId("supportContactDialog").close();
  });
  byId("cancelCallActivityButton").addEventListener("click", () => byId("callActivityDialog").close());
  byId("clearCallActivityButton").addEventListener("click", () => byId("callActivityForm").reset());
  byId("callActivityDialog").addEventListener("click", (event) => {
    const outcome = event.target.closest("[data-call-outcome]");
    if (!outcome) return;
    addCallOutcomeToActivity(outcome.dataset.callOutcome);
  });
  byId("callActivityForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveCallActivity(new FormData(event.currentTarget));
  });
  byId("cancelRecordQuickButton").addEventListener("click", () => byId("recordQuickDialog").close());
  byId("callListRuleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addCallListRule(new FormData(event.currentTarget));
  });
  byId("callListDay").addEventListener("change", (event) => {
    state.callListDay = event.target.value;
    renderCallList();
  });
  byId("callListType").addEventListener("change", () => {
    renderCallListValueOptions();
  });
  byId("toggleNoteNewAccountButton").addEventListener("click", () => {
    setNoteNewAccountVisible(byId("noteNewAccountFields")?.hidden);
  });
  byId("noteClientInput").addEventListener("input", syncNoteClientFields);
  ["noteCameraInput", "notePhotoInput", "noteAudioInput"].forEach((id) => byId(id).addEventListener("change", updateNoteMediaSummary));
  byId("clearNoteTakerButton").addEventListener("click", resetNoteTakerForm);
  byId("noteTakerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveNoteTakerEntry(event.currentTarget);
  });
  document.body.addEventListener("click", async (event) => {
    const toggleChecklistNa = event.target.closest("[data-toggle-checklist-na]");
    if (toggleChecklistNa) {
      event.preventDefault();
      event.stopPropagation();
      toggleProjectChecklistNa(toggleChecklistNa.dataset.toggleChecklistNa);
      return;
    }
    const openProjectChecklistButton = event.target.closest("[data-open-project-checklist]");
    if (openProjectChecklistButton) {
      event.preventDefault();
      event.stopPropagation();
      openProjectChecklist(openProjectChecklistButton.dataset.openProjectChecklist);
      return;
    }
    if (event.target.closest("[data-copy-weekly-review]")) {
      event.preventDefault();
      event.stopPropagation();
      copyProposalRequestDraft(weeklyReviewText(), "Weekly review copied.");
      return;
    }
    const folderTemplate = event.target.closest("[data-copy-folder-template]");
    if (folderTemplate) {
      event.preventDefault();
      event.stopPropagation();
      const type = folderTemplate.dataset.copyFolderTemplate;
      const record = findRecord(type, folderTemplate.dataset.folderRecord);
      if (record) copyProposalRequestDraft(driveFolderTemplate(type, record), "Drive folder template copied.");
      return;
    }
    const mobileQuickAdd = event.target.closest("[data-mobile-quick-add]");
    if (mobileQuickAdd) {
      event.preventDefault();
      event.stopPropagation();
      handleMobileQuickAdd(mobileQuickAdd.dataset.mobileQuickAdd);
      return;
    }
    const calendarIcs = event.target.closest("[data-calendar-ics]");
    if (calendarIcs) {
      event.preventDefault();
      event.stopPropagation();
      try {
        downloadCalendarIcs(JSON.parse(calendarIcs.dataset.calendarIcs || "{}"));
      } catch (_error) {
        alert("Could not build that calendar file.");
      }
      return;
    }
    const requestProposal = event.target.closest("[data-request-proposal]");
    if (requestProposal) {
      event.preventDefault();
      event.stopPropagation();
      const proposal = findRecord("proposal", requestProposal.dataset.proposalRequestId);
      const contractor = requestProposal.dataset.proposalRequestContractor || "";
      if (!proposal) return alert("I could not find that proposal.");
      const draft = proposalRequestDraft(proposal, contractor);
      if (!draft.to) {
        copyProposalRequestDraft(draft.text, "Contractor email is missing, so the draft was copied instead.");
        return;
      }
      window.location.href = proposalRequestMailto(proposal, contractor);
      return;
    }
    const copyProposalRequest = event.target.closest("[data-copy-proposal-request]");
    if (copyProposalRequest) {
      event.preventDefault();
      event.stopPropagation();
      const proposal = findRecord("proposal", copyProposalRequest.dataset.proposalRequestId);
      const contractor = copyProposalRequest.dataset.proposalRequestContractor || "";
      if (!proposal) return alert("I could not find that proposal.");
      copyProposalRequestDraft(proposalRequestDraft(proposal, contractor).text);
      return;
    }
    const logRecordActivityButton = event.target.closest("[data-log-record-activity]");
    if (logRecordActivityButton) {
      event.preventDefault();
      event.stopPropagation();
      logRecordActivity(logRecordActivityButton.dataset.logRecordActivity, logRecordActivityButton.dataset.logRecordId);
      return;
    }
    const exportAccountProfileButton = event.target.closest("[data-export-account-profile]");
    if (exportAccountProfileButton) {
      event.preventDefault();
      event.stopPropagation();
      exportAccountProfilePdf(exportAccountProfileButton.dataset.exportAccountProfile);
      return;
    }
    const dueTodayProposal = event.target.closest("[data-due-today-proposal]");
    if (dueTodayProposal) {
      byId("proposalDueTodayDialog").close();
      setView("proposals");
      showDetail("proposal", dueTodayProposal.dataset.dueTodayProposal);
      return;
    }
    if (event.target.closest("[data-open-today-tasks]")) {
      byId("taskDailyAlertDialog").close();
      openTasksDueToday();
      return;
    }
    const taskCreatedAccount = event.target.closest("[data-open-task-created-account]");
    if (taskCreatedAccount) {
      byId("taskDailyAlertDialog").close();
      setView("accounts");
      openAccountDialog(taskCreatedAccount.dataset.openTaskCreatedAccount);
      return;
    }
    const kanbanScroll = event.target.closest("[data-kanban-scroll]");
    if (kanbanScroll) {
      const board = kanbanScroll.closest(".kanban-shell")?.querySelector(".kanban-board");
      if (board) board.scrollBy({ left: kanbanScroll.dataset.kanbanScroll === "left" ? -360 : 360, behavior: "smooth" });
      return;
    }
    const backupNow = event.target.closest("[data-backup-now]");
    if (backupNow) {
      exportBackup();
      return;
    }
    const removeTakeoffProduct = event.target.closest("[data-remove-takeoff-product]");
    if (removeTakeoffProduct) {
      removeManualTakeoffProduct(removeTakeoffProduct.dataset.removeTakeoffProduct);
      return;
    }
    const loadFavorite = event.target.closest("[data-load-favorite-system]");
    if (loadFavorite) {
      loadFavoriteSystem(loadFavorite.dataset.loadFavoriteSystem);
      return;
    }
    const deleteFavorite = event.target.closest("[data-delete-favorite-system]");
    if (deleteFavorite) {
      if (await gripConfirm("Delete this saved system?", "Delete", "Cancel")) deleteFavoriteSystem(deleteFavorite.dataset.deleteFavoriteSystem);
      return;
    }
    const dashboardRow = event.target.closest("[data-dashboard-view]");
    if (dashboardRow) {
      const view = dashboardRow.dataset.dashboardView;
      const key = dashboardRow.dataset.dashboardFilterKey;
      const value = dashboardRow.dataset.dashboardFilterValue;
      setView(view);
      if (key === "search") {
        state.search = value;
        byId("globalSearch").value = value;
      } else if (key) {
        state.filters[key] = value;
        state.search = "";
        byId("globalSearch").value = "";
        if (key === "proposalAging") {
          state.proposalSort = "dueDate";
          state.filters.proposalStage = "All proposal stages";
          state.filters.proposalBidStatus = "All bid statuses";
          state.filters.contractor = "All contractors";
        }
        if (key === "dataQuality") {
          state.filters.rank = "All rankings";
          state.filters.entity = "All entities";
          state.filters.county = "All counties";
          state.filters.accountActivity = "All activity";
          state.filters.projectStage = "All project stages";
          state.filters.projectRank = "All project rankings";
          state.filters.projectContractor = "All contractors";
          state.filters.proposalStage = "All proposal stages";
          state.filters.proposalBidStatus = "All bid statuses";
          state.filters.contractorWin = "all";
        }
      }
      renderFilters();
      render();
      return;
    }
    const savedFilter = event.target.closest("[data-saved-filter]");
    if (savedFilter) {
      applySavedFilter(savedFilter.dataset.savedFilter);
      return;
    }
    if (event.target.closest("[data-open-territory-settings]")) {
      openTerritorySettings();
      return;
    }
    if (event.target.closest("[data-open-goal-settings]")) {
      openGoalSettings();
      return;
    }
    const deleteTerritory = event.target.closest("[data-delete-territory]");
    if (deleteTerritory) {
      deleteTerritoryValue(deleteTerritory.dataset.deleteTerritory, deleteTerritory.dataset.territoryValue);
      return;
    }
    const editTerritory = event.target.closest("[data-edit-territory]");
    if (editTerritory) {
      editTerritoryValue(editTerritory.dataset.editTerritory, editTerritory.dataset.territoryValue);
      return;
    }
    const addTaskAccount = event.target.closest("[data-add-task-account]");
    if (addTaskAccount) {
      openTaskDialog("", addTaskAccount.dataset.addTaskAccount);
      return;
    }
    const quickDealBtn = event.target.closest("[data-quick-deal-account]");
    if (quickDealBtn) {
      const accountId = quickDealBtn.dataset.quickDealAccount;
      setView("pipeline");
      setTimeout(() => {
        if (window.gripPipeline) {
          window.gripPipeline.render();
          window.gripPipeline.openDealDialog(null, accountId);
        }
      }, 80);
      return;
    }
    const roofNotesBtn = event.target.closest("[data-roof-notes-account]");
    if (roofNotesBtn) {
      openRoofNotesDialog(roofNotesBtn.dataset.roofNotesAccount);
      return;
    }
    const dossierBtn = event.target.closest("[data-dossier-account]");
    if (dossierBtn) {
      openPreVisitDossier(dossierBtn.dataset.dossierAccount);
      return;
    }
    const editRecord = event.target.closest("[data-edit-record]");
    if (editRecord) {
      if (editRecord.dataset.editRecord === "contractor") {
        if (byId("recordQuickDialog")?.open) byId("recordQuickDialog").close();
        showContractorDetail(editRecord.dataset.editId, true);
        return;
      }
      beginDetailEditMode(editRecord.dataset.editRecord, editRecord.dataset.editId);
      return;
    }
    const cancelContractorEdit = event.target.closest("[data-cancel-contractor-edit]");
    if (cancelContractorEdit) {
      showContractorDetail(cancelContractorEdit.dataset.cancelContractorEdit);
      return;
    }
    const cancelDetailEdit = event.target.closest("[data-cancel-detail-edit]");
    if (cancelDetailEdit) {
      showDetail(cancelDetailEdit.dataset.cancelDetailEdit, cancelDetailEdit.dataset.detailEditId);
      return;
    }
    const saveDetailEdit = event.target.closest("[data-save-detail-edit]");
    if (saveDetailEdit) {
      saveDetailEditMode(saveDetailEdit.dataset.saveDetailEdit, saveDetailEdit.dataset.detailEditId);
      return;
    }
    const openTaskEdit = event.target.closest("[data-open-task-dialog]");
    if (openTaskEdit) {
      openTaskDialog(openTaskEdit.dataset.openTaskDialog);
      return;
    }
    const completeTaskButton = event.target.closest("[data-complete-task]");
    if (completeTaskButton) {
      event.stopPropagation();
      completeTask(completeTaskButton.dataset.completeTask, completeTaskButton.checked);
      return;
    }
    const deleteTaskButton = event.target.closest("[data-delete-task]");
    if (deleteTaskButton) {
      if (await gripConfirm("Delete this task?", "Delete", "Cancel")) deleteRecord("task", deleteTaskButton.dataset.deleteTask);
      return;
    }
    const generateContractorLinkButton = event.target.closest("[data-generate-contractor-link]");
    if (generateContractorLinkButton) {
      const list = findPunchList(generateContractorLinkButton.dataset.generateContractorLink);
      if (!list) return;
      if (!window.gripSync?.isConfigured()) {
        alert("Configure Supabase in src/supabase-client.js and sign in to generate contractor portal links.");
        return;
      }
      generateContractorLinkButton.textContent = "Generating…";
      generateContractorLinkButton.disabled = true;
      window.gripSync.generateContractorLink(list).then((url) => {
        generateContractorLinkButton.textContent = "🔗 Contractor Portal Link";
        generateContractorLinkButton.disabled = false;
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          generateContractorLinkButton.textContent = "✓ Link Copied!";
          setTimeout(() => { generateContractorLinkButton.textContent = "🔗 Contractor Portal Link"; }, 3000);
        }).catch(() => {
          prompt("Copy this contractor portal link:", url);
        });
      });
      return;
    }
    const openPunchDialogButton = event.target.closest("[data-open-punch-dialog]");
    if (openPunchDialogButton) {
      openPunchListDialog(openPunchDialogButton.dataset.openPunchDialog);
      return;
    }
    const addPunchItemButton = event.target.closest("[data-add-punch-item]");
    if (addPunchItemButton) {
      openPunchListDialog(addPunchItemButton.dataset.addPunchItem, "", true);
      return;
    }
    const openPunchProjectButton = event.target.closest("[data-open-punch-project]");
    if (openPunchProjectButton) {
      openPunchListDialog("", openPunchProjectButton.dataset.openPunchProject);
      return;
    }
    const openPunchDetailButton = event.target.closest("[data-open-punch-detail]");
    if (openPunchDetailButton) {
      const list = findPunchList(openPunchDetailButton.dataset.openPunchDetail);
      if (list) showPunchListDetail(list);
      return;
    }
    const sendPunchButton = event.target.closest("[data-send-punch]");
    if (sendPunchButton) {
      const list = findPunchList(sendPunchButton.dataset.sendPunch);
      if (!list) return;
      list.status = "Sent to Contractor";
      list.sent_at = list.sent_at || new Date().toISOString();
      list.updated_at = new Date().toISOString();
      punchAudit(list, "Copied contractor punch packet");
      savePunchLists();
      copyProposalRequestDraft(punchContractorPacket(list), "Contractor punch packet copied.");
      render();
      showPunchListDetail(list);
      return;
    }
    const exportPunchButton = event.target.closest("[data-export-punch]");
    if (exportPunchButton) {
      const list = findPunchList(exportPunchButton.dataset.exportPunch);
      if (list) exportPunchListPdf(list);
      return;
    }
    const exportOwnerPunchButton = event.target.closest("[data-export-owner-punch]");
    if (exportOwnerPunchButton) {
      const list = findPunchList(exportOwnerPunchButton.dataset.exportOwnerPunch);
      if (list) exportPunchListPdf(list, true);
      return;
    }
    const submitPunchItemButton = event.target.closest("[data-submit-punch-item]");
    if (submitPunchItemButton) {
      updatePunchItemStatus(submitPunchItemButton.dataset.punchList, submitPunchItemButton.dataset.submitPunchItem, "Submitted for Review");
      return;
    }
    const approvePunchItemButton = event.target.closest("[data-approve-punch-item]");
    if (approvePunchItemButton) {
      updatePunchItemStatus(approvePunchItemButton.dataset.punchList, approvePunchItemButton.dataset.approvePunchItem, "Approved");
      return;
    }
    const rejectPunchItemButton = event.target.closest("[data-reject-punch-item]");
    if (rejectPunchItemButton) {
      updatePunchItemStatus(rejectPunchItemButton.dataset.punchList, rejectPunchItemButton.dataset.rejectPunchItem, "Rejected");
      return;
    }
    const requestCorrectionButton = event.target.closest("[data-request-correction]");
    if (requestCorrectionButton) {
      updatePunchItemStatus(requestCorrectionButton.dataset.punchList, requestCorrectionButton.dataset.requestCorrection, "Needs Additional Correction");
      return;
    }
    const deletePunchButton = event.target.closest("[data-delete-punch-list]");
    if (deletePunchButton) {
      if (await gripConfirm("Delete this punch list?", "Delete", "Cancel")) deleteRecord("punchList", deletePunchButton.dataset.deletePunchList);
      return;
    }
    const deleteRecordButton = event.target.closest("[data-delete-record]");
    if (deleteRecordButton) {
      const type = deleteRecordButton.dataset.deleteRecord;
      const id = deleteRecordButton.dataset.deleteId;
      if (await gripConfirm(`Delete this ${type} from the CRM?`, "Delete", "Cancel")) deleteRecord(type, id);
      return;
    }
    const archiveRecordButton = event.target.closest("[data-archive-record]");
    if (archiveRecordButton) {
      const type = archiveRecordButton.dataset.archiveRecord;
      const id = archiveRecordButton.dataset.archiveId;
      if (await gripConfirm(`Archive this ${type} from active views?`, "Archive", "Cancel")) archiveRecord(type, id);
      return;
    }
    const editActivityButton = event.target.closest("[data-edit-activity]");
    if (editActivityButton) {
      editActivity(editActivityButton.dataset.activityAccount, editActivityButton.dataset.editActivity);
      return;
    }
    const deleteActivityButton = event.target.closest("[data-delete-activity]");
    if (deleteActivityButton) {
      deleteActivity(deleteActivityButton.dataset.activityAccount, deleteActivityButton.dataset.deleteActivity);
      return;
    }
    const removeFile = event.target.closest("[data-remove-file]");
    if (removeFile) {
      const proposalId = removeFile.dataset.fileRecord || removeFile.dataset.fileProposal;
      const category = removeFile.dataset.fileCategory;
      state.attachments[proposalId]?.[category]?.splice(Number(removeFile.dataset.removeFile), 1);
      saveProposalAttachments();
      const type = findRecord("project", proposalId) ? "project" : "proposal";
      showDetail(type, proposalId);
      if (category?.startsWith("projectChecklist::") && byId("projectChecklistDialog")?.open) renderProjectChecklist(proposalId);
      return;
    }
    const saveScopeUpload = event.target.closest("[data-save-scope-upload]");
    if (saveScopeUpload) {
      const panel = saveScopeUpload.closest("[data-scope-tools]");
      saveUploadedScopeToDatabase(
        saveScopeUpload.dataset.saveScopeUpload,
        panel?.querySelector("[data-scope-upload-file]")?.value,
        panel?.querySelector("[data-scope-upload-category]")?.value
      );
      return;
    }
    const attachScope = event.target.closest("[data-attach-scope-db]");
    if (attachScope) {
      const panel = attachScope.closest("[data-scope-tools]");
      attachScopeFromDatabase(attachScope.dataset.attachScopeDb, panel?.querySelector("[data-scope-db-select]")?.value);
      return;
    }
    const deleteScope = event.target.closest("[data-delete-scope-db]");
    if (deleteScope) {
      deleteScopeDatabaseEntry(deleteScope.dataset.deleteScopeDb);
      return;
    }
    const useScope = event.target.closest("[data-use-scope-template]");
    if (useScope) {
      useScopeTemplate(useScope.dataset.useScopeTemplate);
      return;
    }
    const removeCallRule = event.target.closest("[data-remove-call-rule]");
    if (removeCallRule) {
      state.callLists.rules = state.callLists.rules.filter((rule) => rule.id !== removeCallRule.dataset.removeCallRule);
      saveCallLists();
      renderCallList();
      return;
    }
    const openAccountButton = event.target.closest("[data-open-account-dialog]");
    if (openAccountButton) {
      openAccountDialog(openAccountButton.dataset.openAccountDialog);
      return;
    }
    const renameAccountButton = event.target.closest("[data-rename-account]");
    if (renameAccountButton) {
      renameAccount(renameAccountButton.dataset.renameAccount);
      return;
    }
    const openCallAccount = event.target.closest("[data-open-call-account]");
    if (openCallAccount) {
      openCallActivityDialog(openCallAccount.dataset.openCallAccount);
      return;
    }
    const addSupport = event.target.closest("[data-add-support-contact]");
    if (addSupport) {
      openSupportContactDialog(addSupport.dataset.addSupportContact);
      return;
    }
    const removeSupport = event.target.closest("[data-remove-support]");
    if (removeSupport) {
      const profile = ensureContractorProfile(removeSupport.dataset.contractorName);
      profile.supportContacts.splice(Number(removeSupport.dataset.removeSupport), 1);
      saveCrm();
      renderContractors();
      showContractorDetail(profile.companyName);
      return;
    }
    const openTakeoffProject = event.target.closest("[data-open-takeoff-project]");
    if (openTakeoffProject) {
      openTakeoffForProject(openTakeoffProject.dataset.openTakeoffProject);
      return;
    }
    const showAccountActivity = event.target.closest("[data-show-account-activity]");
    if (showAccountActivity) {
      showAccountActivityLog(showAccountActivity.dataset.showAccountActivity);
      return;
    }
    const loadTakeoff = event.target.closest("[data-load-takeoff-estimate]");
    if (loadTakeoff) {
      loadTakeoffEstimate(loadTakeoff.dataset.loadTakeoffEstimate);
      return;
    }
    const deleteTakeoff = event.target.closest("[data-delete-takeoff-estimate]");
    if (deleteTakeoff) {
      if (await gripConfirm("Delete this saved takeoff estimate?", "Delete", "Cancel")) deleteTakeoffEstimate(deleteTakeoff.dataset.deleteTakeoffEstimate);
      return;
    }
    const deletePriceBookButton = event.target.closest("[data-delete-price-book]");
    if (deletePriceBookButton) {
      if (await gripConfirm("Delete this price book reference?", "Delete", "Cancel")) deletePriceBook(deletePriceBookButton.dataset.deletePriceBook);
      return;
    }
    const record = event.target.closest("[data-type][data-id]");
    if (record && !shouldIgnoreRecordTap(event)) {
      if (isPhoneMode()) openRecordFromMobileTap(record.dataset.type, record.dataset.id);
      else showDetail(record.dataset.type, record.dataset.id);
    }
  });
  document.body.addEventListener("dblclick", (event) => {
    const recordCardEl = event.target.closest("[data-type][data-id]");
    if (recordCardEl && !event.target.closest(".editable-field")) {
      if (recordCardEl.dataset.type === "account") openAccountProfileDialog(recordCardEl.dataset.id);
      else if (["project", "proposal", "contractor"].includes(recordCardEl.dataset.type)) {
        openRecordQuickDialog(recordCardEl.dataset.type, recordCardEl.dataset.id);
      }
      return;
    }
    const editable = event.target.closest(".editable-field");
    if (editable) beginInlineEdit(editable);
  });
  byId("cancelAccountProfileButton").addEventListener("click", () => byId("accountProfileDialog").close());
  document.body.addEventListener("click", (event) => {
    const accountProfileTab = event.target.closest("[data-account-profile-tab]");
    if (!accountProfileTab) return;
    event.preventDefault();
    openAccountProfileDialog(accountProfileTab.dataset.accountProfileId, accountProfileTab.dataset.accountProfileTab);
  });
  document.body.addEventListener("submit", (event) => {
    const activityForm = event.target.closest("[data-account-activity]");
    const accountProfileActivityForm = event.target.closest("[data-account-profile-activity]");
    const profileForm = event.target.closest("[data-contractor-profile]");
    const driveLink = event.target.closest("[data-drive-link-record]");
    if (!activityForm && !accountProfileActivityForm && !profileForm && !driveLink) return;
    event.preventDefault();
    event.stopPropagation();
    if (driveLink) {
      saveDriveLink(driveLink.dataset.driveLinkRecord, driveLink.dataset.driveLinkCategory, driveLink);
      return;
    }
    const form = new FormData(event.target);
    if (accountProfileActivityForm) {
      addAccountActivity(accountProfileActivityForm.dataset.accountProfileActivity, form.get("activity"), false);
      openAccountProfileDialog(accountProfileActivityForm.dataset.accountProfileActivity, "activity");
      showDetail("account", accountProfileActivityForm.dataset.accountProfileActivity);
      return;
    }
    if (activityForm) {
      addAccountActivity(activityForm.dataset.accountActivity, form.get("activity"));
      return;
    }
    saveContractorProfile(profileForm.dataset.contractorProfile, form);
  });
  document.body.addEventListener("input", (event) => {
    if (event.target.matches('input[type="tel"], input[name="phone"], input[name="newAccountPhone"], #repPhoneInput')) {
      event.target.value = formatPhoneNumber(event.target.value);
    }
    const noteId = event.target.dataset.noteId;
    if (!noteId) return;
    state.notes[noteId] = event.target.value;
    localStorage.setItem("garlandCrmNotes", JSON.stringify(state.notes));
  });
  document.body.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".record-grid.is-kanban .record-card[data-type][data-id]");
    if (!card || !["project", "proposal", "task", "punchList"].includes(card.dataset.type)) return;
    state.draggingKanbanRecord = { type: card.dataset.type, id: card.dataset.id };
    const payload = JSON.stringify(state.draggingKanbanRecord);
    event.dataTransfer?.setData("application/x-grip-card", payload);
    event.dataTransfer?.setData("text/plain", payload);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  document.body.addEventListener("dragend", () => {
    document.querySelectorAll(".record-card.is-dragging").forEach((card) => card.classList.remove("is-dragging"));
    state.draggingKanbanRecord = null;
    clearKanbanDropTargets();
  });
  document.body.addEventListener("change", (event) => {
    const territoryColorInput = event.target.closest("[data-territory-color]");
    if (territoryColorInput) {
      updateTerritoryColor(territoryColorInput.dataset.territoryColor, territoryColorInput.dataset.territoryValue, territoryColorInput.value);
      return;
    }
    const contractorColorInput = event.target.closest("[data-contractor-color]");
    if (contractorColorInput) {
      updateContractorColor(contractorColorInput.dataset.contractorColor, contractorColorInput.value);
      return;
    }
    const upload = event.target.closest("[data-upload-proposal]");
    const genericUpload = event.target.closest("[data-upload-record]");
    const checklistUpload = event.target.closest("[data-checklist-upload-record]");
    if (checklistUpload) {
      addChecklistFiles(checklistUpload.dataset.checklistUploadRecord, checklistUpload.dataset.checklistUploadCategory, checklistUpload.files);
      checklistUpload.value = "";
      return;
    }
    if (upload) {
      addProposalFiles(upload.dataset.uploadProposal, upload.dataset.uploadCategory, upload.files);
      upload.value = "";
      return;
    }
    if (genericUpload) {
      addProposalFiles(genericUpload.dataset.uploadRecord, genericUpload.dataset.uploadCategory, genericUpload.files);
      genericUpload.value = "";
      return;
    }
    const projectAwarded = event.target.closest("[data-project-awarded]");
    if (projectAwarded) {
      const value = projectAwarded.value === "Not awarded yet" ? "" : projectAwarded.value;
      persistRecordEdit("project", projectAwarded.dataset.projectAwarded, "awardedContractor", value);
      return;
    }
    const projectBidding = event.target.closest("[data-project-bidding]");
    if (projectBidding) {
      const selected = [...projectBidding.querySelectorAll("[data-project-bidding-contractor]:checked")].map((input) => input.dataset.projectBiddingContractor);
      persistRecordEdit("project", projectBidding.dataset.projectBidding, "biddingContractors", selected.join(", "));
      return;
    }
    const punchCloseout = event.target.closest("[data-punch-closeout]");
    if (punchCloseout) {
      const list = findPunchList(punchCloseout.dataset.punchList);
      if (!list) return;
      list.closeout[punchCloseout.dataset.punchCloseout] = punchCloseout.checked;
      list.updated_at = new Date().toISOString();
      punchAudit(list, `${punchCloseout.checked ? "Completed" : "Reopened"} closeout item`, punchCloseout.dataset.punchCloseout);
      savePunchLists();
      renderPunchLists();
      showPunchListDetail(list);
      return;
    }
    const tracker = event.target.closest("[data-proposal-tracker]");
    if (!tracker) return;
    const id = tracker.dataset.proposalTracker;
    const proposal = data.proposals.find((item) => item.id === id);
    if (!proposal) return;
    const awardedSelect = tracker.querySelector("[data-awarded-select]");
    const bidding = [...tracker.querySelectorAll("[data-bidding-contractor]:checked")].map((input) => input.dataset.biddingContractor);
    const received = [...tracker.querySelectorAll("[data-received-contractor]:checked")]
      .map((input) => input.dataset.receivedContractor)
      .filter((contractor) => bidding.includes(contractor));
    const awarded = awardedSelect && awardedSelect.value !== "Not awarded yet" && received.includes(awardedSelect.value) ? awardedSelect.value : "";
    saveProposalUpdate(id, { biddingContractors: bidding.join(", "), bidsReceived: received.join(", "), awardedContractor: awarded });
    renderFilters();
    render();
    showDetail("proposal", id);
  });
  document.body.addEventListener("dragover", (event) => {
    const taskDropZone = event.target.closest("[data-task-drop-zone]");
    if (taskDropZone) {
      event.preventDefault();
      taskDropZone.classList.add("is-dragging");
      return;
    }
    const punchDropZone = event.target.closest("[data-punch-drop-zone]");
    if (punchDropZone) {
      event.preventDefault();
      punchDropZone.classList.add("is-dragging");
      return;
    }
    const kanbanColumn = event.target.closest(".record-grid.is-kanban .kanban-column[data-kanban-stage]");
    if (kanbanColumn) {
      const payload = kanbanDragPayload(event);
      if (payload && isValidKanbanStage(payload.type, kanbanColumn.dataset.kanbanStage)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        clearKanbanDropTargets();
        kanbanColumn.classList.add("is-drop-target");
        return;
      }
    }
    const priceBookDropZone = event.target.closest("[data-price-book-drop]");
    if (priceBookDropZone) {
      event.preventDefault();
      priceBookDropZone.classList.add("is-dragging");
      return;
    }
    const checklistDropZone = event.target.closest("[data-checklist-drop-record][data-checklist-drop-category]");
    if (checklistDropZone) {
      event.preventDefault();
      checklistDropZone.classList.add("is-dragging");
      return;
    }
    const dropZone = event.target.closest("[data-drop-record][data-drop-category]");
    if (!dropZone) return;
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  document.body.addEventListener("dragleave", (event) => {
    const taskDropZone = event.target.closest("[data-task-drop-zone]");
    if (taskDropZone) {
      if (!taskDropZone.contains(event.relatedTarget)) taskDropZone.classList.remove("is-dragging");
      return;
    }
    const punchDropZone = event.target.closest("[data-punch-drop-zone]");
    if (punchDropZone) {
      if (!punchDropZone.contains(event.relatedTarget)) punchDropZone.classList.remove("is-dragging");
      return;
    }
    const kanbanColumn = event.target.closest(".record-grid.is-kanban .kanban-column[data-kanban-stage]");
    if (kanbanColumn) {
      if (!kanbanColumn.contains(event.relatedTarget)) kanbanColumn.classList.remove("is-drop-target");
      return;
    }
    const priceBookDropZone = event.target.closest("[data-price-book-drop]");
    if (priceBookDropZone) {
      if (!priceBookDropZone.contains(event.relatedTarget)) priceBookDropZone.classList.remove("is-dragging");
      return;
    }
    const checklistDropZone = event.target.closest("[data-checklist-drop-record][data-checklist-drop-category]");
    if (checklistDropZone) {
      if (!checklistDropZone.contains(event.relatedTarget)) checklistDropZone.classList.remove("is-dragging");
      return;
    }
    const dropZone = event.target.closest("[data-drop-record][data-drop-category]");
    if (!dropZone || dropZone.contains(event.relatedTarget)) return;
    dropZone.classList.remove("is-dragging");
  });
  document.body.addEventListener("drop", (event) => {
    const taskDropZone = event.target.closest("[data-task-drop-zone]");
    if (taskDropZone) {
      event.preventDefault();
      addTaskDraftFiles(event.dataTransfer?.files);
      taskDropZone.classList.remove("is-dragging");
      return;
    }
    const punchDropZone = event.target.closest("[data-punch-drop-zone]");
    if (punchDropZone) {
      event.preventDefault();
      addPunchDraftFiles(punchDropZone.dataset.punchDropZone, event.dataTransfer?.files);
      punchDropZone.classList.remove("is-dragging");
      return;
    }
    const kanbanColumn = event.target.closest(".record-grid.is-kanban .kanban-column[data-kanban-stage]");
    if (kanbanColumn && handleKanbanDrop(event, kanbanColumn)) return;
    const priceBookDropZone = event.target.closest("[data-price-book-drop]");
    if (priceBookDropZone) {
      event.preventDefault();
      addPriceBookFiles(event.dataTransfer?.files);
      priceBookDropZone.classList.remove("is-dragging");
      return;
    }
    const checklistDropZone = event.target.closest("[data-checklist-drop-record][data-checklist-drop-category]");
    if (checklistDropZone) {
      event.preventDefault();
      addChecklistFiles(checklistDropZone.dataset.checklistDropRecord, checklistDropZone.dataset.checklistDropCategory, event.dataTransfer?.files);
      checklistDropZone.classList.remove("is-dragging");
      return;
    }
    const dropZone = event.target.closest("[data-drop-record][data-drop-category]");
    if (!dropZone) return;
    event.preventDefault();
    handleDroppedFiles(dropZone, event.dataTransfer?.files);
  });
  byId("drawerClose").addEventListener("click", () => byId("detailDrawer").classList.remove("is-open"));
  if (window.addEventListener) {
    window.addEventListener("resize", () => {
      if (applyPhoneModeDefaults()) render();
    });
  }
}

standardizeStageLabels();
standardizeProjectTypeLabels();
standardizeAbcScoreLabels();
applyRequestedDataCleanup();
migrateSheetNotesToActivities();
renderFilters();
renderInchFractionOptions();
resetProjectForm();
resetProposalForm();
render();
renderNavBadges();
bindEvents();
restoreMobileHeaderState();
// Start on Today dashboard
setTimeout(() => { if (window.gripToday) { setView("today"); window.gripToday.render(); } }, 0);
// Roof notes & dossier dialog wiring
(function wireNewDialogs() {
  // Quick log cancel
  byId("cancelQuickVisitLog")?.addEventListener("click", () => byId("quickVisitLogDialog")?.close());
  // Pipeline deal cancel
  byId("cancelPipelineDeal")?.addEventListener("click", () => byId("pipelineDealDialog")?.close());
  // Roof notes
  byId("cancelRoofNotes")?.addEventListener("click", () => byId("roofNotesDialog")?.close());
  byId("closeRoofNotesDialog")?.addEventListener("click", () => byId("roofNotesDialog")?.close());
  byId("roofNotesForm")?.addEventListener("submit", function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const accountId = fd.get("accountId");
    if (!accountId) return;
    const notes = JSON.parse(localStorage.getItem("garlandRoofNotes") || "{}");
    notes[accountId] = {
      system: fd.get("system") || "",
      roofAge: fd.get("roofAge") || "",
      sqFt: fd.get("sqFt") || "",
      stories: fd.get("stories") || "",
      condition: fd.get("condition") || "",
      garlandProducts: fd.get("garlandProducts") || "",
      lastInspection: fd.get("lastInspection") || "",
      notes: fd.get("notes") || "",
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem("garlandRoofNotes", JSON.stringify(notes));
    byId("roofNotesDialog")?.close();
  });
  // Pre-visit dossier close
  byId("closePreDossierDialog")?.addEventListener("click", () => byId("preDossierDialog")?.close());
  byId("closePreDossierBtn")?.addEventListener("click", () => byId("preDossierDialog")?.close());
})();

// ── Offline banner ────────────────────────────────────────────────
window.addEventListener("offline", () => { const b = byId("gripOfflineBanner"); if (b) b.hidden = false; });
window.addEventListener("online",  () => { const b = byId("gripOfflineBanner"); if (b) b.hidden = true; });
setDetailsHidden(false);
showDueTodayProposalDialog();
showTaskDailyAlertDialog();
showFridayWeeklyReviewDialog();
