import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvIfPresent() {
  const envPath = ".env";
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvIfPresent();

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const DEALERSHIPS = [
  { dealerName: "Ottawa Auto Sales", email: "ottawaautosales@bridgewarranty.test", password: "ottawaautosales" },
  { dealerName: "Janex Autosales Service", email: "janexautosalesservice@bridgewarranty.test", password: "janexautosalesservice" },
  { dealerName: "Seans Autosales Service", email: "seansautosalesservice@bridgewarranty.test", password: "seansautosalesservice" },
  { dealerName: "Canadian Automall", email: "canadianautomall@bridgewarranty.test", password: "canadianautomall" },
  { dealerName: "Canadas Agha Auto Sales", email: "canadasaghautosales@bridgewarranty.test", password: "canadasaghautosales" },
  { dealerName: "Caron Auto Sales", email: "caronautosales@bridgewarranty.test", password: "caronautosales" },
  { dealerName: "Canadian Auto Sales", email: "canadianautosales@bridgewarranty.test", password: "canadianautosales" },
  { dealerName: "Import Car Centre", email: "importcarcentre@bridgewarranty.test", password: "importcarcentre" },
  { dealerName: "Naya Motors Inc", email: "nayamotorsinc@bridgewarranty.test", password: "nayamotorsinc" },
  { dealerName: "Car Connect", email: "carconnect@bridgewarranty.test", password: "carconnect" },
  { dealerName: "Drive Town Ottawa", email: "drivetownottawa@bridgewarranty.test", password: "drivetownottawa" },
  { dealerName: "Car Canada", email: "carcanada@bridgewarranty.test", password: "carcanada" },
  { dealerName: "Car Club East", email: "carclubeast@bridgewarranty.test", password: "carclubeast" },
  { dealerName: "Envoy Auto Sales", email: "envoyautosales@bridgewarranty.test", password: "envoyautosales" },
  { dealerName: "Eddies Auto Wa", email: "eddiesautowa@bridgewarranty.test", password: "eddiesautowa" },
  { dealerName: "Capital Auto Center", email: "capitalautocenter@bridgewarranty.test", password: "capitalautocenter" },
  { dealerName: "Approval Genie Ottawa", email: "approvalgenieottawa@bridgewarranty.test", password: "approvalgenieottawa" },
  { dealerName: "Auto Agents", email: "autoagents@bridgewarranty.test", password: "autoagents" },
  { dealerName: "Moodys Motors", email: "moodysmotors@bridgewarranty.test", password: "moodysmotors" },
  { dealerName: "Mtc Auto Sales", email: "mtcautosales@bridgewarranty.test", password: "mtcautosales" },
  { dealerName: "Johnys Auto Sales", email: "johnysautosales@bridgewarranty.test", password: "johnysautosales" },
  { dealerName: "Go2 Auto", email: "go2auto@bridgewarranty.test", password: "go2auto" },
  { dealerName: "Gabriels Auto Sales", email: "gabrielsautosales@bridgewarranty.test", password: "gabrielsautosales" },
  { dealerName: "Super Sales Auto", email: "supersalesauto@bridgewarranty.test", password: "supersalesauto" },
  { dealerName: "Mb Auto Sales", email: "mbautosales@bridgewarranty.test", password: "mbautosales" },
  { dealerName: "Ronys Auto Sales", email: "ronysautosales@bridgewarranty.test", password: "ronysautosales" },
  { dealerName: "Az Auto Sales And Services", email: "azautosalesandservices@bridgewarranty.test", password: "azautosalesandservices" },
  { dealerName: "Next Ride Motors", email: "nextridemotors@bridgewarranty.test", password: "nextridemotors" },
  { dealerName: "EasyDrive Canada", email: "easydrivecanada@bridgewarranty.test", password: "easydrivecanada" },
  { dealerName: "Prio Auto Sales", email: "prioautosales@bridgewarranty.test", password: "prioautosales" },
  { dealerName: "Central City", email: "centralcity@bridgewarranty.test", password: "centralcity" },
  { dealerName: "Rev Motors", email: "revmotors@bridgewarranty.test", password: "revmotors" },
  { dealerName: "Streetside Motors", email: "streetsidemotors@bridgewarranty.test", password: "streetsidemotors" },
  { dealerName: "Car City", email: "carcity@bridgewarranty.test", password: "carcity" },
  { dealerName: "Aspire Cars", email: "aspirecars@bridgewarranty.test", password: "aspirecars" },
  { dealerName: "Auto-Choice 417", email: "autochoice417@bridgewarranty.test", password: "autochoice417" },
  { dealerName: "Autoway Sales", email: "autowaysales@bridgewarranty.test", password: "autowaysales" },
  { dealerName: "Maples Motors", email: "maplesmotors@bridgewarranty.test", password: "maplesmotors" },
  { dealerName: "Astra Motors", email: "astramotors@bridgewarranty.test", password: "astramotors" },
  { dealerName: "Ehab's Auto Inc", email: "ehabsautoinc@bridgewarranty.test", password: "ehabsautoinc" },
  { dealerName: "Ready Car", email: "readycar@bridgewarranty.test", password: "readycar" },
  { dealerName: "Panda Auto Sales", email: "pandaautosales@bridgewarranty.test", password: "pandaautosales" },
];

async function ensureAuthUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("exists")) {
      const lookup = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (lookup.error) throw lookup.error;
      const found = (lookup.data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (!found?.id) throw new Error(`User exists but could not be looked up: ${email}`);
      return found.id;
    }
    throw error;
  }

  const userId = data.user?.id;
  if (!userId) throw new Error(`No user id returned for ${email}`);
  return userId;
}

async function ensureDealer(dealerName) {
  const { data: existing, error: existingError } = await supabase
    .from("dealers")
    .select("id")
    .eq("name", dealerName)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("dealers")
    .insert({ name: dealerName, markup_pct: 0 })
    .select("id")
    .single();

  if (createError) throw createError;
  const dealerId = created?.id;
  if (!dealerId) throw new Error(`Failed to create dealer: ${dealerName}`);
  return dealerId;
}

async function upsertProfile(userId, email) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, email, role: "DEALER_ADMIN", is_active: true }, { onConflict: "id" });

  if (error) throw error;
}

async function ensureMembership(dealerId, userId) {
  const { data: existing, error: existingError } = await supabase
    .from("dealer_members")
    .select("id")
    .eq("dealer_id", dealerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("dealer_members")
      .update({ role: "DEALER_ADMIN", status: "ACTIVE" })
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return;
  }

  const { error } = await supabase
    .from("dealer_members")
    .insert({ dealer_id: dealerId, user_id: userId, role: "DEALER_ADMIN", status: "ACTIVE" });

  if (error) throw error;
}

async function main() {
  for (const row of DEALERSHIPS) {
    const dealerName = (row.dealerName ?? "").trim();
    const email = (row.email ?? "").trim().toLowerCase();
    const password = (row.password ?? "").trim();

    if (!dealerName) throw new Error("Missing dealerName");
    if (!email) throw new Error(`Missing email for dealer ${dealerName}`);
    if (!password) throw new Error(`Missing password for dealer ${dealerName}`);

    const userId = await ensureAuthUser(email, password);
    const dealerId = await ensureDealer(dealerName);
    await upsertProfile(userId, email);
    await ensureMembership(dealerId, userId);

    process.stdout.write(`OK: ${dealerName} -> ${email} (userId=${userId}, dealerId=${dealerId})\n`);
  }
}

await main();
