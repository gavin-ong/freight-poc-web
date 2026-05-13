(function () {
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let client = null;

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, isErr = false) {
    const el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isErr ? "#ff7b7b" : "#9fffb0";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    setStatus("Loading Supabase JS...");
    if (!window.supabase || !window.supabase.createClient) {
      await loadScript(SUPABASE_CDN);
    }
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase CDN blocked / failed to load.", true);
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = client; // for your console debugging
    setStatus("Ready. (JS loaded)");
  }

  async function login() {
    try {
      const email = ($("email")?.value || "").trim();
      const password = $("password")?.value || "";
      if (!email || !password) {
        setStatus("Email/password required.", true);
        return;
      }

      setStatus("Signing in...");
      const { data, error } = await client.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("Login failed: " + error.message, true);
        return;
      }

      // Confirm session exists
      const s = await client.auth.getSession();
      const u = s?.data?.session?.user || data?.user;
      if (!u) {
        setStatus("Signed in but no session (auth settings/key issue).", true);
        return;
      }

      setStatus("✅ Logged in: " + (u.email || "(unknown)"));
    } catch (e) {
      setStatus("Login crashed: " + (e.message || e), true);
      console.error(e);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    const btn = $("btnLogin");
    if (btn) {
      // pointerdown works better in Menlo/SafeView sometimes
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); login(); }, true);
      btn.addEventListener("click", (e) => { e.preventDefault(); login(); }, true);
    }
    // Enter key login
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        login();
      }
    });
  });
})();
