import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const testDriveNotificationEmail = process.env.TEST_DRIVE_NOTIFICATION_EMAIL || "rodrigo.pinto@autenticar.pt";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Autenticar <onboarding@resend.dev>";

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

function isAdminUser(user) {
  const email = String(user?.email || "").toLowerCase();
  const roleFromMeta = String(
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    user?.raw_user_meta_data?.role ||
    user?.raw_app_meta_data?.role ||
    ""
  ).toLowerCase();
  const rolesList = [
    ...(Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : []),
    ...(Array.isArray(user?.raw_app_meta_data?.roles) ? user.raw_app_meta_data.roles : [])
  ].map((role) => String(role).toLowerCase());
  const configuredAdmins = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return roleFromMeta === "admin" || rolesList.includes("admin") || configuredAdmins.includes(email);
}

async function getAdminContext(authHeader) {
  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("Sessão inválida. Inicia sessão novamente.");
    error.statusCode = 401;
    throw error;
  }

  assertSupabaseConfigured();

  const token = authHeader.slice("Bearer ".length).trim();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user || !isAdminUser(userData.user)) {
    const error = new Error("Acesso negado: apenas admins podem gerir carros.");
    error.statusCode = 403;
    throw error;
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });

  return { token, user: userData.user, userClient };
}

function slugify(value) {
  return sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function uploadImagesToFolder(userClient, images, folder) {
  const imageUrls = [];
  const safeImages = Array.isArray(images) ? images : [];

  for (const image of safeImages) {
    if (!image?.base64DataUrl || !image?.fileName) continue;

    const match = image.base64DataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) continue;

    const mimeType = match[1];
    const base64 = match[2];
    const bytes = Buffer.from(base64, "base64");
    const ext = (mimeType.split("/")[1] || "jpg").toLowerCase();
    const uploadPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error: uploadError } = await userClient.storage
      .from("car-photos")
      .upload(uploadPath, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      const error = new Error(`Erro no upload de imagem: ${uploadError.message}`);
      error.statusCode = 400;
      throw error;
    }

    const { data: publicData } = userClient.storage.from("car-photos").getPublicUrl(uploadPath);
    if (publicData?.publicUrl) imageUrls.push(publicData.publicUrl);
  }

  return imageUrls;
}

async function uploadCarImages(userClient, images) {
  return uploadImagesToFolder(userClient, images, "cars");
}

async function uploadPostImages(userClient, images) {
  return uploadImagesToFolder(userClient, images, "posts");
}

async function fetchListingPage(url) {
  const pageResp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AutenticarImporter/1.0)"
    }
  });
  if (!pageResp.ok) {
    const error = new Error(`Não foi possível ler a página (${pageResp.status}).`);
    error.statusCode = 400;
    throw error;
  }
  return pageResp.text();
}

function getImportSource(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (host === "autenticar.pt" || host === "www.autenticar.pt") {
    return { key: "autenticar", label: "autenticar.pt" };
  }
  if (host === "viaturas.alonsosebranco.pt") {
    return { key: "alonsosebranco", label: "viaturas.alonsosebranco.pt" };
  }
  return null;
}

function getAllowedImportSourcesText() {
  return "autenticar.pt ou viaturas.alonsosebranco.pt";
}

async function uploadRemoteImages(userClient, imageCandidates) {
  const imageUrls = [];
  for (const imageUrl of imageCandidates || []) {
    try {
      const imgResp = await fetch(imageUrl);
      if (!imgResp.ok) continue;
      const arr = await imgResp.arrayBuffer();
      const bytes = Buffer.from(arr);
      const contentType = imgResp.headers.get("content-type") || "image/jpeg";
      const ext = (contentType.split("/")[1] || "jpg").split(";")[0].toLowerCase();
      const path = `cars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const { error: uploadError } = await userClient.storage
        .from("car-photos")
        .upload(path, bytes, { contentType, upsert: false });
      if (uploadError) continue;
      const { data: publicData } = userClient.storage.from("car-photos").getPublicUrl(path);
      if (publicData?.publicUrl) imageUrls.push(publicData.publicUrl);
    } catch {
      // Skip failed image and continue importing
    }
  }
  return imageUrls;
}

function validateCarPayload(car, categories, imageUrls = []) {
  if (!car || typeof car !== "object") {
    return "Dados do carro em falta.";
  }

  const requiredTextFields = [
    "title",
    "brand",
    "model",
    "registration_date",
    "fuel",
    "observations",
    "segment",
    "power",
    "origin",
    "engine_displacement",
    "transmission",
    "color",
    "condition",
    "warranty"
  ];

  for (const field of requiredTextFields) {
    if (!sanitizeText(car[field])) {
      return "Preenche todos os campos obrigatórios.";
    }
  }

  const requiredNumericFields = ["mileage", "price_eur", "seats", "doors"];
  for (const field of requiredNumericFields) {
    const value = Number(car[field]);
    if (!Number.isFinite(value) || value <= 0) {
      return "Preenche todos os campos obrigatórios.";
    }
  }

  if (!Array.isArray(categories) || categories.length === 0) {
    return "Seleciona pelo menos uma categoria.";
  }

  if (!Array.isArray(car.extras) || car.extras.length === 0) {
    return "Adiciona pelo menos um extra.";
  }

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return "Adiciona pelo menos uma imagem.";
  }

  return null;
}

function validatePostPayload(post, imageUrls = []) {
  if (!post || typeof post !== "object") {
    return "Dados do post em falta.";
  }

  if (!sanitizeText(post.title) || !sanitizeText(post.excerpt) || !sanitizeText(post.content)) {
    return "Preenche titulo, resumo e conteudo do post.";
  }

  const category = sanitizeText(post.category).toLowerCase();
  if (!["guias", "mercado", "noticias", "manutencao"].includes(category)) {
    return "Seleciona uma categoria valida para o post.";
  }

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return "Adiciona pelo menos uma imagem ao post.";
  }

  return null;
}

function normalizePostPayload(post, imageUrls, existingPost = null) {
  const title = sanitizeText(post.title);
  const excerpt = sanitizeText(post.excerpt);
  const content = String(post.content || "").trim();
  const category = sanitizeText(post.category).toLowerCase() || "noticias";
  const requestedSlug = slugify(post.slug || title);
  const existingImages = Array.isArray(existingPost?.image_urls) ? existingPost.image_urls.filter(Boolean) : [];
  const finalImages = Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls : existingImages;
  const coverImageUrl = sanitizeText(post.cover_image_url) || finalImages[0] || sanitizeText(existingPost?.cover_image_url);

  return {
    title,
    slug: requestedSlug,
    excerpt,
    content,
    category,
    featured: Boolean(post.featured),
    published_at: post.published_at ? new Date(post.published_at).toISOString() : (existingPost?.published_at || new Date().toISOString()),
    cover_image_url: coverImageUrl || null,
    image_urls: finalImages,
    updated_at: new Date().toISOString()
  };
}

async function ensureUniquePostSlug(client, slug, currentPostId = "") {
  let candidate = slug || `post-${Date.now()}`;
  let suffix = 2;

  for (;;) {
    const { data, error } = await client
      .from("posts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      const wrappedError = new Error(error.message);
      wrappedError.statusCode = 400;
      throw wrappedError;
    }

    if (!data || String(data.id || "") === String(currentPostId || "")) {
      return candidate;
    }

    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
}

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBrandName(value) {
  return sanitizeText(value).toLowerCase();
}

async function resolveBrandId(userClient, brandName) {
  const name = sanitizeText(brandName);
  const normalizedName = normalizeBrandName(name);
  if (!normalizedName) return null;

  const { data: existingBrand, error: selectError } = await userClient
    .from("brands")
    .select("id")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (selectError) {
    const brandError = new Error(`Erro ao procurar marca: ${selectError.message}`);
    brandError.statusCode = 400;
    throw brandError;
  }

  if (existingBrand?.id) {
    return existingBrand.id;
  }

  const { data: createdBrand, error: insertError } = await userClient
    .from("brands")
    .insert({ name, normalized_name: normalizedName })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: racedBrand } = await userClient
        .from("brands")
        .select("id")
        .eq("normalized_name", normalizedName)
        .maybeSingle();
      if (racedBrand?.id) return racedBrand.id;
    }

    const brandError = new Error(`Erro ao criar marca: ${insertError.message}`);
    brandError.statusCode = 400;
    throw brandError;
  }

  return createdBrand?.id || null;
}

function parsePriceToNumber(value) {
  const raw = sanitizeText(value);
  if (!raw) return 0;
  const normalized = raw
    .replace(/[^\d,.\s]/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function extractFirstMatch(input, patterns) {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return sanitizeText(match[1]);
  }
  return "";
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&atilde;/gi, "ã")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ordm;/gi, "º")
    .replace(/&sup3;/gi, "³");
}

function stripHtmlTags(value) {
  return sanitizeText(decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")));
}

function parseInteger(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

function normalizeIsoDate(value) {
  const raw = sanitizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return raw;
}

function isTodayOrFutureDate(value) {
  const normalized = normalizeIsoDate(value);
  if (!normalized) return false;
  const selected = new Date(`${normalized}T00:00:00Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return selected.getTime() >= todayUtc.getTime();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTestDriveEmailStatus() {
  const missingKeys = [
    !resendApiKey ? "RESEND_API_KEY" : null,
    !resendFromEmail ? "RESEND_FROM_EMAIL" : null,
    !testDriveNotificationEmail ? "TEST_DRIVE_NOTIFICATION_EMAIL" : null
  ].filter(Boolean);

  return {
    configured: missingKeys.length === 0,
    provider: "resend",
    fromConfigured: Boolean(resendFromEmail),
    toConfigured: Boolean(testDriveNotificationEmail),
    missingKeys
  };
}

async function sendTestDriveNotificationEmail({ carTitle, requestedDate, customerName, customerEmail, customerPhone }) {
  const emailStatus = getTestDriveEmailStatus();
  if (!emailStatus.configured) {
    const missingKeys = emailStatus.missingKeys;
    console.warn(`Test drive notification skipped: missing ${missingKeys.join(", ")}.`);
    return {
      ok: false,
      skipped: true,
      reason: "missing_config",
      missingKeys
    };
  }

  const formattedDate = new Date(`${requestedDate}T00:00:00`)
    .toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

  const safeCarTitle = escapeHtml(carTitle);
  const safeCustomerName = escapeHtml(customerName);
  const safeCustomerEmail = escapeHtml(customerEmail);
  const safeCustomerPhone = escapeHtml(customerPhone);
  const safeRequestedDate = escapeHtml(formattedDate);

  const subject = `Novo pedido de test drive: ${carTitle}`;
  const text = [
    "Recebeste um novo pedido de test drive.",
    "",
    `Viatura: ${carTitle}`,
    `Data pretendida: ${formattedDate}`,
    `Nome: ${customerName}`,
    `Email: ${customerEmail}`,
    `Telemovel: ${customerPhone}`
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 16px">Novo pedido de test drive</h2>
      <p style="margin:0 0 16px">Entrou um novo pedido de contacto para test drive.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        <tr><td style="padding:8px 0;font-weight:700">Viatura</td><td style="padding:8px 0">${safeCarTitle}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Data pretendida</td><td style="padding:8px 0">${safeRequestedDate}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Nome</td><td style="padding:8px 0">${safeCustomerName}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Email</td><td style="padding:8px 0"><a href="mailto:${safeCustomerEmail}">${safeCustomerEmail}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Telemovel</td><td style="padding:8px 0"><a href="tel:${safeCustomerPhone}">${safeCustomerPhone}</a></td></tr>
      </table>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [testDriveNotificationEmail],
      reply_to: customerEmail,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend API error (${response.status}): ${details}`);
  }

  const result = await response.json();
  return {
    ok: true,
    skipped: false,
    provider: "resend",
    id: result?.id || null
  };
}

function extractListingDetails(html) {
  const details = {};
  const rowPattern = /<td[^>]*class=["'][^"']*label-td[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["'][^"']*heading-font[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const label = stripHtmlTags(match[1]).replace(/:$/, "");
    const value = stripHtmlTags(match[2]);
    if (label && value) details[label] = value;
  }

  const plateMatch = html.match(/Matr[ií]cula:\s*([^<\s]+)/i);
  if (plateMatch?.[1]) details["Matrícula"] = stripHtmlTags(plateMatch[1]);

  return details;
}

function extractListingExtras(html) {
  const sectionMatch = html.match(/<div[^>]*class=["'][^"']*stm-single-listing-car-features[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const sectionHtml = sectionMatch?.[1] || "";
  if (!sectionHtml) return [];

  const extras = [];
  for (const match of sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const value = stripHtmlTags(match[1]);
    if (value && !extras.includes(value)) extras.push(value);
  }
  return extras;
}

function extractListingGalleryImages(html, absoluteUrl) {
  const images = [];
  const gallerySection = html.match(/<div[^>]*class=["'][^"']*stm-big-car-gallery[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*stm-thumbs-car-gallery/i)?.[1] || "";
  const sourceHtml = gallerySection || html;

  for (const match of sourceHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*stm_fancybox[^"']*["'][^>]*rel=["']stm-car-gallery["'][^>]*>/gi)) {
    const url = absoluteUrl(match[1]);
    if (url && !images.includes(url)) images.push(url);
  }

  return images;
}

function mergeParsedCar(baseCar, overrides = {}) {
  const merged = { ...baseCar };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value == null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) merged[key] = trimmed;
      continue;
    }
    if (typeof value === "number") {
      if (Number.isFinite(value)) merged[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function normalizeOrigin(value) {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("nacional")) return "Nacional";
  if (normalized.includes("import")) return "Importado";
  return null;
}

function normalizePositiveInteger(value) {
  const parsed = parseInteger(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getNestedName(value) {
  if (value && typeof value === "object") return sanitizeText(value.Nome || value.Name || value.nome);
  return sanitizeText(value);
}

function normalizeRegistrationDateFromYearMonth(year, month) {
  const cleanYear = parseInteger(year);
  const cleanMonth = parseInteger(month);
  if (!cleanYear) return "";
  if (!cleanMonth || cleanMonth < 1 || cleanMonth > 12) return String(cleanYear);
  return `${String(cleanMonth).padStart(2, "0")}/${cleanYear}`;
}

function normalizeWarranty(value) {
  const raw = getNestedName(value) || sanitizeText(value);
  if (raw) return raw;
  return "18 meses";
}

function extractAlonsoVehicleId(sourceUrl) {
  const urlObj = new URL(sourceUrl);
  const parts = urlObj.pathname.split("/").map((part) => part.trim()).filter(Boolean);
  const id = parts.slice().reverse().find((part) => /^\d+$/.test(part));
  return id || "";
}

async function fetchAlonsoEasydataListing(sourceUrl) {
  const urlObj = new URL(sourceUrl);
  const hostname = urlObj.hostname.toLowerCase();
  const vehicleId = extractAlonsoVehicleId(sourceUrl);

  if (!vehicleId) {
    const error = new Error("Não foi possível encontrar o ID da viatura no URL.");
    error.statusCode = 400;
    throw error;
  }

  const assetsBase = `https://multidealer.easysite.pt/assets/${hostname}`;
  const [envResp, infoResp] = await Promise.all([
    fetch(`${assetsBase}/env`),
    fetch(`${assetsBase}/info.json`)
  ]);

  if (!envResp.ok || !infoResp.ok) {
    const error = new Error("Não foi possível ler a configuração do site Alonso & Branco.");
    error.statusCode = 400;
    throw error;
  }

  const env = await envResp.json();
  const info = await infoResp.json();
  const token = sanitizeText(env.REACT_APP_TOKEN_API);
  const dealerId = info?.Stand?.Anunciante;
  const sourceType = info?.Stand?.Easymanager ? "easymanager" : "easydata";

  if (!token || !dealerId) {
    const error = new Error("Configuração do site Alonso & Branco incompleta.");
    error.statusCode = 400;
    throw error;
  }

  const apiUrl = new URL(`https://ws.easydata.pt/v1/${sourceType}/carros/GetListaDetalhesViatura/`);
  apiUrl.searchParams.set("dealer_id", String(dealerId));
  const listingResp = await fetch(apiUrl, { headers: { token } });

  if (!listingResp.ok) {
    const error = new Error(`Não foi possível ler as viaturas Alonso & Branco (${listingResp.status}).`);
    error.statusCode = 400;
    throw error;
  }

  const vehicles = await listingResp.json();
  const vehicle = Array.isArray(vehicles)
    ? vehicles.find((item) => String(item?.CodViatura || "") === vehicleId)
    : null;

  if (!vehicle) {
    const error = new Error("Viatura Alonso & Branco não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  return vehicle;
}

function parseAlonsoEasydataListing(vehicle) {
  const brand = getNestedName(vehicle.Marca) || "N/D";
  const modelParts = [
    getNestedName(vehicle.Modelo),
    sanitizeText(vehicle.Motorizacao),
    sanitizeText(vehicle.VersaoAlternatica)
  ].filter(Boolean);
  const model = modelParts.join(" ").trim() || "N/D";
  const title = [brand, model].filter(Boolean).join(" ").trim() || "Viatura importada";
  const extras = sanitizeText(vehicle.ExtrasSoltos)
    .split(",")
    .map((item) => sanitizeText(item))
    .filter(Boolean);
  const imageCandidates = Array.isArray(vehicle.Ficheiros)
    ? vehicle.Ficheiros
        .slice()
        .sort((a, b) => Number(a?.Ordenador || 0) - Number(b?.Ordenador || 0))
        .map((file) => sanitizeText(file?.Ficheiro))
        .filter(Boolean)
    : [];
  const rawObservation = stripHtmlTags(vehicle.Obs || "");
  const details = {
    Marca: brand,
    Modelo: model,
    Quilómetros: sanitizeText(vehicle.Km),
    Combustível: getNestedName(vehicle.Combustivel),
    "Ano de Registo": normalizeRegistrationDateFromYearMonth(vehicle.Ano, vehicle.Mes),
    Caixa: getNestedName(vehicle.Transmissao),
    Cor: getNestedName(vehicle.Cor),
    Portas: getNestedName(vehicle.Porta),
    Lugares: getNestedName(vehicle.Lugares),
    CV: vehicle.Potencia ? `${vehicle.Potencia} CV` : "",
    Carroçaria: getNestedName(vehicle.Tipo),
    Origem: vehicle.Importado ? "Importado" : "Nacional",
    Estado: getNestedName(vehicle.Estado),
    Garantia: normalizeWarranty(vehicle.Garantia),
    Cilindrada: vehicle.Cilindrada ? `${vehicle.Cilindrada} cc` : "",
    Matrícula: sanitizeText(vehicle.Matricula)
  };

  return {
    title,
    brand,
    model,
    registration_date: details["Ano de Registo"] || "N/D",
    mileage: parseInteger(vehicle.Km) || 0,
    fuel: details["Combustível"] || "N/D",
    price_eur: parsePriceToNumber(vehicle.PrecoPromo || vehicle.Preco),
    observations: rawObservation || null,
    seats: normalizePositiveInteger(details.Lugares),
    segment: details.Carroçaria || null,
    power: vehicle.Potencia ? `${String(vehicle.Potencia).replace(/[^\d]/g, "")} CV` : null,
    origin: normalizeOrigin(details.Origem) || null,
    engine_displacement: details.Cilindrada || null,
    transmission: details.Caixa || null,
    color: details.Cor || null,
    doors: normalizePositiveInteger(details.Portas),
    condition: details.Estado || null,
    warranty: details.Garantia || null,
    registration_plate: details.Matrícula || null,
    extras,
    details,
    imageCandidates: imageCandidates.slice(0, 24)
  };
}

async function parseListingFromUrl(parsedUrl) {
  const source = getImportSource(parsedUrl);
  if (!source) {
    const error = new Error(`Apenas links de ${getAllowedImportSourcesText()} são permitidos.`);
    error.statusCode = 400;
    throw error;
  }

  if (source.key === "alonsosebranco") {
    const vehicle = await fetchAlonsoEasydataListing(parsedUrl.toString());
    return parseAlonsoEasydataListing(vehicle);
  }

  const html = await fetchListingPage(parsedUrl.toString());
  return parseAutenticarListing(html, parsedUrl.toString());
}

function parseAutenticarListing(html, sourceUrl) {
  const metaMatches = [...html.matchAll(/<meta\s+[^>]*>/gi)];
  const metas = new Map();

  for (const tag of metaMatches) {
    const full = tag[0];
    const name = extractFirstMatch(full, [/\bproperty=["']([^"']+)["']/i, /\bname=["']([^"']+)["']/i]).toLowerCase();
    const content = extractFirstMatch(full, [/\bcontent=["']([^"']*)["']/i]);
    if (name && content && !metas.has(name)) metas.set(name, content);
  }

  const pageTitle = extractFirstMatch(html, [/<title[^>]*>([^<]+)<\/title>/i]);
  const ogTitle = metas.get("og:title") || pageTitle;
  const title = sanitizeText(ogTitle.split("|")[0]);
  const description = metas.get("og:description") || metas.get("description") || "";

  const urlObj = new URL(sourceUrl);
  const absoluteUrl = (value) => {
    try {
      return new URL(value, `${urlObj.protocol}//${urlObj.host}`).toString();
    } catch {
      return "";
    }
  };

  const imageSet = new Set();
  const galleryImages = extractListingGalleryImages(html, absoluteUrl);
  for (const imageUrl of galleryImages) {
    imageSet.add(imageUrl);
  }
  const ogImage = metas.get("og:image");
  if (ogImage) imageSet.add(absoluteUrl(ogImage));

  for (const match of html.matchAll(/<meta\s+[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) imageSet.add(absoluteUrl(match[1]));
  }
  for (const match of html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) {
    if (match[1]) imageSet.add(absoluteUrl(match[1]));
  }
  for (const match of html.matchAll(/"image"\s*:\s*\[([^\]]+)\]/gi)) {
    const chunk = match[1] || "";
    for (const src of chunk.match(/"([^"]+)"/g) || []) {
      const clean = src.replace(/"/g, "");
      if (clean) imageSet.add(absoluteUrl(clean));
    }
  }

  const textOnly = sanitizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
  );

  const details = extractListingDetails(html);
  const extras = extractListingExtras(html);
  const heroPrice = extractFirstMatch(html, [
    /stm-listing-single-price-title[\s\S]*?<div[^>]*class=["']price["'][^>]*>\s*€?\s*([0-9.\s,]+)\s*<\/div>/i,
    /<div[^>]*class=["']price["'][^>]*>\s*€?\s*([0-9.\s,]+)\s*<\/div>/i,
    /Preço do automóvel[\s\S]*?value=["']([0-9.\s,]+)["']/i
  ]);

  const mileageRaw = details["Quilómetros"] || extractFirstMatch(textOnly, [/(?:Quil[oó]metros|Km)\s*([0-9.\s,]{1,20})/i]);
  const mileage = Number.parseInt((mileageRaw || "").replace(/[^\d]/g, ""), 10);
  const fuel = details["Combustível"] || extractFirstMatch(textOnly, [/(?:Combust[ií]vel)\s*([A-Za-zÀ-ÿ\-\s]{2,30})/i]) || "N/D";
  const registrationDate = details["Ano de Registo"] || extractFirstMatch(textOnly, [/(?:Registo)\s*([A-Za-zÀ-ÿ0-9.\-\/\s]{3,25})/i]) || "N/D";
  const transmission = details["Caixa"] || extractFirstMatch(textOnly, [/(?:Transmiss[aã]o)\s*([A-Za-zÀ-ÿ0-9\-\s]{2,40})/i]);
  const color = details["Cor"] || extractFirstMatch(textOnly, [/(?:Cor)\s*([A-Za-zÀ-ÿ\-\s]{2,30})/i]);
  const doorsRaw = details["Portas"] || "";
  const seatsRaw = details["Lugares"] || extractFirstMatch(textOnly, [/(?:Lugares)\s*([0-9]{1,2})/i]);
  const power = details["CV"] || extractFirstMatch(textOnly, [/(?:Pot[eê]ncia)\s*([0-9]{1,4}\s*Cv)/i]);
  const segment = details["Carroçaria"] || extractFirstMatch(textOnly, [/(?:Segmento)\s*([A-Za-zÀ-ÿ\-\s]{2,30})/i]);
  const origin = normalizeOrigin(details["Origem"]) || normalizeOrigin(extractFirstMatch(textOnly, [/\b(Nacional|Importad[oa])\b/i]));
  const condition = details["Estado"] || extractFirstMatch(textOnly, [/(?:Estado)\s*(Novo|Usado)/i]);
  const warranty = (details["Garantia"] || extractFirstMatch(textOnly, [/(?:Garantia)\s*(Sim|N[aã]o)/i])).replace("Nao", "Não");
  const displacement = details["Cilindrada"] || extractFirstMatch(textOnly, [/(?:Cilindrada)\s*([0-9]{2,5}\s*Cc)/i]);

  const metaPrice = metas.get("product:price:amount") || "";
  const textPrice = extractFirstMatch(textOnly, [/(?:preço do automóvel|preço)\s*([0-9][0-9.\s,]{2,})\s*€/i, /€\s*([0-9][0-9.\s,]{2,})/i]);
  const price = parsePriceToNumber(heroPrice || metaPrice || textPrice);

  const detailBrand = details["Marca"] || "";
  const detailModel = details["Modelo"] || "";
  const rawName = title || [detailBrand, detailModel].filter(Boolean).join(" ") || urlObj.pathname.split("/").filter(Boolean).pop() || "Viatura";
  const normalizedName = rawName.replace(/[-_]+/g, " ").trim();
  const parts = normalizedName.split(/\s+/);
  const brand = detailBrand || parts[0] || "N/D";
  const model = detailModel || parts.slice(1).join(" ") || parts[0] || "N/D";

  return {
    title: title || normalizedName,
    brand,
    model,
    registration_date: registrationDate,
    mileage: Number.isFinite(mileage) ? mileage : 0,
    fuel,
    price_eur: price,
    observations: description || null,
    seats: normalizePositiveInteger(seatsRaw),
    segment: segment || null,
    power: power ? `${String(power).replace(/[^\d]/g, "")} CV`.trim() : null,
    origin: origin || null,
    engine_displacement: displacement || null,
    transmission: transmission || null,
    color: color || null,
    doors: normalizePositiveInteger(doorsRaw),
    condition: condition || null,
    warranty: warranty || null,
    registration_plate: details["Matrícula"] || null,
    extras,
    details,
    imageCandidates: [...imageSet].filter(Boolean).slice(0, 24)
  };
}

function assertSupabaseConfigured() {
  if (!supabase) {
    const error = new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required. Create .env from .env.example.");
    error.statusCode = 500;
    throw error;
  }
}

app.use(express.json({ limit: "25mb" }));

// Avoid stale assets/pages when switching between file:// and localhost views
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.options("*", (_req, res) => {
  res.sendStatus(204);
});

app.use(express.static(__dirname));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/test-drive-email/status", (_req, res) => {
  res.json({
    ok: true,
    email: getTestDriveEmailStatus()
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, message: "Nome, email e password sao obrigatorios." });
  }

  if (password.length < 8) {
    return res.status(400).json({ ok: false, message: "A password deve ter pelo menos 8 caracteres." });
  }

  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() }
      }
    });

    if (error) {
      return res.status(error.status || 400).json({ ok: false, message: error.message });
    }

    const needsEmailConfirmation = !data.session;

    return res.status(201).json({
      ok: true,
      message: needsEmailConfirmation
        ? "Conta criada. Confirme o email para concluir o registo."
        : "Conta criada com sucesso.",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at
          }
        : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao criar conta.", error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Email e password sao obrigatorios." });
  }

  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return res.status(error.status || 401).json({ ok: false, message: error.message });
    }

    return res.json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        created_at: data.user?.created_at,
        is_admin: isAdminUser(data.user)
      },
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          }
        : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao iniciar sessao.", error: error.message });
  }
});

app.get("/api/auth/session-info", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token em falta." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ ok: false, message: "Token inválido." });
  }

  try {
    assertSupabaseConfigured();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ ok: false, message: "Sessão inválida." });
    }

    return res.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        is_admin: isAdminUser(data.user)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao validar sessão.", error: error.message });
  }
});

app.get("/api/db/health", (_req, res) => {
  (async () => {
    try {
      assertSupabaseConfigured();

      const { error } = await supabase
        .from("cars")
        .select("id", { head: true, count: "exact" })
        .limit(1);

      if (error) {
        return res.status(500).json({ ok: false, message: error.message });
      }

      return res.json({ ok: true, serverTime: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  })();
});

app.get("/api/cars", async (req, res) => {
  const category = String(req.query.category || "").trim();
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "24"), 10) || 24, 1), 100);

  try {
    assertSupabaseConfigured();

    let query = supabase
      .from("cars")
      .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data, error } = await (category ? query.contains("categories", [category]) : query);
    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    let cars = data || [];

    // Backward-compatibility fallback: if nothing found by categories[],
    // try legacy extras format "categoria:<slug>".
    if (category && cars.length === 0) {
      const legacy = await supabase
        .from("cars")
        .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at")
        // `extras` is jsonb, so the contains filter must use a JSON literal.
        .filter("extras", "cs", JSON.stringify([`categoria:${category}`]))
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!legacy.error && Array.isArray(legacy.data)) {
        cars = legacy.data;
      }
    }

    return res.json({ ok: true, cars });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar carros.", error: error.message });
  }
});

app.get("/api/brands", async (_req, res) => {
  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("brands")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      return res.status(500).json({ ok: false, message: "Erro ao listar marcas.", error: error.message });
    }

    return res.json({ ok: true, brands: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar marcas.", error: error.message });
  }
});

app.get("/api/cars/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({ ok: false, message: "ID do carro em falta." });
  }

  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("cars")
      .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at,observations,seats,segment,power,origin,engine_displacement,transmission,color,doors,condition,warranty")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, message: "Carro não encontrado." });
    }

    return res.json({ ok: true, car: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao carregar o carro.", error: error.message });
  }
});

app.get("/api/posts", async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "24"), 10) || 24, 1), 100);
  const category = sanitizeText(req.query.category).toLowerCase();

  try {
    assertSupabaseConfigured();

    let query = supabase
      .from("posts")
      .select("id,title,slug,excerpt,content,category,cover_image_url,image_urls,featured,published_at,created_at,updated_at")
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true, posts: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar posts.", error: error.message });
  }
});

app.get("/api/posts/:slug", async (req, res) => {
  const slug = slugify(req.params.slug);

  if (!slug) {
    return res.status(400).json({ ok: false, message: "Slug do post em falta." });
  }

  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("posts")
      .select("id,title,slug,excerpt,content,category,cover_image_url,image_urls,featured,published_at,created_at,updated_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, message: "Post nao encontrado." });
    }

    return res.json({ ok: true, post: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao carregar o post.", error: error.message });
  }
});

app.post("/api/test-drive-requests", async (req, res) => {
  const carId = sanitizeText(req.body?.carId);
  const requestedDate = normalizeIsoDate(req.body?.requestedDate);
  const customerName = sanitizeText(req.body?.name);
  const customerEmail = sanitizeText(req.body?.email).toLowerCase();
  const customerPhone = sanitizeText(req.body?.phone);

  if (!carId || !requestedDate || !customerName || !customerEmail || !customerPhone) {
    return res.status(400).json({ ok: false, message: "Data, nome, email e telemovel sao obrigatorios." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ ok: false, message: "Indica um email valido." });
  }

  if (customerPhone.replace(/[^\d+]/g, "").length < 9) {
    return res.status(400).json({ ok: false, message: "Indica um telemovel valido." });
  }

  if (!isTodayOrFutureDate(requestedDate)) {
    return res.status(400).json({ ok: false, message: "Escolhe uma data valida para o test drive." });
  }

  try {
    assertSupabaseConfigured();

    const { data: car, error: carError } = await supabase
      .from("cars")
      .select("id,title,brand,model")
      .eq("id", carId)
      .maybeSingle();

    if (carError) {
      return res.status(400).json({ ok: false, message: carError.message });
    }

    if (!car) {
      return res.status(404).json({ ok: false, message: "Viatura nao encontrada." });
    }

    const carTitle = sanitizeText(car.title) || sanitizeText(`${car.brand || ""} ${car.model || ""}`) || "Viatura";

    const { error } = await supabase
      .from("test_drive_requests")
      .insert({
        car_id: car.id,
        car_title: carTitle,
        requested_date: requestedDate,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone
      });

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    let notificationResult = { ok: false, skipped: true, reason: "unknown" };
    try {
      notificationResult = await sendTestDriveNotificationEmail({
        carTitle,
        requestedDate,
        customerName,
        customerEmail,
        customerPhone
      });
    } catch (notificationError) {
      console.error("Failed to send test drive notification email:", notificationError);
      notificationResult = {
        ok: false,
        skipped: false,
        reason: "send_failed",
        message: notificationError.message
      };
    }

    const warning = notificationResult.ok
      ? ""
      : notificationResult.reason === "missing_config"
        ? `Pedido guardado, mas o email nao foi enviado porque faltam variaveis: ${(notificationResult.missingKeys || []).join(", ")}.`
        : "Pedido guardado, mas o email de notificacao falhou.";

    return res.status(201).json({
      ok: true,
      message: "Pedido de test drive registado com sucesso.",
      warning,
      notification: notificationResult
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao registar o pedido de test drive.", error: error.message });
  }
});

app.get("/api/admin/posts", async (req, res) => {
  const authHeader = req.headers.authorization || "";

  try {
    const { userClient } = await getAdminContext(authHeader);
    const { data, error } = await userClient
      .from("posts")
      .select("id,title,slug,excerpt,category,cover_image_url,image_urls,featured,published_at,created_at")
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false });

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true, posts: data || [] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.post("/api/admin/posts", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const post = req.body?.post && typeof req.body.post === "object" ? req.body.post : null;
  const images = Array.isArray(req.body?.images) ? req.body.images : [];

  if (!post) {
    return res.status(400).json({ ok: false, message: "Dados do post em falta." });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);
    const uploadedImages = await uploadPostImages(userClient, images);
    const payload = normalizePostPayload(post, uploadedImages);
    payload.slug = await ensureUniquePostSlug(userClient, payload.slug);

    const validationError = validatePostPayload(payload, payload.image_urls);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
    }

    const { data, error } = await userClient
      .from("posts")
      .insert(payload)
      .select("id,title,slug,excerpt,category,cover_image_url,image_urls,featured,published_at,created_at")
      .single();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.status(201).json({ ok: true, post: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.delete("/api/admin/posts/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({ ok: false, message: "ID do post em falta." });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);
    const { error } = await userClient.from("posts").delete().eq("id", id);

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.put("/api/admin/cars/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const id = String(req.params.id || "").trim();
  const { car, images, categories } = req.body || {};

  if (!id) {
    return res.status(400).json({ ok: false, message: "ID do carro em falta." });
  }

  if (!car || typeof car !== "object") {
    return res.status(400).json({ ok: false, message: "Dados do carro em falta." });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);

    const { data: existingCar, error: existingError } = await userClient
      .from("cars")
      .select("id,image_urls")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return res.status(400).json({ ok: false, message: existingError.message });
    }

    if (!existingCar) {
      return res.status(404).json({ ok: false, message: "Carro não encontrado." });
    }

    const newImageUrls = await uploadCarImages(userClient, images);
    const payload = {
      ...car,
      categories: Array.isArray(categories) ? categories : [],
      image_urls: newImageUrls.length > 0 ? newImageUrls : (Array.isArray(existingCar.image_urls) ? existingCar.image_urls : [])
    };

    const validationError = validateCarPayload(payload, payload.categories, payload.image_urls);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
    }

    payload.brand_id = await resolveBrandId(userClient, payload.brand);

    const { data, error } = await userClient
      .from("cars")
      .update(payload)
      .eq("id", id)
      .select("id,title,brand,brand_id,model,price_eur,image_urls,categories,created_at")
      .single();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true, car: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.delete("/api/admin/cars/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({ ok: false, message: "ID do carro em falta." });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);
    const { error } = await userClient.from("cars").delete().eq("id", id);

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.post("/api/admin/import-car", async (req, res) => {
  const { car, images, categories } = req.body || {};
  const authHeader = req.headers.authorization || "";

  if (!car || typeof car !== "object") {
    return res.status(400).json({ ok: false, message: "Dados do carro em falta." });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);
    const imageUrls = await uploadCarImages(userClient, images);

    const payload = {
      ...car,
      categories: Array.isArray(categories) ? categories : [],
      image_urls: imageUrls
    };

    const validationError = validateCarPayload(payload, payload.categories, payload.image_urls);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
    }

    payload.brand_id = await resolveBrandId(userClient, payload.brand);

    const { data, error } = await userClient
      .from("cars")
      .insert(payload)
      .select("id, title, brand, brand_id, model, price_eur, image_urls")
      .single();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.status(201).json({ ok: true, car: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : "Erro ao importar carro.",
      error: error.statusCode ? undefined : error.message
    });
  }
});

app.post("/api/admin/preview-import-from-url", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const listingUrl = String(req.body?.url || "").trim();

  if (!listingUrl) {
    return res.status(400).json({ ok: false, message: "URL em falta." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(listingUrl);
  } catch {
    return res.status(400).json({ ok: false, message: "URL inválida." });
  }

  if (!getImportSource(parsedUrl)) {
    return res.status(400).json({ ok: false, message: `Apenas links de ${getAllowedImportSourcesText()} são permitidos.` });
  }

  try {
    await getAdminContext(authHeader);
    const parsed = await parseListingFromUrl(parsedUrl);
    return res.json({
      ok: true,
      car: {
        title: parsed.title || "",
        brand: parsed.brand || "",
        model: parsed.model || "",
        registration_date: parsed.registration_date || "",
        mileage: Number.isFinite(parsed.mileage) ? parsed.mileage : null,
        fuel: parsed.fuel || "",
        price_eur: Number.isFinite(parsed.price_eur) ? parsed.price_eur : null,
        observations: parsed.observations || "",
        seats: parsed.seats,
        segment: parsed.segment || "",
        power: parsed.power || "",
        origin: parsed.origin || "",
        engine_displacement: parsed.engine_displacement || "",
        transmission: parsed.transmission || "",
        color: parsed.color || "",
        doors: parsed.doors,
        condition: parsed.condition || "",
        warranty: parsed.warranty || "",
        extras: Array.isArray(parsed.extras) ? parsed.extras : [],
        registration_plate: parsed.registration_plate || "",
        details: parsed.details || {},
        image_urls: parsed.imageCandidates || []
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message, error: error.statusCode ? undefined : error.message });
  }
});

app.post("/api/admin/import-from-url", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const listingUrl = String(req.body?.url || "").trim();
  const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
  const carOverrides = req.body?.car && typeof req.body.car === "object" ? req.body.car : {};
  const manualImages = Array.isArray(req.body?.images) ? req.body.images : [];

  if (!listingUrl) {
    return res.status(400).json({ ok: false, message: "URL em falta." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(listingUrl);
  } catch {
    return res.status(400).json({ ok: false, message: "URL inválida." });
  }

  if (!getImportSource(parsedUrl)) {
    return res.status(400).json({ ok: false, message: `Apenas links de ${getAllowedImportSourcesText()} são permitidos.` });
  }

  try {
    const { userClient } = await getAdminContext(authHeader);
    const parsed = await parseListingFromUrl(parsedUrl);
    const defaultPayload = {
      title: parsed.title || "Viatura importada",
      brand: parsed.brand || "N/D",
      model: parsed.model || "N/D",
      registration_date: parsed.registration_date || "N/D",
      mileage: Number.isFinite(parsed.mileage) ? parsed.mileage : 0,
      fuel: parsed.fuel || "N/D",
      price_eur: Number.isFinite(parsed.price_eur) ? parsed.price_eur : 0,
      observations: parsed.observations || null,
      seats: parsed.seats,
      segment: parsed.segment,
      power: parsed.power,
      origin: parsed.origin,
      engine_displacement: parsed.engine_displacement,
      transmission: parsed.transmission,
      color: parsed.color,
      doors: parsed.doors,
      condition: parsed.condition,
      warranty: parsed.warranty,
      extras: Array.isArray(parsed.extras) ? parsed.extras : []
    };
    const mergedPayload = mergeParsedCar(defaultPayload, carOverrides);
    const imageUrls = [
      ...(await uploadRemoteImages(userClient, parsed.imageCandidates)),
      ...(await uploadCarImages(userClient, manualImages))
    ];

    const payload = {
      ...mergedPayload,
      categories: categories.map((value) => String(value).trim()).filter(Boolean),
      image_urls: imageUrls
    };

    const validationError = validateCarPayload(payload, payload.categories, payload.image_urls);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
    }

    payload.brand_id = await resolveBrandId(userClient, payload.brand);

    const { data, error } = await userClient
      .from("cars")
      .insert(payload)
      .select("id, title, brand, brand_id, model, price_eur, image_urls")
      .single();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.status(201).json({ ok: true, car: data, importedImages: imageUrls.length });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : "Erro ao importar por URL.",
      error: error.statusCode ? undefined : error.message
    });
  }
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
