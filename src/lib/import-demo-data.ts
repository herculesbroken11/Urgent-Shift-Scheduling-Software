// ─── Sample CSV datasets for the import demo ────────────────────────────────

export const SAMPLE_CUSTOMERS_CSV = `name,contact_name,contact_email,contact_phone,billing_email,notes
"Mercy General Hospital","Dr. James Wilson","jwilson@mercygeneral.org","(555) 201-1001","billing@mercygeneral.org","Primary client — ASL & Spanish"
"Eastside Community Clinic","Maria Santos","msantos@eastsideclinic.com","(555) 201-1002","accounts@eastsideclinic.com","Pediatrics & OB/GYN focus"
"Valley Legal Services","Robert Chen","rchen@valleylegal.com","(555) 201-1003","invoices@valleylegal.com","Court & deposition interpreting"
"Sunrise Senior Living","Karen Thompson","kthompson@sunrisesenior.com","(555) 201-1004","billing@sunrisesenior.com","Weekly recurring appointments"
"Metro School District","Angela Davis","adavis@metroschools.edu","(555) 201-1005","ap@metroschools.edu","IEP meetings and parent conferences"
"County Superior Court","Clerk Office","clerk@countycourt.gov","(555) 201-1006","finance@countycourt.gov","Arraignments and hearings"
"Children's Hospital","Dr. Sarah Park","spark@childrenshospital.org","(555) 201-1007","billing@childrenshospital.org","NICU and emergency dept"
"Immigration Legal Aid","Tom Nguyen","tnguyen@immlegalaid.org","(555) 201-1008","grants@immlegalaid.org","Pro bono and grant-funded"`;

export const SAMPLE_APPOINTMENTS_CSV = `title,status,modality,scheduled_start,scheduled_end,customer_name,location_name,language,interpreter_name,patient_client_name,notes
"Medical Intake - ASL","Scheduled","On-Site","2026-04-01 09:00","2026-04-01 10:30","Mercy General Hospital","Main Campus - Building A","ASL","Carlos Rivera","Patient: M. Johnson","Pre-op consultation"
"Legal Deposition","Active","Video","2026-04-01 14:00","2026-04-01 16:00","Valley Legal Services","Downtown Office","Spanish","Ana Gutierrez","Plaintiff: R. Hernandez","Civil case #2026-CV-4421"
"IEP Meeting","To-do","On-Site","2026-04-02 10:00","2026-04-02 11:30","Metro School District","Lincoln Elementary","ASL","Carlos Rivera","Student: T. Williams","Annual review"
"Emergency Consult","Done","Phone","2026-03-28 22:00","2026-03-28 23:15","Children's Hospital","ER Department","Mandarin","Wei Lin","Patient: infant Chang","After-hours emergency"
"Court Hearing","Scheduled","In-Person","2026-04-03 08:30","2026-04-03 12:00","County Superior Court","Courtroom 4B","Spanish","Ana Gutierrez","Defendant: J. Lopez","Arraignment"
"Therapy Session","Active","Video","2026-04-01 11:00","2026-04-01 12:00","Eastside Community Clinic","Telehealth","ASL","Carlos Rivera","Client: K. Davis","Ongoing weekly"
"Senior Care Visit","To-do","On-Site","2026-04-04 13:00","2026-04-04 14:30","Sunrise Senior Living","Memory Care Wing","Vietnamese","Linh Tran","Resident: Mrs. Pham","Family meeting"
"Immigration Interview","Cancelled","On-Site","2026-04-05 09:00","2026-04-05 10:00","Immigration Legal Aid","USCIS Office","Haitian Creole","","Client: P. Jean","Rescheduled to next week"
"Physical Therapy","Completed","On-Site","2026-03-27 14:00","2026-03-27 15:00","Mercy General Hospital","Rehab Center","ASL","Carlos Rivera","Patient: M. Johnson","Follow-up"
"Parent Conference","Pending","On-Site","2026-04-07 15:30","2026-04-07 16:30","Metro School District","Washington Middle School","Somali","Abdi Hassan","Parent: Mrs. Omar","Behavior plan discussion"`;

export const SAMPLE_LOCATIONS_CSV = `name,address,city,state,zip,phone,customer_name,navigation_instructions
"Main Campus - Building A","100 Hospital Drive","Springfield","IL","62701","(555) 301-0001","Mercy General Hospital","Enter through main lobby, interpreting services desk on 2nd floor"
"Rehab Center","150 Hospital Drive","Springfield","IL","62701","(555) 301-0002","Mercy General Hospital","South wing, ground floor"
"Downtown Office","500 Main Street, Suite 400","Springfield","IL","62702","(555) 301-0003","Valley Legal Services","4th floor, check in at reception"
"Lincoln Elementary","200 Lincoln Avenue","Springfield","IL","62703","(555) 301-0004","Metro School District","Main office, ask for Mrs. Rodriguez"
"Washington Middle School","350 Washington Blvd","Springfield","IL","62704","(555) 301-0005","Metro School District","Front office"
"Courtroom 4B","1 Courthouse Square","Springfield","IL","62701","(555) 301-0006","County Superior Court","4th floor, security screening required"
"Memory Care Wing","800 Sunset Lane","Springfield","IL","62705","(555) 301-0007","Sunrise Senior Living","Ring bell at north entrance"
"ER Department","100 Hospital Drive","Springfield","IL","62701","(555) 301-0008","Children's Hospital","Emergency entrance on Oak Street"
"USCIS Office","2000 Federal Plaza","Springfield","IL","62701","(555) 301-0009","Immigration Legal Aid","Bring valid ID, no phones past security"
"Telehealth","Virtual","Springfield","IL","62702","","Eastside Community Clinic","Zoom link sent 15 min before appointment"`;

export type SampleDatasetKey = "customers" | "appointments" | "locations";

export const SAMPLE_DATASETS: Record<SampleDatasetKey, { label: string; description: string; csv: string; rowCount: number }> = {
  customers: {
    label: "Sample Customers",
    description: "8 customers including hospitals, schools, and legal services",
    csv: SAMPLE_CUSTOMERS_CSV,
    rowCount: 8,
  },
  appointments: {
    label: "Sample Appointments",
    description: "10 appointments with intentional conflicts (legacy statuses & modalities) for demo",
    csv: SAMPLE_APPOINTMENTS_CSV,
    rowCount: 10,
  },
  locations: {
    label: "Sample Locations",
    description: "10 locations with addresses and navigation instructions",
    csv: SAMPLE_LOCATIONS_CSV,
    rowCount: 10,
  },
};

// ─── Demo state for simulated dry-run ────────────────────────────────────────

export function buildDemoState(datasetKey: SampleDatasetKey) {
  const dataset = SAMPLE_DATASETS[datasetKey];
  const lines = dataset.csv.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  // Parse rows (simple CSV parse — handles quoted fields)
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] || ""; });
    rows.push(row);
  }

  return { headers, rows, csv: dataset.csv, rowCount: rows.length, entityType: datasetKey };
}

// ─── Mapping templates ──────────────────────────────────────────────────────

export interface MappingTemplate {
  id: string;
  name: string;
  description: string;
  source_system: string;
  rules: { source_field: string; source_value: string; mapped_field: string; mapped_value: string }[];
}

export const BUILT_IN_TEMPLATES: MappingTemplate[] = [
  {
    id: "codas-status-map",
    name: "CodaPlus Status Mapping",
    description: "Maps legacy CodaPlus statuses to system values",
    source_system: "codas_plus",
    rules: [
      { source_field: "status", source_value: "To-do", mapped_field: "status", mapped_value: "requested" },
      { source_field: "status", source_value: "Scheduled", mapped_field: "status", mapped_value: "interpreter_assigned" },
      { source_field: "status", source_value: "Active", mapped_field: "status", mapped_value: "in_progress" },
      { source_field: "status", source_value: "Done", mapped_field: "status", mapped_value: "completed" },
      { source_field: "status", source_value: "Cancelled", mapped_field: "status", mapped_value: "cancelled" },
      { source_field: "status", source_value: "Completed", mapped_field: "status", mapped_value: "completed" },
      { source_field: "status", source_value: "Pending", mapped_field: "status", mapped_value: "requested" },
    ],
  },
  {
    id: "codas-modality-map",
    name: "CodaPlus Modality Mapping",
    description: "Maps legacy modality labels to system enums",
    source_system: "codas_plus",
    rules: [
      { source_field: "modality", source_value: "On-Site", mapped_field: "modality", mapped_value: "on_site" },
      { source_field: "modality", source_value: "In-Person", mapped_field: "modality", mapped_value: "on_site" },
      { source_field: "modality", source_value: "Video", mapped_field: "modality", mapped_value: "video" },
      { source_field: "modality", source_value: "Phone", mapped_field: "modality", mapped_value: "phone" },
      { source_field: "modality", source_value: "Telehealth", mapped_field: "modality", mapped_value: "video" },
    ],
  },
  {
    id: "generic-cleanup",
    name: "Generic Cleanup Rules",
    description: "Common data normalization rules for any source",
    source_system: "csv_manual",
    rules: [
      { source_field: "status", source_value: "active", mapped_field: "status", mapped_value: "in_progress" },
      { source_field: "status", source_value: "closed", mapped_field: "status", mapped_value: "completed" },
      { source_field: "status", source_value: "open", mapped_field: "status", mapped_value: "requested" },
    ],
  },
];
