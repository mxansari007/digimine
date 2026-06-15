/**
 * Lightweight, no-paid-API geocoding used at INGEST (the job sync), never per
 * student request:
 *   1. a static table of common Indian (+ a few global) cities — covers the
 *      overwhelming majority of placement-job locations with zero network,
 *   2. an OSM Nominatim fallback for misses (cached in-process; Nominatim's
 *      usage policy needs a real User-Agent and is fine at low, batched volume).
 *
 * Returns the 5 geo fields of `JobLocation` (caller supplies `raw`). Coords are
 * null for remote/unknown — those jobs still list, just without a map pin.
 */

interface GeoEntry {
    city: string;
    state: string | null;
    country: string;
    lat: number;
    lng: number;
}

type GeoFields = { city: string | null; state: string | null; country: string | null; lat: number | null; lng: number | null };

const IN = "India";

// Canonical city → coordinates. Keys are normalized (lowercase, no punctuation).
const CITIES: Record<string, GeoEntry> = {
    bengaluru: { city: "Bengaluru", state: "Karnataka", country: IN, lat: 12.9716, lng: 77.5946 },
    hyderabad: { city: "Hyderabad", state: "Telangana", country: IN, lat: 17.385, lng: 78.4867 },
    pune: { city: "Pune", state: "Maharashtra", country: IN, lat: 18.5204, lng: 73.8567 },
    chennai: { city: "Chennai", state: "Tamil Nadu", country: IN, lat: 13.0827, lng: 80.2707 },
    mumbai: { city: "Mumbai", state: "Maharashtra", country: IN, lat: 19.076, lng: 72.8777 },
    thane: { city: "Thane", state: "Maharashtra", country: IN, lat: 19.2183, lng: 72.9781 },
    "navi mumbai": { city: "Navi Mumbai", state: "Maharashtra", country: IN, lat: 19.033, lng: 73.0297 },
    delhi: { city: "New Delhi", state: "Delhi", country: IN, lat: 28.6139, lng: 77.209 },
    gurugram: { city: "Gurugram", state: "Haryana", country: IN, lat: 28.4595, lng: 77.0266 },
    noida: { city: "Noida", state: "Uttar Pradesh", country: IN, lat: 28.5355, lng: 77.391 },
    faridabad: { city: "Faridabad", state: "Haryana", country: IN, lat: 28.4089, lng: 77.3178 },
    ghaziabad: { city: "Ghaziabad", state: "Uttar Pradesh", country: IN, lat: 28.6692, lng: 77.4538 },
    kolkata: { city: "Kolkata", state: "West Bengal", country: IN, lat: 22.5726, lng: 88.3639 },
    ahmedabad: { city: "Ahmedabad", state: "Gujarat", country: IN, lat: 23.0225, lng: 72.5714 },
    gandhinagar: { city: "Gandhinagar", state: "Gujarat", country: IN, lat: 23.2156, lng: 72.6369 },
    surat: { city: "Surat", state: "Gujarat", country: IN, lat: 21.1702, lng: 72.8311 },
    vadodara: { city: "Vadodara", state: "Gujarat", country: IN, lat: 22.3072, lng: 73.1812 },
    rajkot: { city: "Rajkot", state: "Gujarat", country: IN, lat: 22.3039, lng: 70.8022 },
    jaipur: { city: "Jaipur", state: "Rajasthan", country: IN, lat: 26.9124, lng: 75.7873 },
    jodhpur: { city: "Jodhpur", state: "Rajasthan", country: IN, lat: 26.2389, lng: 73.0243 },
    udaipur: { city: "Udaipur", state: "Rajasthan", country: IN, lat: 24.5854, lng: 73.7125 },
    chandigarh: { city: "Chandigarh", state: "Chandigarh", country: IN, lat: 30.7333, lng: 76.7794 },
    mohali: { city: "Mohali", state: "Punjab", country: IN, lat: 30.7046, lng: 76.7179 },
    ludhiana: { city: "Ludhiana", state: "Punjab", country: IN, lat: 30.901, lng: 75.8573 },
    amritsar: { city: "Amritsar", state: "Punjab", country: IN, lat: 31.634, lng: 74.8723 },
    jalandhar: { city: "Jalandhar", state: "Punjab", country: IN, lat: 31.326, lng: 75.5762 },
    patiala: { city: "Patiala", state: "Punjab", country: IN, lat: 30.3398, lng: 76.3869 },
    indore: { city: "Indore", state: "Madhya Pradesh", country: IN, lat: 22.7196, lng: 75.8577 },
    bhopal: { city: "Bhopal", state: "Madhya Pradesh", country: IN, lat: 23.2599, lng: 77.4126 },
    raipur: { city: "Raipur", state: "Chhattisgarh", country: IN, lat: 21.2514, lng: 81.6296 },
    lucknow: { city: "Lucknow", state: "Uttar Pradesh", country: IN, lat: 26.8467, lng: 80.9462 },
    kanpur: { city: "Kanpur", state: "Uttar Pradesh", country: IN, lat: 26.4499, lng: 80.3319 },
    varanasi: { city: "Varanasi", state: "Uttar Pradesh", country: IN, lat: 25.3176, lng: 82.9739 },
    agra: { city: "Agra", state: "Uttar Pradesh", country: IN, lat: 27.1767, lng: 78.0081 },
    kochi: { city: "Kochi", state: "Kerala", country: IN, lat: 9.9312, lng: 76.2673 },
    thiruvananthapuram: { city: "Thiruvananthapuram", state: "Kerala", country: IN, lat: 8.5241, lng: 76.9366 },
    coimbatore: { city: "Coimbatore", state: "Tamil Nadu", country: IN, lat: 11.0168, lng: 76.9558 },
    madurai: { city: "Madurai", state: "Tamil Nadu", country: IN, lat: 9.9252, lng: 78.1198 },
    tiruchirappalli: { city: "Tiruchirappalli", state: "Tamil Nadu", country: IN, lat: 10.7905, lng: 78.7047 },
    salem: { city: "Salem", state: "Tamil Nadu", country: IN, lat: 11.6643, lng: 78.146 },
    visakhapatnam: { city: "Visakhapatnam", state: "Andhra Pradesh", country: IN, lat: 17.6868, lng: 83.2185 },
    vijayawada: { city: "Vijayawada", state: "Andhra Pradesh", country: IN, lat: 16.5062, lng: 80.648 },
    nagpur: { city: "Nagpur", state: "Maharashtra", country: IN, lat: 21.1458, lng: 79.0882 },
    nashik: { city: "Nashik", state: "Maharashtra", country: IN, lat: 19.9975, lng: 73.7898 },
    bhubaneswar: { city: "Bhubaneswar", state: "Odisha", country: IN, lat: 20.2961, lng: 85.8245 },
    mysuru: { city: "Mysuru", state: "Karnataka", country: IN, lat: 12.2958, lng: 76.6394 },
    mangaluru: { city: "Mangaluru", state: "Karnataka", country: IN, lat: 12.9141, lng: 74.856 },
    hubli: { city: "Hubli", state: "Karnataka", country: IN, lat: 15.3647, lng: 75.124 },
    patna: { city: "Patna", state: "Bihar", country: IN, lat: 25.5941, lng: 85.1376 },
    ranchi: { city: "Ranchi", state: "Jharkhand", country: IN, lat: 23.3441, lng: 85.3096 },
    guwahati: { city: "Guwahati", state: "Assam", country: IN, lat: 26.1445, lng: 91.7362 },
    dehradun: { city: "Dehradun", state: "Uttarakhand", country: IN, lat: 30.3165, lng: 78.0322 },
    panaji: { city: "Panaji", state: "Goa", country: IN, lat: 15.4909, lng: 73.8278 },
    // A few global hubs common in remote/API listings.
    london: { city: "London", state: null, country: "United Kingdom", lat: 51.5074, lng: -0.1278 },
    "new york": { city: "New York", state: "NY", country: "United States", lat: 40.7128, lng: -74.006 },
    "san francisco": { city: "San Francisco", state: "CA", country: "United States", lat: 37.7749, lng: -122.4194 },
    berlin: { city: "Berlin", state: null, country: "Germany", lat: 52.52, lng: 13.405 },
    singapore: { city: "Singapore", state: null, country: "Singapore", lat: 1.3521, lng: 103.8198 },
    toronto: { city: "Toronto", state: "ON", country: "Canada", lat: 43.6532, lng: -79.3832 },
    dubai: { city: "Dubai", state: null, country: "UAE", lat: 25.2048, lng: 55.2708 },
};

const ALIASES: Record<string, string> = {
    bangalore: "bengaluru",
    bengalooru: "bengaluru",
    blr: "bengaluru",
    gurgaon: "gurugram",
    bombay: "mumbai",
    calcutta: "kolkata",
    madras: "chennai",
    "new delhi": "delhi",
    "delhi ncr": "delhi",
    ncr: "delhi",
    vizag: "visakhapatnam",
    trivandrum: "thiruvananthapuram",
    cochin: "kochi",
    ernakulam: "kochi",
    mysore: "mysuru",
    mangalore: "mangaluru",
    trichy: "tiruchirappalli",
    pondicherry: "chennai",
    "greater noida": "noida",
    goa: "panaji",
    nyc: "new york",
    sf: "san francisco",
    "bay area": "san francisco",
};

const REMOTE_RE = /\b(remote|anywhere|work\s*from\s*home|wfh|distributed|worldwide)\b/i;

const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const NULL_GEO: GeoFields = { city: null, state: null, country: null, lat: null, lng: null };
const toFields = (e: GeoEntry): GeoFields => ({ city: e.city, state: e.state, country: e.country, lat: e.lat, lng: e.lng });

// In-process cache so a single sync run never geocodes the same string twice.
const cache = new Map<string, GeoFields>();

export function isRemoteLocation(raw: string | null | undefined): boolean {
    return !!raw && REMOTE_RE.test(raw);
}

function staticLookup(raw: string): GeoFields | null {
    const n = norm(raw);
    if (!n) return null;
    // Try the first comma-segment as the city, then progressively the whole string.
    const candidates = [norm(raw.split(",")[0] || ""), n].filter(Boolean);
    for (const cand of candidates) {
        const key = ALIASES[cand] || cand;
        if (CITIES[key]) return toFields(CITIES[key]);
    }
    // Contains-match: a known city name appearing anywhere ("Bengaluru, Karnataka, India").
    for (const [key, entry] of Object.entries(CITIES)) {
        if (n.includes(key)) return toFields(entry);
    }
    for (const [alias, key] of Object.entries(ALIASES)) {
        if (n.includes(alias) && CITIES[key]) return toFields(CITIES[key]);
    }
    return null;
}

async function nominatim(raw: string): Promise<GeoFields | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(
            raw
        )}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "PlacementRanker/1.0 (job-map geocoder; support@placementranker.in)",
                "Accept-Language": "en",
            },
        });
        if (!res.ok) return null;
        const arr = (await res.json()) as any[];
        const hit = arr?.[0];
        if (!hit?.lat || !hit?.lon) return null;
        const a = hit.address || {};
        return {
            city: a.city || a.town || a.village || a.state_district || a.county || null,
            state: a.state || null,
            country: a.country || null,
            lat: Number(hit.lat),
            lng: Number(hit.lon),
        };
    } catch {
        return null;
    }
}

/**
 * Resolve a free-text location to geo fields. Static table first (instant),
 * then Nominatim. Remote/unknown → all-null coords (still a valid listing).
 * @param useNetwork set false to stay fully offline (static table only).
 */
export async function geocodeLocation(raw: string | null | undefined, useNetwork = true): Promise<GeoFields> {
    if (!raw || !raw.trim()) return { ...NULL_GEO };
    if (isRemoteLocation(raw) && !staticLookup(raw)) return { ...NULL_GEO };

    const key = norm(raw);
    const cached = cache.get(key);
    if (cached) return cached;

    const fromStatic = staticLookup(raw);
    if (fromStatic) {
        cache.set(key, fromStatic);
        return fromStatic;
    }

    const fromNet = useNetwork ? await nominatim(raw) : null;
    const result = fromNet || { ...NULL_GEO };
    cache.set(key, result);
    return result;
}
