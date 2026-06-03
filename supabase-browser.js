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

  async function uploadImages(userClient, images) {
    const imageUrls = [];
    const safeImages = Array.isArray(images) ? images : [];

    for (const image of safeImages) {
      if (!image?.base64DataUrl || !image?.fileName) continue;

      const decoded = decodeBase64DataUrl(image.base64DataUrl);
      if (!decoded) continue;

      const ext = (decoded.mimeType.split("/")[1] || "jpg").toLowerCase();
      const uploadPath = "cars/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "." + ext;
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

    return jsonResponse({ ok: true, message: "Pedido de test drive registado com sucesso." }, 201);
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

    const query = isUpdate
      ? userClient
          .from("cars")
          .update(dbPayload)
          .eq("id", carId)
      : userClient
          .from("cars")
          .insert(dbPayload);

    const { data, error } = await query
      .select("id,title,brand,model,price_eur,image_urls,categories,created_at")
      .single();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({ ok: true, car: data }, isUpdate ? 200 : 201);
  }

  function unsupportedImportMessage() {
    return jsonResponse({
      ok: false,
      message: "A importação por link precisa do backend Node/Express ativo. O modo estático suporta login, stock, detalhes, pedidos de test drive e gestão manual."
    }, 501);
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
    if (pathname.startsWith("/api/cars/") && method === "GET") {
      return handleCarDetail(pathname);
    }
    if (pathname === "/api/test-drive-requests" && method === "POST") {
      return handleTestDrive(options);
    }
    if (pathname.startsWith("/api/admin/cars/") && method === "DELETE") {
      return handleDeleteCar(pathname, options);
    }
    if ((pathname === "/api/admin/import-car" && method === "POST") || (pathname.startsWith("/api/admin/cars/") && method === "PUT")) {
      return handleSaveCar(pathname, options);
    }
    if (pathname === "/api/admin/preview-import-from-url" || pathname === "/api/admin/import-from-url") {
      return unsupportedImportMessage();
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
