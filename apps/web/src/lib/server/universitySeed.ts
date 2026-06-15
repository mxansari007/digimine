/**
 * Curated starter list for the university directory. The resolver merges these
 * with whatever's already in Firestore, so the onboarding dropdown is useful
 * from day one — and the first time a teacher picks one, it's persisted as a
 * real (curated) row. Aliases are matched case/space-insensitively.
 */
export interface UniversitySeed {
    name: string;
    shortName?: string;
    aliases?: string[];
    city?: string;
    state?: string;
}

export const UNIVERSITY_SEED: UniversitySeed[] = [
    { name: "Chandigarh University", shortName: "CU", aliases: ["cu", "chandigarh uni"], city: "Mohali", state: "Punjab" },
    { name: "Lovely Professional University", shortName: "LPU", aliases: ["lpu"], city: "Phagwara", state: "Punjab" },
    { name: "Thapar Institute of Engineering and Technology", shortName: "Thapar", aliases: ["thapar", "tiet"], city: "Patiala", state: "Punjab" },
    { name: "Panjab University", shortName: "PU", aliases: ["panjab university", "pu chandigarh"], city: "Chandigarh", state: "Chandigarh" },
    { name: "Punjab Engineering College", shortName: "PEC", aliases: ["pec"], city: "Chandigarh", state: "Chandigarh" },
    { name: "Guru Nanak Dev University", shortName: "GNDU", aliases: ["gndu"], city: "Amritsar", state: "Punjab" },
    { name: "Punjabi University", shortName: "PUP", aliases: ["punjabi university patiala"], city: "Patiala", state: "Punjab" },
    { name: "Indian Institute of Technology Delhi", shortName: "IIT Delhi", aliases: ["iit delhi", "iitd", "iit d"], city: "New Delhi", state: "Delhi" },
    { name: "Indian Institute of Technology Bombay", shortName: "IIT Bombay", aliases: ["iit bombay", "iitb"], city: "Mumbai", state: "Maharashtra" },
    { name: "Indian Institute of Technology Madras", shortName: "IIT Madras", aliases: ["iit madras", "iitm"], city: "Chennai", state: "Tamil Nadu" },
    { name: "Indian Institute of Technology Kanpur", shortName: "IIT Kanpur", aliases: ["iit kanpur", "iitk"], city: "Kanpur", state: "Uttar Pradesh" },
    { name: "Indian Institute of Technology Kharagpur", shortName: "IIT Kharagpur", aliases: ["iit kharagpur", "iit kgp", "iitkgp"], city: "Kharagpur", state: "West Bengal" },
    { name: "Indian Institute of Technology Roorkee", shortName: "IIT Roorkee", aliases: ["iit roorkee", "iitr"], city: "Roorkee", state: "Uttarakhand" },
    { name: "Indian Institute of Science", shortName: "IISc", aliases: ["iisc", "iisc bangalore"], city: "Bengaluru", state: "Karnataka" },
    { name: "National Institute of Technology Tiruchirappalli", shortName: "NIT Trichy", aliases: ["nit trichy", "nitt"], city: "Tiruchirappalli", state: "Tamil Nadu" },
    { name: "National Institute of Technology Kurukshetra", shortName: "NIT Kurukshetra", aliases: ["nit kurukshetra", "nitkkr"], city: "Kurukshetra", state: "Haryana" },
    { name: "National Institute of Technology Warangal", shortName: "NIT Warangal", aliases: ["nit warangal", "nitw"], city: "Warangal", state: "Telangana" },
    { name: "Delhi Technological University", shortName: "DTU", aliases: ["dtu", "delhi college of engineering", "dce"], city: "New Delhi", state: "Delhi" },
    { name: "Netaji Subhas University of Technology", shortName: "NSUT", aliases: ["nsut", "nsit"], city: "New Delhi", state: "Delhi" },
    { name: "Guru Gobind Singh Indraprastha University", shortName: "GGSIPU", aliases: ["ggsipu", "ipu", "ip university"], city: "New Delhi", state: "Delhi" },
    { name: "University of Delhi", shortName: "DU", aliases: ["du", "delhi university"], city: "New Delhi", state: "Delhi" },
    { name: "Jawaharlal Nehru University", shortName: "JNU", aliases: ["jnu"], city: "New Delhi", state: "Delhi" },
    { name: "Birla Institute of Technology and Science Pilani", shortName: "BITS Pilani", aliases: ["bits pilani", "bits", "bitsp"], city: "Pilani", state: "Rajasthan" },
    { name: "Vellore Institute of Technology", shortName: "VIT", aliases: ["vit", "vit vellore"], city: "Vellore", state: "Tamil Nadu" },
    { name: "SRM Institute of Science and Technology", shortName: "SRM", aliases: ["srm", "srmist"], city: "Chennai", state: "Tamil Nadu" },
    { name: "Manipal Academy of Higher Education", shortName: "MAHE", aliases: ["manipal", "mahe", "mit manipal"], city: "Manipal", state: "Karnataka" },
    { name: "Amity University", shortName: "Amity", aliases: ["amity"], city: "Noida", state: "Uttar Pradesh" },
    { name: "Anna University", shortName: "AU", aliases: ["anna university"], city: "Chennai", state: "Tamil Nadu" },
    { name: "Jadavpur University", shortName: "JU", aliases: ["jadavpur"], city: "Kolkata", state: "West Bengal" },
    { name: "International Institute of Information Technology Hyderabad", shortName: "IIIT Hyderabad", aliases: ["iiit hyderabad", "iiith"], city: "Hyderabad", state: "Telangana" },
    { name: "Maharishi Markandeshwar University", shortName: "MMU", aliases: ["mmu", "mm university"], city: "Ambala", state: "Haryana" },
    { name: "Chitkara University", shortName: "Chitkara", aliases: ["chitkara"], city: "Rajpura", state: "Punjab" },
];
