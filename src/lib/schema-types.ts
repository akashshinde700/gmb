// WebSetu — mapping a business category to its schema.org type.
//
// Every tenant site declared itself a bare "LocalBusiness". That validates, but
// it is the least a page can say: search engines and the AI assistants now
// answering local questions read the specific subtype to decide which queries a
// business is an answer to. A dentist marked up as `Dentist` is a candidate for
// "dentist near me" in a way that a generic LocalBusiness is not.
//
// No imports, so the renderer and any test can share it.

/**
 * Category (as chosen in onboarding) → the most specific schema.org type.
 *
 * Only entries that map to a REAL schema.org type are listed. Anything absent
 * falls back to LocalBusiness deliberately: an invented type is worse than a
 * general one, because it is silently ignored and takes the page's eligibility
 * with it.
 */
const BY_CATEGORY: Record<string, string> = {
  Restaurant: "Restaurant",
  Hotel: "Hotel",
  Clinic: "MedicalClinic",
  Hospital: "Hospital",
  Doctor: "Physician",
  Dentist: "Dentist",
  Salon: "HairSalon",
  "Beauty Parlour": "BeautySalon",
  Gym: "ExerciseGym",
  "Fitness Center": "ExerciseGym",
  Lawyer: "Attorney",
  CA: "AccountingService",
  Architect: "Architect",
  Contractor: "GeneralContractor",
  "Real Estate": "RealEstateAgent",
  Construction: "GeneralContractor",
  Automobile: "AutoDealer",
  Garage: "AutoRepair",
  School: "School",
  College: "CollegeOrUniversity",
  Education: "EducationalOrganization",
  Coaching: "EducationalOrganization",
  "Travel Agency": "TravelAgency",
  Logistics: "MovingCompany",
  Transport: "MovingCompany",
  Electrical: "Electrician",
  Plumbing: "Plumber",
  Hardware: "HardwareStore",
  Photographer: "ProfessionalService",
  "Interior Designer": "HomeAndConstructionBusiness",
  "Event Management": "ProfessionalService",
  Consultant: "ProfessionalService",
  Freelancer: "ProfessionalService",
  "IT Company": "ProfessionalService",
  "Software Company": "ProfessionalService",
  "Digital Marketing": "ProfessionalService",
  Retailer: "Store",
  Wholesaler: "Store",
  Distributor: "Store",
  "Local Shop": "Store",
  Trading: "Store",
};

/** The schema.org type for a business category. */
export function schemaTypeFor(category: string): string {
  return BY_CATEGORY[(category || "").trim()] || "LocalBusiness";
}
