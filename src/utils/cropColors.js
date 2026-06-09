// Crop type and phenology color coding — mirrors backend crop_colors / pheno_colors

export const CROP_COLORS = {
  // --- broad groups (rule-based) ---
  bare:        "#d9d9d9",
  border_area: "#c0c0c0",
  cereal:      "#ffd166",
  legume:      "#73d216",
  maize:       "#f4a261",
  other:       "#8ecae6",
  paddy:       "#219ebc",
  perennial:   "#2a9d8f",
  root:        "#e76f51",
  tree:        "#3a5a40",
  weed:        "#b56576",
  unknown:     "#999999",
  // --- cereals (yellow family) ---
  rice:              "#e6c32a", rice_samba:      "#d4b82a", rice_kuruvai:    "#c4a820",
  rice_sornavari:    "#b89e1a", rice_thaladi:    "#e0c040",
  wheat:             "#ffe08a", sorghum:         "#d4a030", jowar:           "#c89828",
  pearl_millet:      "#e8b84a", bajra:           "#daa840", finger_millet:   "#cc9830",
  ragi:              "#c08820", foxtail_millet:  "#b8a048", kodo_millet:     "#b09040",
  little_millet:     "#a88838", barnyard_millet: "#a08030",
  proso_millet:      "#988030", barley:          "#f0d070",
  // --- paddy (blue-teal family) ---
  rice_paddy:        "#1a8fad", paddy_samba:     "#1e8ba5",
  paddy_kuruvai:     "#22879d", paddy_sornavari: "#268395",
  // --- legumes (green family) ---
  groundnut:   "#5cb810", peanut:       "#5cb810",
  black_gram:  "#4da80e", urad:         "#4da80e",
  green_gram:  "#6bc820", moong:        "#6bc820",
  red_gram:    "#82a830", pigeon_pea:   "#82a830", tur:          "#82a830",
  chickpea:    "#7ab828", bengal_gram:  "#7ab828",
  cowpea:      "#62b818", horse_gram:   "#92a838",
  soybean:     "#52a808", lentil:       "#8ab830",
  // --- maize (orange family) ---
  sweet_corn:  "#e89848", baby_corn:    "#d08838",
  corn:        "#f4a261", popcorn:      "#dc9040",
  // --- root / tuber (red-brown family) ---
  tapioca:     "#d85a3a", cassava:      "#d85a3a",
  sweet_potato:"#c84a2a", potato:       "#b84020",
  yam:         "#e86a4a", elephant_yam: "#c85030", elephant_foot_yam: "#c85030",
  colocasia:   "#a8602a", taro:         "#a8602a",
  fodder_grass:"#7aa848", fodder_grasses:"#7aa848",
  turmeric:    "#e8a020", ginger:       "#d89030",
  onion:       "#c87050", garlic:       "#b86848",
  carrot:      "#e87040", beetroot:     "#a83848",
  // --- perennial (teal family) ---
  sugarcane:   "#34b8a0", sugar_cane:   "#34b8a0",
  banana:      "#40c8a8", plantain:     "#38c0a0",
  pineapple:   "#48d0b0", papaya:       "#30b098",
  // --- tree (dark green family) ---
  coconut:     "#2d6a30", arecanut:     "#3a7a48",
  mango:       "#486a28", jackfruit:    "#406230",
  cashew:      "#507a38", rubber:       "#285028",
  teak:        "#304a20", neem:         "#385a28",
  palm:        "#2a5a2a", oil_palm:     "#326830",
  sandalwood:  "#487048", eucalyptus:   "#305030",
  casuarina:   "#3a6038", moringa:      "#50804a",
  // --- spice / plantation ---
  pepper:      "#405830", black_pepper: "#405830",
  cardamom:    "#487040", clove:        "#385028",
  cinnamon:    "#506038", nutmeg:       "#486830",
  coffee:      "#4a3828", tea:          "#3a6828",
  cocoa:       "#5a4030", vanilla:      "#487838",
  // --- cotton / fibre ---
  cotton:      "#7ab8d8", jute:         "#6aa8c8", hemp:         "#5a98b8",
  // --- oilseed ---
  sesame:      "#c8a860", sunflower:    "#e8c840",
  mustard:     "#d8b830", castor:       "#a89848",
  safflower:   "#d0a838", linseed:      "#b8a050",
  // --- vegetable ---
  tomato:      "#d84830", chilli:       "#c83020", brinjal:      "#784088",
  okra:        "#68a838", drumstick:    "#588830",
  cucumber:    "#78b858", pumpkin:      "#e8a038",
  bottle_gourd:"#88c868", bitter_gourd: "#68a048",
  beans:       "#58a028", cluster_beans:"#68b038",
  // --- flower ---
  jasmine:     "#f0e8d0", marigold:     "#e8a020",
  chrysanthemum:"#d88898", rose:        "#d86878",
  tuberose:    "#e8d8c0", crossandra:   "#e88848",
};

export const PHENO_COLORS = {
  bud:            "#8da0cb",
  flow:           "#e78ac3",
  fruit_dev:      "#fc8d62",
  fruit_mat:      "#66c2a5",
  inflorescence:  "#ffd92f",
  leaf:           "#a6d854",
  senesc:         "#a6761d",
  shoot:          "#4daf4a",
  unknown:        "#666666",
};

/**
 * Returns the hex color for a given crop_type string.
 * Falls back to the broad group key if a specific variety isn't found,
 * then to CROP_COLORS.unknown.
 */
export const cropColor = (cropType) => {
  if (!cropType) return CROP_COLORS.unknown;
  const key = String(cropType).toLowerCase().replace(/ /g, '_');
  if (CROP_COLORS[key]) return CROP_COLORS[key];
  // try broad group (first word)
  const group = key.split('_')[0];
  return CROP_COLORS[group] || CROP_COLORS.unknown;
};

/**
 * Returns the hex color for a given phenology stage string.
 */
export const phenoColor = (stage) => {
  if (!stage) return PHENO_COLORS.unknown;
  return PHENO_COLORS[String(stage).toLowerCase()] || PHENO_COLORS.unknown;
};

/**
 * Returns the public URL for a crop SVG icon, or null if no crop type given.
 */
/**
 * Strips oracle subtype qualifiers (e.g. sugarcane_ratoon → sugarcane,
 * sugarcane_plant → sugarcane) while preserving legitimate multi-word crops
 * (black_gram, green_gram, bitter_gourd, etc.) that exist in CROP_COLORS.
 */
export const normalizeCropType = (cropType) => {
  if (!cropType) return cropType;
  const key = String(cropType).toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
  if (CROP_COLORS[key]) return key;
  const base = key.split('_').slice(0, -1).join('_');
  return (base && CROP_COLORS[base]) ? base : key;
};

export const cropIconUrl = (cropType) => {
  if (!cropType) return null;
  const key = normalizeCropType(cropType);
  return `/images/crop_icons/${key}.svg`;
};

// Stable palette indexed by zone_id slot (z0..z9, plus wrap-around).
// Used to color zone polygons + subzones (clusters) tagged with their zone_id.
export const ZONE_PALETTE = [
  "#e76f51", // 0  — coral
  "#2a9d8f", // 1  — teal
  "#e9c46a", // 2  — sand
  "#264653", // 3  — slate
  "#f4a261", // 4  — amber
  "#8ecae6", // 5  — sky
  "#b56576", // 6  — dusty rose
  "#73d216", // 7  — green
  "#9d4edd", // 8  — violet
  "#ff9f1c", // 9  — orange
];

export const zoneColor = (zoneId) => {
  if (zoneId === null || zoneId === undefined) return "#999999";
  // Accept "z0", "z1", ... or raw integers
  let idx = -1;
  if (typeof zoneId === 'number') idx = zoneId;
  else {
    const m = String(zoneId).match(/(\d+)/);
    if (m) idx = parseInt(m[1], 10);
  }
  if (idx < 0 || Number.isNaN(idx)) return "#999999";
  return ZONE_PALETTE[idx % ZONE_PALETTE.length];
};
