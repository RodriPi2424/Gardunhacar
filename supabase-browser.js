(function () {
  const SUPABASE_URL = "https://umlkehfxuwaxqhlrgdxp.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtbGtlaGZ4dXdheHFobHJnZHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDMzOTcsImV4cCI6MjA5NTYxOTM5N30.apgl-wQ8Nw8u2pwoDI6w51RUGC23ztBAvT6z3lD4NQU";
  const STORAGE_BUCKET = "car-photos";
  const SESSION_KEY = "autenticar_session_v1";

  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return;
  }

  const browserClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
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
      return { error: "Erro ao procurar marca: " + selectError.message };
    }

    if (existingBrand?.id) {
      return { brandId: existingBrand.id };
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
        if (racedBrand?.id) return { brandId: racedBrand.id };
      }

      return { error: "Erro ao criar marca: " + insertError.message };
    }

    return { brandId: createdBrand?.id || null };
  }

  function parseInteger(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return digits ? Number.parseInt(digits, 10) : null;
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

  function decodeHtmlEntities(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  function stripHtmlTags(value) {
    return sanitizeText(decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")));
  }

  function getNestedName(value) {
    if (value && typeof value === "object") return sanitizeText(value.Nome || value.Name || value.nome);
    return sanitizeText(value);
  }

  function normalizePositiveInteger(value) {
    const parsed = parseInteger(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeOrigin(value) {
    const normalized = sanitizeText(value).toLowerCase();
    if (!normalized) return null;
    if (normalized.includes("nacional")) return "Nacional";
    if (normalized.includes("import")) return "Importado";
    return null;
  }

  function normalizeRegistrationDateFromYearMonth(year, month) {
    const cleanYear = parseInteger(year);
    const cleanMonth = parseInteger(month);
    if (!cleanYear) return "";
    if (!cleanMonth || cleanMonth < 1 || cleanMonth > 12) return String(cleanYear);
    return String(cleanMonth).padStart(2, "0") + "/" + cleanYear;
  }

  function normalizeWarranty(value) {
    const raw = getNestedName(value) || sanitizeText(value);
    return raw || "18 meses";
  }

  function normalizeDbCondition(value) {
    const normalized = sanitizeText(value).toLowerCase();
    if (normalized === "novo") return "Novo";
    return "Usado";
  }

  function normalizeDbWarranty(value) {
    const normalized = sanitizeText(value).toLowerCase();
    if (!normalized || normalized === "não" || normalized === "nao" || normalized.includes("sem garantia")) {
      return "Não";
    }
    return "Sim";
  }

  function inferCategoriesForCar(car) {
    const categories = new Set();
    const price = Number(car.price_eur || 0);
    const segment = sanitizeText(car.segment).toLowerCase();
    const transmission = sanitizeText(car.transmission).toLowerCase();
    const fuel = sanitizeText(car.fuel).toLowerCase();
    const seats = Number(car.seats || 0);

    if (price > 0 && price <= 10000) categories.add("ate-10000");
    if (price > 0 && price <= 15000) categories.add("ate-15000");
    if (price > 0 && price <= 15000) categories.add("carros-economicos");
    if (transmission.includes("auto")) categories.add("carros-automaticos");
    if (segment.includes("suv") || segment.includes("crossover") || segment.includes("todo")) categories.add("suvs");
    if (segment.includes("util") || segment.includes("citad") || segment.includes("pequeno")) categories.add("carros-cidade");
    if (segment.includes("carrinha") || segment.includes("monovolume") || seats >= 5) categories.add("carros-familiares");
    if (fuel.includes("hibr") || fuel.includes("elétr") || fuel.includes("eletr") || fuel.includes("diesel")) categories.add("baixo-consumo");
    if (seats >= 5 && !categories.has("carros-cidade")) categories.add("carros-viagens");

    return Array.from(categories);
  }

  function buildCarDuplicateKey(car) {
    return [
      car.brand,
      car.model,
      car.registration_date,
      Number(car.mileage || 0),
      Number(car.price_eur || 0)
    ].map((value) => sanitizeText(value).toLowerCase()).join("|");
  }

  function buildPayloadFromParsedListing(parsed, categories) {
    const safeCategories = Array.isArray(categories) ? categories.map((value) => String(value).trim()).filter(Boolean) : [];
    const payload = {
      title: parsed.title || "Viatura importada",
      brand: parsed.brand || "N/D",
      model: parsed.model || "N/D",
      registration_date: parsed.registration_date || "N/D",
      mileage: Number.isFinite(parsed.mileage) ? parsed.mileage : 0,
      fuel: parsed.fuel || "N/D",
      price_eur: Number.isFinite(parsed.price_eur) ? parsed.price_eur : 0,
      observations: parsed.observations || "Sem observações.",
      seats: parsed.seats || 5,
      segment: parsed.segment || "N/D",
      power: parsed.power || "N/D",
      origin: parsed.origin || "Nacional",
      engine_displacement: parsed.engine_displacement || "N/D",
      transmission: parsed.transmission || "N/D",
      color: parsed.color || "N/D",
      doors: parsed.doors || 5,
      condition: normalizeDbCondition(parsed.condition),
      warranty: normalizeDbWarranty(parsed.warranty),
      extras: Array.isArray(parsed.extras) && parsed.extras.length > 0 ? parsed.extras : ["Sem extras indicados"]
    };
    payload.categories = safeCategories.length > 0 ? safeCategories : inferCategoriesForCar(payload);
    return payload;
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

  function normalizeIsoDate(value) {
    const raw = sanitizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
    const date = new Date(raw + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) return "";
    return raw;
  }

  function isTodayOrFutureDate(value) {
    const normalized = normalizeIsoDate(value);
    if (!normalized) return false;
    const selected = new Date(normalized + "T00:00:00Z");
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return selected.getTime() >= todayUtc.getTime();
  }

  function isAdminUser(user) {
    const role = String(
      user?.app_metadata?.role ||
      user?.raw_app_meta_data?.role ||
      user?.user_metadata?.role ||
      user?.raw_user_meta_data?.role ||
      ""
    ).toLowerCase();
    const rolesList = [
      ...(Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : []),
      ...(Array.isArray(user?.raw_app_meta_data?.roles) ? user.raw_app_meta_data.roles : [])
    ].map((value) => String(value).toLowerCase());
    return role === "admin" || rolesList.includes("admin");
  }

  function getStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function storeSession(session) {
    if (session?.access_token) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }

  async function refreshStoredSession() {
    const session = getStoredSession();
    if (!session?.refresh_token) return null;

    const { data, error } = await browserClient.auth.refreshSession({
      refresh_token: session.refresh_token
    });

    if (error || !data?.session) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("autenticar_user_v1");
      return null;
    }

    storeSession(data.session);
    return data.session;
  }

  async function getUserFromToken(token) {
    let activeToken = token;
    if (!activeToken) {
      const session = getStoredSession();
      activeToken = session?.access_token || "";
    }

    if (!activeToken) {
      return { user: null, error: { message: "Token em falta.", status: 401 } };
    }

    let result = await browserClient.auth.getUser(activeToken);
    if (result.error) {
      const refreshed = await refreshStoredSession();
      if (!refreshed?.access_token) {
        return { user: null, error: result.error };
      }
      result = await browserClient.auth.getUser(refreshed.access_token);
    }

    return {
      user: result.data?.user || null,
      error: result.error || null
    };
  }

  function getBearerToken(options) {
    const authHeader = options?.headers?.Authorization || options?.headers?.authorization || "";
    if (!String(authHeader).startsWith("Bearer ")) return "";
    return String(authHeader).slice("Bearer ".length).trim();
  }

  function createAuthedClient(token) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: "Bearer " + token }
      }
    });
  }

  function decodeBase64DataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { mimeType, bytes };
  }

  async function uploadImages(userClient, images, folder = "cars") {
    const imageUrls = [];
    const safeImages = Array.isArray(images) ? images : [];

    for (const image of safeImages) {
      if (!image?.base64DataUrl || !image?.fileName) continue;

      const decoded = decodeBase64DataUrl(image.base64DataUrl);
      if (!decoded) continue;

      const ext = (decoded.mimeType.split("/")[1] || "jpg").toLowerCase();
      const uploadPath = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "." + ext;
      const { error } = await userClient.storage
        .from(STORAGE_BUCKET)
        .upload(uploadPath, decoded.bytes, {
          contentType: decoded.mimeType,
          upsert: false
        });

      if (error) {
        return { error: "Erro no upload de imagem: " + error.message };
      }

      const { data } = userClient.storage.from(STORAGE_BUCKET).getPublicUrl(uploadPath);
      if (data?.publicUrl) imageUrls.push(data.publicUrl);
    }

    return { imageUrls };
  }

  async function fetchCarsDirect(category, limit) {
    let query = browserClient
      .from("cars")
      .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.contains("categories", [category]);
    }

    const { data, error } = await query;
    if (error) {
      return { ok: false, message: error.message, status: 400 };
    }

    let cars = data || [];
    if (category && cars.length === 0) {
      const legacy = await browserClient
        .from("cars")
        .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at")
        .filter("extras", "cs", JSON.stringify(["categoria:" + category]))
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!legacy.error && Array.isArray(legacy.data)) {
        cars = legacy.data;
      }
    }

    return { ok: true, cars, status: 200 };
  }

  async function fetchBrandsDirect() {
    const { data, error } = await browserClient
      .from("brands")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      return { ok: false, message: error.message, status: 400 };
    }

    return { ok: true, brands: data || [], status: 200 };
  }

  async function fetchPostsDirect(category, limit) {
    let query = browserClient
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
      return { ok: false, message: error.message, status: 400 };
    }

    return { ok: true, posts: data || [], status: 200 };
  }

  async function ensureUniquePostSlug(userClient, slug, currentPostId) {
    let candidate = slug || ("post-" + Date.now());
    let suffix = 2;

    for (;;) {
      const { data, error } = await userClient
        .from("posts")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data || String(data.id || "") === String(currentPostId || "")) {
        return candidate;
      }

      candidate = slug + "-" + suffix;
      suffix += 1;
    }
  }

  function validatePostPayload(post, imageUrls) {
    if (!post || typeof post !== "object") {
      return "Dados do post em falta.";
    }
    if (!sanitizeText(post.title) || !sanitizeText(post.excerpt) || !sanitizeText(post.content)) {
      return "Preenche titulo, resumo e conteudo do post.";
    }
    if (!["guias", "mercado", "noticias", "manutencao"].includes(sanitizeText(post.category).toLowerCase())) {
      return "Seleciona uma categoria valida para o post.";
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return "Adiciona pelo menos uma imagem ao post.";
    }
    return "";
  }

  function normalizePostPayload(post, imageUrls) {
    const cleanImages = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
    return {
      title: sanitizeText(post.title),
      slug: slugify(post.slug || post.title),
      excerpt: sanitizeText(post.excerpt),
      content: String(post.content || "").trim(),
      category: sanitizeText(post.category).toLowerCase() || "noticias",
      featured: Boolean(post.featured),
      published_at: post.published_at ? new Date(post.published_at).toISOString() : new Date().toISOString(),
      cover_image_url: sanitizeText(post.cover_image_url) || cleanImages[0] || null,
      image_urls: cleanImages,
      updated_at: new Date().toISOString()
    };
  }

  async function handleSessionInfo(options) {
    const token = getBearerToken(options);
    const { user, error } = await getUserFromToken(token);

    if (error || !user) {
      return jsonResponse({ ok: false, message: "Sessão inválida." }, 401);
    }

    return jsonResponse({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        is_admin: isAdminUser(user)
      }
    }, 200);
  }

  async function handleRegister(options) {
    const payload = JSON.parse(options?.body || "{}");
    const name = sanitizeText(payload.name);
    const email = sanitizeText(payload.email);
    const password = String(payload.password || "");

    if (!name || !email || !password) {
      return jsonResponse({ ok: false, message: "Nome, email e password sao obrigatorios." }, 400);
    }

    if (password.length < 8) {
      return jsonResponse({ ok: false, message: "A password deve ter pelo menos 8 caracteres." }, 400);
    }

    const { data, error } = await browserClient.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, error.status || 400);
    }

    return jsonResponse({
      ok: true,
      message: data.session
        ? "Conta criada com sucesso."
        : "Conta criada. Confirme o email para concluir o registo.",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at
          }
        : null
    }, 201);
  }

  async function handleLogin(options) {
    const payload = JSON.parse(options?.body || "{}");
    const email = sanitizeText(payload.email);
    const password = String(payload.password || "");

    if (!email || !password) {
      return jsonResponse({ ok: false, message: "Email e password sao obrigatorios." }, 400);
    }

    const { data, error } = await browserClient.auth.signInWithPassword({ email, password });
    if (error) {
      return jsonResponse({ ok: false, message: error.message }, error.status || 401);
    }

    if (data?.session) storeSession(data.session);

    return jsonResponse({
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
    }, 200);
  }

  async function handleDbHealth() {
    const { error } = await browserClient
      .from("cars")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 500);
    }

    return jsonResponse({ ok: true, serverTime: new Date().toISOString() }, 200);
  }

  async function handleCarsList(url) {
    const category = sanitizeText(url.searchParams.get("category"));
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "24", 10) || 24, 1), 100);
    const result = await fetchCarsDirect(category, limit);
    return jsonResponse(
      result.ok ? { ok: true, cars: result.cars } : { ok: false, message: result.message },
      result.status
    );
  }

  async function handleBrandsList() {
    const result = await fetchBrandsDirect();
    return jsonResponse(
      result.ok ? { ok: true, brands: result.brands } : { ok: false, message: result.message },
      result.status
    );
  }

  async function handlePostsList(url) {
    const category = sanitizeText(url.searchParams.get("category")).toLowerCase();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "24", 10) || 24, 1), 100);
    const result = await fetchPostsDirect(category, limit);
    return jsonResponse(
      result.ok ? { ok: true, posts: result.posts } : { ok: false, message: result.message },
      result.status
    );
  }

  async function handleCarDetail(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    const carId = parts[2] || "";

    const { data, error } = await browserClient
      .from("cars")
      .select("id,title,brand,model,registration_date,mileage,fuel,price_eur,image_urls,extras,categories,created_at,observations,seats,segment,power,origin,engine_displacement,transmission,color,doors,condition,warranty")
      .eq("id", carId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    if (!data) {
      return jsonResponse({ ok: false, message: "Carro não encontrado." }, 404);
    }

    return jsonResponse({ ok: true, car: data }, 200);
  }

  async function handlePostDetail(pathname) {
    const slug = slugify(pathname.split("/").filter(Boolean)[2] || "");

    const { data, error } = await browserClient
      .from("posts")
      .select("id,title,slug,excerpt,content,category,cover_image_url,image_urls,featured,published_at,created_at,updated_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    if (!data) {
      return jsonResponse({ ok: false, message: "Post nao encontrado." }, 404);
    }

    return jsonResponse({ ok: true, post: data }, 200);
  }

  async function handleTestDrive(options) {
    const payload = JSON.parse(options?.body || "{}");
    const carId = sanitizeText(payload.carId);
    const requestedDate = normalizeIsoDate(payload.requestedDate);
    const customerName = sanitizeText(payload.name);
    const customerEmail = sanitizeText(payload.email).toLowerCase();
    const customerPhone = sanitizeText(payload.phone);

    if (!carId || !requestedDate || !customerName || !customerEmail || !customerPhone) {
      return jsonResponse({ ok: false, message: "Data, nome, email e telemovel sao obrigatorios." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return jsonResponse({ ok: false, message: "Indica um email valido." }, 400);
    }

    if (customerPhone.replace(/[^\d+]/g, "").length < 9) {
      return jsonResponse({ ok: false, message: "Indica um telemovel valido." }, 400);
    }

    if (!isTodayOrFutureDate(requestedDate)) {
      return jsonResponse({ ok: false, message: "Escolhe uma data valida para o test drive." }, 400);
    }

    const { data: car, error: carError } = await browserClient
      .from("cars")
      .select("id,title,brand,model")
      .eq("id", carId)
      .maybeSingle();

    if (carError) {
      return jsonResponse({ ok: false, message: carError.message }, 400);
    }

    if (!car) {
      return jsonResponse({ ok: false, message: "Viatura nao encontrada." }, 404);
    }

    const carTitle = sanitizeText(car.title) || sanitizeText((car.brand || "") + " " + (car.model || "")) || "Viatura";
    const { error } = await browserClient
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
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({
      ok: true,
      message: "Pedido de test drive registado com sucesso.",
      warning: "Pedido guardado. O email de notificacao so e enviado quando o backend Node/Express esta ativo."
    }, 201);
  }

  async function handleDeleteCar(pathname, options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir carros." }, 403);
    }

    const carId = pathname.split("/").filter(Boolean)[3] || "";
    const userClient = createAuthedClient(token);
    const { error } = await userClient.from("cars").delete().eq("id", carId);
    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true }, 200);
  }

  async function handleSaveCar(pathname, options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir carros." }, 403);
    }

    const payload = JSON.parse(options?.body || "{}");
    const car = payload.car && typeof payload.car === "object" ? payload.car : null;
    const images = Array.isArray(payload.images) ? payload.images : [];
    const categories = Array.isArray(payload.categories) ? payload.categories : [];

    if (!car) {
      return jsonResponse({ ok: false, message: "Dados do carro em falta." }, 400);
    }

    const userClient = createAuthedClient(token);
    const uploadResult = await uploadImages(userClient, images);
    if (uploadResult.error) {
      return jsonResponse({ ok: false, message: uploadResult.error }, 400);
    }

    const isUpdate = options?.method === "PUT";
    let imageUrls = uploadResult.imageUrls || [];
    let carId = "";

    if (isUpdate) {
      carId = pathname.split("/").filter(Boolean)[3] || "";
      const { data: existingCar, error: existingError } = await userClient
        .from("cars")
        .select("id,image_urls")
        .eq("id", carId)
        .maybeSingle();

      if (existingError) {
        return jsonResponse({ ok: false, message: existingError.message }, 400);
      }

      if (!existingCar) {
        return jsonResponse({ ok: false, message: "Carro não encontrado." }, 404);
      }

      if (!imageUrls.length) {
        imageUrls = Array.isArray(existingCar.image_urls) ? existingCar.image_urls : [];
      }
    }

    const dbPayload = {
      ...car,
      categories,
      image_urls: imageUrls
    };

    const brandResult = await resolveBrandId(userClient, dbPayload.brand);
    if (brandResult.error) {
      return jsonResponse({ ok: false, message: brandResult.error }, 400);
    }
    dbPayload.brand_id = brandResult.brandId;

    const query = isUpdate
      ? userClient
          .from("cars")
          .update(dbPayload)
          .eq("id", carId)
      : userClient
          .from("cars")
          .insert(dbPayload);

    const { data, error } = await query
      .select("id,title,brand,brand_id,model,price_eur,image_urls,categories,created_at")
      .single();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true, car: data }, isUpdate ? 200 : 201);
  }

  async function handleAdminPosts(options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir posts." }, 403);
    }

    const userClient = createAuthedClient(token);
    const { data, error } = await userClient
      .from("posts")
      .select("id,title,slug,excerpt,category,cover_image_url,image_urls,featured,published_at,created_at")
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false });

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true, posts: data || [] }, 200);
  }

  async function handleCreatePost(options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir posts." }, 403);
    }

    const payload = JSON.parse(options?.body || "{}");
    const post = payload.post && typeof payload.post === "object" ? payload.post : null;
    const images = Array.isArray(payload.images) ? payload.images : [];

    if (!post) {
      return jsonResponse({ ok: false, message: "Dados do post em falta." }, 400);
    }

    const userClient = createAuthedClient(token);
    const uploadResult = await uploadImages(userClient, images, "posts");
    if (uploadResult.error) {
      return jsonResponse({ ok: false, message: uploadResult.error }, 400);
    }

    const dbPayload = normalizePostPayload(post, uploadResult.imageUrls || []);
    dbPayload.slug = await ensureUniquePostSlug(userClient, dbPayload.slug);

    const validationError = validatePostPayload(dbPayload, dbPayload.image_urls);
    if (validationError) {
      return jsonResponse({ ok: false, message: validationError }, 400);
    }

    const { data, error } = await userClient
      .from("posts")
      .insert(dbPayload)
      .select("id,title,slug,excerpt,category,cover_image_url,image_urls,featured,published_at,created_at")
      .single();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true, post: data }, 201);
  }

  async function handleDeletePost(pathname, options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir posts." }, 403);
    }

    const postId = pathname.split("/").filter(Boolean)[3] || "";
    const userClient = createAuthedClient(token);
    const { error } = await userClient.from("posts").delete().eq("id", postId);
    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true }, 200);
  }

  function unsupportedImportMessage() {
    return jsonResponse({
      ok: false,
      message: "A importação por link precisa do backend Node/Express ativo. O modo estático suporta login, stock, detalhes, pedidos de test drive e gestão manual."
    }, 501);
  }

  function extractAlonsoVehicleId(sourceUrl) {
    const urlObj = new URL(sourceUrl);
    const parts = urlObj.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const id = parts.slice().reverse().find((part) => /^\d+$/.test(part));
    return id || "";
  }

  async function getAlonsoEasydataConfig(hostname) {
    const assetsBase = "https://multidealer.easysite.pt/assets/" + hostname;
    const [envResp, infoResp] = await Promise.all([
      fetch(assetsBase + "/env"),
      fetch(assetsBase + "/info.json")
    ]);

    if (!envResp.ok || !infoResp.ok) {
      return { error: "Não foi possível ler a configuração do site Alonso & Branco.", status: 400 };
    }

    const env = await envResp.json();
    const info = await infoResp.json();
    const token = sanitizeText(env.REACT_APP_TOKEN_API);
    const dealerId = info?.Stand?.Anunciante;
    const sourceType = info?.Stand?.Easymanager ? "easymanager" : "easydata";

    if (!token || !dealerId) {
      return { error: "Configuração do site Alonso & Branco incompleta.", status: 400 };
    }

    return { token, dealerId, sourceType };
  }

  async function fetchAlonsoEasydataVehicles(hostname) {
    const config = await getAlonsoEasydataConfig(hostname);
    if (config.error) return config;

    const { token, dealerId, sourceType } = config;
    const apiUrl = new URL("https://ws.easydata.pt/v1/" + sourceType + "/carros/GetListaDetalhesViatura/");
    apiUrl.searchParams.set("dealer_id", String(dealerId));
    const listingResp = await fetch(apiUrl, { headers: { token } });

    if (!listingResp.ok) {
      return { error: "Não foi possível ler as viaturas Alonso & Branco (" + listingResp.status + ").", status: 400 };
    }

    const vehicles = await listingResp.json();
    return { vehicles: Array.isArray(vehicles) ? vehicles : [] };
  }

  async function fetchAlonsoEasydataListing(sourceUrl) {
    const urlObj = new URL(sourceUrl);
    const hostname = urlObj.hostname.toLowerCase();
    const vehicleId = extractAlonsoVehicleId(sourceUrl);

    if (!vehicleId) {
      return { error: "Não foi possível encontrar o ID da viatura no URL.", status: 400 };
    }

    const result = await fetchAlonsoEasydataVehicles(hostname);
    if (result.error) return result;

    const vehicle = result.vehicles.find((item) => String(item?.CodViatura || "") === vehicleId) || null;

    if (!vehicle) {
      return { error: "Viatura Alonso & Branco não encontrada.", status: 404 };
    }

    return { vehicle };
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
      CV: vehicle.Potencia ? String(vehicle.Potencia) + " CV" : "",
      Carroçaria: getNestedName(vehicle.Tipo),
      Origem: vehicle.Importado ? "Importado" : "Nacional",
      Estado: getNestedName(vehicle.Estado),
      Garantia: normalizeWarranty(vehicle.Garantia),
      Cilindrada: vehicle.Cilindrada ? String(vehicle.Cilindrada) + " cc" : "",
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
      observations: stripHtmlTags(vehicle.Obs || "") || null,
      seats: normalizePositiveInteger(details.Lugares),
      segment: details.Carroçaria || null,
      power: vehicle.Potencia ? String(vehicle.Potencia).replace(/[^\d]/g, "") + " CV" : null,
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

  async function parseStaticImportListing(listingUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(String(listingUrl || "").trim());
    } catch {
      return { error: "URL inválida.", status: 400 };
    }

    if (parsedUrl.hostname.toLowerCase() !== "viaturas.alonsosebranco.pt") {
      return {
        error: "A importação por link deste site precisa do backend Node/Express ativo. Em modo estático, usa links de viaturas.alonsosebranco.pt.",
        status: 501
      };
    }

    const result = await fetchAlonsoEasydataListing(parsedUrl.toString());
    if (result.error) return result;
    return { car: parseAlonsoEasydataListing(result.vehicle) };
  }

  function mergeParsedCar(baseCar, overrides) {
    const merged = { ...baseCar };
    Object.entries(overrides || {}).forEach(([key, value]) => {
      if (value == null) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) merged[key] = trimmed;
        return;
      }
      if (typeof value === "number") {
        if (Number.isFinite(value)) merged[key] = value;
        return;
      }
      if (Array.isArray(value)) merged[key] = value;
    });
    return merged;
  }

  async function handlePreviewImportFromUrl(options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir carros." }, 403);
    }

    const payload = JSON.parse(options?.body || "{}");
    const result = await parseStaticImportListing(payload.url);
    if (result.error) return jsonResponse({ ok: false, message: result.error }, result.status || 400);

    return jsonResponse({
      ok: true,
      car: {
        title: result.car.title || "",
        brand: result.car.brand || "",
        model: result.car.model || "",
        registration_date: result.car.registration_date || "",
        mileage: Number.isFinite(result.car.mileage) ? result.car.mileage : null,
        fuel: result.car.fuel || "",
        price_eur: Number.isFinite(result.car.price_eur) ? result.car.price_eur : null,
        observations: result.car.observations || "",
        seats: result.car.seats,
        segment: result.car.segment || "",
        power: result.car.power || "",
        origin: result.car.origin || "",
        engine_displacement: result.car.engine_displacement || "",
        transmission: result.car.transmission || "",
        color: result.car.color || "",
        doors: result.car.doors,
        condition: result.car.condition || "",
        warranty: result.car.warranty || "",
        extras: Array.isArray(result.car.extras) ? result.car.extras : [],
        registration_plate: result.car.registration_plate || "",
        details: result.car.details || {},
        image_urls: result.car.imageCandidates || []
      }
    }, 200);
  }

  async function handleImportFromUrl(options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir carros." }, 403);
    }

    const payload = JSON.parse(options?.body || "{}");
    const result = await parseStaticImportListing(payload.url);
    if (result.error) return jsonResponse({ ok: false, message: result.error }, result.status || 400);

    const parsed = result.car;
    const categories = Array.isArray(payload.categories) ? payload.categories.map((value) => String(value).trim()).filter(Boolean) : [];
    const defaultPayload = buildPayloadFromParsedListing(parsed, categories);
    const car = mergeParsedCar(defaultPayload, payload.car);
    const imageUrls = Array.isArray(parsed.imageCandidates) ? parsed.imageCandidates.filter(Boolean) : [];
    const userClient = createAuthedClient(token);
    const dbPayload = { ...car, categories: car.categories, image_urls: imageUrls };
    const brandResult = await resolveBrandId(userClient, dbPayload.brand);
    if (brandResult.error) {
      return jsonResponse({ ok: false, message: brandResult.error }, 400);
    }
    dbPayload.brand_id = brandResult.brandId;

    const { data, error } = await userClient
      .from("cars")
      .insert(dbPayload)
      .select("id,title,brand,brand_id,model,price_eur,image_urls,categories,created_at")
      .single();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true, car: data, importedImages: imageUrls.length }, 201);
  }

  async function handleImportAlonsoStock(options) {
    const token = getBearerToken(options);
    const { user, error: authError } = await getUserFromToken(token);
    if (authError || !user || !isAdminUser(user)) {
      return jsonResponse({ ok: false, message: "Acesso negado: apenas admins podem gerir carros." }, 403);
    }

    const payload = JSON.parse(options?.body || "{}");
    const stockUrl = sanitizeText(payload.url) || "https://viaturas.alonsosebranco.pt/usadas/?Order=6";
    const offset = Math.max(parseInt(String(payload.offset || "0"), 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(String(payload.limit || "8"), 10) || 8, 1), 20);
    let parsedUrl;
    try {
      parsedUrl = new URL(stockUrl);
    } catch {
      return jsonResponse({ ok: false, message: "URL inválida." }, 400);
    }

    if (parsedUrl.hostname.toLowerCase() !== "viaturas.alonsosebranco.pt") {
      return jsonResponse({ ok: false, message: "Este importador temporário só aceita viaturas.alonsosebranco.pt." }, 400);
    }

    const result = await fetchAlonsoEasydataVehicles(parsedUrl.hostname.toLowerCase());
    if (result.error) return jsonResponse({ ok: false, message: result.error }, result.status || 400);

    const userClient = createAuthedClient(token);
    const existing = await userClient
      .from("cars")
      .select("id,title,brand,model,registration_date,mileage,price_eur")
      .limit(1000);

    if (existing.error) {
      return jsonResponse({ ok: false, message: existing.error.message }, 400);
    }

    const publicVehicles = result.vehicles.filter((vehicle) => vehicle?.Vendido !== true && vehicle?.Reservado !== true);
    const allItems = publicVehicles.map((vehicle) => {
      const parsed = parseAlonsoEasydataListing(vehicle);
      return {
        sourceId: sanitizeText(vehicle?.CodViatura),
        title: parsed.title || "Viatura Alonso & Branco"
      };
    });
    const batchVehicles = publicVehicles.slice(offset, offset + limit);
    const seenKeys = new Set((existing.data || []).map((car) => buildCarDuplicateKey(car)));
    const imported = [];
    const skipped = [];
    const failed = [];
    const processedItems = [];

    for (const vehicle of batchVehicles) {
      const sourceId = sanitizeText(vehicle?.CodViatura);
      try {
        const parsed = parseAlonsoEasydataListing(vehicle);
        const dbPayload = {
          ...buildPayloadFromParsedListing(parsed),
          image_urls: Array.isArray(parsed.imageCandidates) ? parsed.imageCandidates.filter(Boolean) : []
        };
        const duplicateKey = buildCarDuplicateKey(dbPayload);

        if (seenKeys.has(duplicateKey)) {
          const skippedItem = { sourceId, title: dbPayload.title, reason: "Já existia" };
          skipped.push(skippedItem);
          processedItems.push({ ...skippedItem, status: "skipped" });
          continue;
        }

        const brandResult = await resolveBrandId(userClient, dbPayload.brand);
        if (brandResult.error) {
          const failedItem = { sourceId, title: dbPayload.title, message: brandResult.error };
          failed.push(failedItem);
          processedItems.push({ ...failedItem, status: "failed" });
          continue;
        }
        dbPayload.brand_id = brandResult.brandId;

        const { data, error } = await userClient
          .from("cars")
          .insert(dbPayload)
          .select("id,title,brand,brand_id,model,price_eur,image_urls,categories,created_at")
          .single();

        if (error) {
          const failedItem = { sourceId, title: dbPayload.title, message: error.message };
          failed.push(failedItem);
          processedItems.push({ ...failedItem, status: "failed" });
          continue;
        }

        seenKeys.add(duplicateKey);
        imported.push(data);
        processedItems.push({ sourceId, title: dbPayload.title, status: "imported", carId: data.id });
      } catch (error) {
        const failedItem = { sourceId, title: "Viatura Alonso & Branco", message: error.message };
        failed.push(failedItem);
        processedItems.push({ ...failedItem, status: "failed" });
      }
    }

    const nextOffset = Math.min(offset + batchVehicles.length, publicVehicles.length);
    return jsonResponse({
      ok: failed.length === 0,
      total: publicVehicles.length,
      offset,
      limit,
      nextOffset,
      done: nextOffset >= publicVehicles.length,
      imported: imported.length,
      skipped: skipped.length,
      failed: failed.length,
      cars: imported,
      allItems,
      processedItems,
      skippedItems: skipped.slice(0, 25),
      failures: failed.slice(0, 25)
    }, failed.length > 0 ? 207 : 201);
  }

  async function handleFallback(path, options) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const method = String(options?.method || "GET").toUpperCase();

    if (pathname === "/api/auth/session-info" && method === "GET") {
      return handleSessionInfo(options);
    }
    if (pathname === "/api/auth/register" && method === "POST") {
      return handleRegister(options);
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      return handleLogin(options);
    }
    if (pathname === "/api/db/health" && method === "GET") {
      return handleDbHealth();
    }
    if (pathname === "/api/cars" && method === "GET") {
      return handleCarsList(url);
    }
    if (pathname === "/api/brands" && method === "GET") {
      return handleBrandsList();
    }
    if (pathname.startsWith("/api/cars/") && method === "GET") {
      return handleCarDetail(pathname);
    }
    if (pathname === "/api/posts" && method === "GET") {
      return handlePostsList(url);
    }
    if (pathname.startsWith("/api/posts/") && method === "GET") {
      return handlePostDetail(pathname);
    }
    if (pathname === "/api/test-drive-requests" && method === "POST") {
      return handleTestDrive(options);
    }
    if (pathname === "/api/admin/posts" && method === "GET") {
      return handleAdminPosts(options);
    }
    if (pathname === "/api/admin/posts" && method === "POST") {
      return handleCreatePost(options);
    }
    if (pathname.startsWith("/api/admin/posts/") && method === "DELETE") {
      return handleDeletePost(pathname, options);
    }
    if (pathname.startsWith("/api/admin/cars/") && method === "DELETE") {
      return handleDeleteCar(pathname, options);
    }
    if ((pathname === "/api/admin/import-car" && method === "POST") || (pathname.startsWith("/api/admin/cars/") && method === "PUT")) {
      return handleSaveCar(pathname, options);
    }
    if (pathname === "/api/admin/preview-import-from-url" && method === "POST") {
      return handlePreviewImportFromUrl(options);
    }
    if (pathname === "/api/admin/import-from-url" && method === "POST") {
      return handleImportFromUrl(options);
    }
    if (pathname === "/api/admin/import-alonso-stock" && method === "POST") {
      return handleImportAlonsoStock(options);
    }

    return jsonResponse({ ok: false, message: "Endpoint não suportado neste modo." }, 404);
  }

  async function smartFetch(path, options) {
    const requestUrl = String(path || "");
    try {
      const response = await window.fetch(requestUrl, options);
      if (![404, 405, 501].includes(response.status)) {
        return response;
      }
    } catch {
      // Fall back to direct Supabase access when no backend is available.
    }

    return handleFallback(requestUrl, options);
  }

  window.AutenticarApi = {
    fetch: smartFetch
  };
})();
