// RS3 Resets Tracker — app.js (v21)
// Everything runs AFTER the HTML is parsed, because index.html loads this with `defer`.

(function () {
  // ---- Badge so you know JS actually ran ----
  var badge = document.getElementById("jsok");
  if (badge) { badge.textContent = "JS: OK v21"; }

  // ---- Alt1 register (safe if not inside Alt1) ----
  try {
    if (window.alt1 && alt1.identifyAppUrl) {
      alt1.identifyAppUrl("https://hacza.github.io/RS3-Reset-Tracker.2/appconfig.json");
    }
  } catch (e) {}

  // ===== State =====
  var LS_KEY = "rs3_resets_tracker_v1";
  var state = load() || initDefault();
  var currentScope = "daily";

  // ===== Elements =====
  function el(id){ return document.getElementById(id); }
  var listEl = el("list");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var profileSel = el("profile");

  // ===== Profiles =====
  function refreshProfiles() {
    profileSel.innerHTML = "";
    for (var i=0; i<state.profiles.length; i++){
      var p = state.profiles[i];
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = p.name;
      profileSel.appendChild(opt);
    }
    profileSel.value = state.currentProfile;
  }
  el("newProfile").onclick = function(){
    var name = prompt("Profile name?","Main");
    if (!name) return;
    state.profiles.push(emptyProfile(name));
    state.currentProfile = String(state.profiles.length-1);
    save(); refreshProfiles(); render();
  };
  el("delProfile").onclick = function(){
    if (state.profiles.length <= 1) { alert("Keep at least one profile."); return; }
    if (!confirm("Delete current profile?")) return;
    var idx = +state.currentProfile;
    state.profiles.splice(idx,1);
    state.currentProfile = "0";
    save(); refreshProfiles(); render();
  };
  profileSel.onchange = function(){ state.currentProfile = profileSel.value; save(); render(); };

  // ===== Tabs =====
  for (var t=0; t<tabs.length; t++){
    (function(tab){
      tab.onclick = function(){
        for (var j=0; j<tabs.length; j++) tabs[j].classList.remove("active");
        tab.classList.add("active");
        currentScope = tab.getAttribute("data-scope");
        renderList();
      };
    })(tabs[t]);
  }

  // ===== Add & edit =====
  el("addBtn").onclick = addItem;
  el("addText").addEventListener("keydown", function(e){ if (e.key === "Enter") addItem(); });
  function addItem() {
    var txt = el("addText").value.trim();
    if (!txt) return;
    var m = txt.match(/https?:\/\/\S+/);
    var name = txt.replace(/https?:\/\/\S+/,"").trim() || txt;
    var url = m ? m[0] : "";
    getScopeArr().push({ id: uid(), name: name, url: url, done:false });
    el("addText").value = "";
    save(); renderList();
  }

  // ===== List render (checkbox + delete + drag) =====
  function renderList() {
    var arr = getScopeArr();
    listEl.innerHTML = "";
    for (var i=0; i<arr.length; i++){
      (function(it, idx){
        var row = document.createElement("div");
        row.className = "item"; row.draggable = true;

        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = !!it.done;
        cb.onchange = function(){ it.done = cb.checked; save(); };

        var name = document.createElement("input");
        name.value = it.name;
        name.style.flex = "1";
        name.style.background = "transparent";
        name.style.color = "#e9edf3";
        name.style.border = "0";
        name.style.outline = "none";
        name.onchange = function(){ it.name = name.value.trim(); save(); };

        var link = document.createElement("a");
        link.href = it.url || "#";
        link.textContent = it.url ? "Wiki" : "";
        link.target = "_blank";

        var del = document.createElement("button");
        del.textContent = "Del";
        del.style.padding = "6px 8px";
        del.onclick = function(){
          if (confirm('Delete "' + it.name + '"?')) {
            arr.splice(idx, 1);
            save(); renderList();
          }
        };

        row.appendChild(cb);
        row.appendChild(name);
        row.appendChild(link);
        row.appendChild(del);

        // drag-to-reorder
        row.addEventListener("dragstart", function(e){ e.dataTransfer.setData("text/plain", idx); });
        row.addEventListener("dragover", function(e){ e.preventDefault(); });
        row.addEventListener("drop", function(e){
          e.preventDefault();
          var from = +e.dataTransfer.getData("text/plain");
          var to = idx;
          if (from===to) return;
          var a = arr[from];
          arr.splice(from,1); arr.splice(to,0,a);
          save(); renderList();
        });

        listEl.appendChild(row);
      })(arr[i], i);
    }
  }

  // ===== Import from DailyScape (STRICT: RS wiki link + clear frequency only) =====
  el("importDailyScape").onclick = function(){ importDailyScapeStrict(); };

  function importDailyScapeStrict(){
    var BTN = el("importDailyScape");
    var prev = BTN.textContent; BTN.textContent = "Importing…"; BTN.disabled = true;

    var SOURCES = [
      "https://dailyscape.github.io/rsdata/rsdata.js",
      "https://cdn.jsdelivr.net/gh/dailyscape/rsdata@main/rsdata.js",
      "https://dailyscape.github.io/rsdata/rsapidatawikibulk.js",
      "https://cdn.jsdelivr.net/gh/dailyscape/rsdata@main/rsapidatawikibulk.js"
    ];

    (function run(){
      var ds = null, used = null, errs = [];
      var i = 0;

      function next(){
        if (i >= SOURCES.length) return done(new Error("No dataset. Tried:\n" + errs.join("\n")));
        // clear possible previous binding
        try { delete window.rsapidata; } catch(e){}
        var src = SOURCES[i] + "?t=" + Date.now();
        var s = document.createElement("script");
        s.src = src; s.async = true;
        s.onload = function(){
          try { if (!ds && typeof rsapidata !== "undefined") ds = rsapidata; } catch(e){}
          if (!ds && window.rsapidata) ds = window.rsapidata;
          if (ds) { used = SOURCES[i]; return proceed(ds, used); }
          i++; next();
        };
        s.onerror = function(){ errs.push(SOURCES[i] + " — script load failed"); i++; next(); };
        document.head.appendChild(s);
      }

      function proceed(dsObj, usedUrl){
        // helpers
        var NAME_KEYS = ["name","item","title","label","task","activity","text"];
        var URL_KEYS  = ["wiki","url","link","wikilink","w","page"];
        var RS_WIKI   = /runescape\.wiki/i;

        function pullName(o){
          for (var k=0; k<NAME_KEYS.length; k++){
            var kk = NAME_KEYS[k];
            if (o && typeof o[kk]==="string" && o[kk].trim()) return o[kk].trim();
          }
          return "";
        }
        function pullUrl(o){
          for (var k=0; k<URL_KEYS.length; k++){
            var kk = URL_KEYS[k];
            if (o && typeof o[kk]==="string" && o[kk].trim()) return o[kk].trim();
          }
          return "";
        }
        function freqWord(s){
          var t = (s||"").toLowerCase();
          if (t.indexOf("daily")>-1) return "daily";
          if (t.indexOf("week")>-1)  return "weekly";
          if (t.indexOf("month")>-1) return "monthly";
          return "";
        }
        function infer(o){
          for (var key in o){
            if (!o.hasOwnProperty(key)) continue;
            var v = o[key];
            var f = freqWord(key);
            if (f) return f;
            if (typeof v === "string"){
              var f2 = freqWord(v);
              if (f2) return f2;
            }
          }
          if (o && typeof o.frequency === "string") return freqWord(o.frequency);
          if (o && typeof o.interval  === "string") return freqWord(o.interval);
          if (o && typeof o.reset     === "string") return freqWord(o.reset);
          return "";
        }

        // crawl
        var seen = [];
        var seenSet = new WeakSet();
        var candidates = [];

        function walk(x, depth){
          if (depth>6 || x==null) return;
          if (Object.prototype.toString.call(x) === "[object Array]"){
            for (var a=0; a<x.length; a++) walk(x[a], depth+1);
            return;
          }
          if (typeof x === "object"){
            if (seenSet.has(x)) return;
            seenSet.add(x);
            seen.push(x);

            var name = pullName(x);
            var url  = pullUrl(x);
            var bucket = infer(x);

            // STRICT: must have RS wiki link AND clear bucket
            if (name && url && RS_WIKI.test(url) && bucket){
              candidates.push({name:name, url:url, bucket:bucket});
            }
            for (var k in x) if (x.hasOwnProperty(k)) walk(x[k], depth+1);
          }
        }
        walk(dsObj, 0);

        // bucket + dedupe
        var daily=[], weekly=[], monthly=[];
        var have = Object.create(null);
        function pushU(arr,t){
          var key = t.name.toLowerCase();
          if (!have[key]){ arr.push(t); have[key]=1; }
        }
        for (var c=0; c<candidates.length; c++){
          var t = candidates[c];
          if (t.bucket==="daily") pushU(daily,t);
          else if (t.bucket==="weekly") pushU(weekly,t);
          else if (t.bucket==="monthly") pushU(monthly,t);
        }

        var found = { daily: daily.length, weekly: weekly.length, monthly: monthly.length };

        // merge
        var added = { daily:0, weekly:0, monthly:0 };
        var scopes = ["daily","weekly","monthly"];
        for (var si=0; si<scopes.length; si++){
          var scope = scopes[si];
          var incoming = scope==="daily"?daily: scope==="weekly"?weekly: monthly;
          var here = state.profiles[getP()].items[scope];
          var have2 = Object.create(null);
          for (var h=0; h<here.length; h++){
            var k2 = (here[h].name||"").toLowerCase();
            if (k2) have2[k2]=1;
          }
          for (var ii=0; ii<incoming.length; ii++){
            var key = (incoming[ii].name||"").toLowerCase();
            if (!key || have2[key]) continue;
            here.push({ id: uid(), name: incoming[ii].name, url: incoming[ii].url || "", done: false });
            have2[key]=1; added[scope]++;
          }
        }

        save(); renderList();

        var msg = "Imported from DailyScape\n" +
                  "Found: " + found.daily + " daily, " + found.weekly + " weekly, " + found.monthly + " monthly.\n" +
                  "Added: " + added.daily + " daily, " + added.weekly + " weekly, " + added.monthly + " monthly.\n" +
                  "Source: " + usedUrl;
        if (!found.daily && !found.weekly && !found.monthly) {
          msg += "\n\nNo clearly-labeled tasks were found.\n(I only import entries that BOTH link to the RuneScape Wiki AND explicitly mention daily/weekly/monthly.)";
        }
        alert(msg);
        done(null);
      }

      function done(err){
        BTN.textContent = prev; BTN.disabled = false;
        if (err) { console.error(err); alert("Import failed: " + err.message); }
      }

      next();
    })();
  }

  // ===== Starter Pack (optional) =====
  el("loadStarter").onclick = function(){
    if (!confirm("Add a small starter set? (You can delete or edit anything later.)")) return;
    var adds = {
      daily: [
        "Vis wax", "Reaper assignment", "Divine locations", "Familiar upkeep", "Player-owned farm animals check"
      ],
      weekly: [
        "Penguin hide and seek", "Tears of Guthix", "Wilderness flash events"
      ],
      monthly: [
        "Giant Oyster", "God Statues"
      ]
    };
    var scopes = ["daily","weekly","monthly"];
    for (var si=0; si<scopes.length; si++){
      var scope = scopes[si];
      var here = state.profiles[getP()].items[scope];
      var have = Object.create(null);
      for (var h=0; h<here.length; h++){
        var k2 = (here[h].name||"").toLowerCase();
        if (k2) have[k2]=1;
      }
      for (var a=0; a<adds[scope].length; a++){
        var n = adds[scope][a];
        var key = n.toLowerCase();
        if (!have[key]) here.push({ id: uid(), name: n, url: "", done:false });
      }
    }
    save(); renderList();
    alert("Starter tasks added. You can edit names or attach Wiki links any time.");
  };

  // ===== Utility buttons =====
  el("clearDone").onclick = function(){ var arr = getScopeArr(); for (var i=0;i<arr.length;i++) arr[i].done=false; save(); renderList(); };
  el("resetScope").onclick = function(){ if (confirm("Clear all tasks on this tab?")) { state.profiles[getP()].items[currentScope] = []; save(); renderList(); } };
  el("factoryReset").onclick = function(){
    if (!confirm("Factory Reset will remove ALL profiles and tasks saved in this browser. Continue?")) return;
    localStorage.removeItem(LS_KEY);
    state = initDefault();
    save(); location.reload();
  };

  // ===== Timers (UTC) =====
  function nextDailyUTC(now){ now = now || new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1, 0,0,0)); }
  function nextWeeklyUTC(now){ now = now || new Date(); var day = now.getUTCDay(); var daysToWed = (3 - day + 7) % 7 || 7; return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+daysToWed, 0,0,0)); }
  function firstOfNextMonthUTC(now){ now = now || new Date(); var y=now.getUTCFullYear(), m=now.getUTCMonth(); return new Date(Date.UTC(m===11?y+1:y, (m+1)%12, 1, 0,0,0)); }

  function tickClocks() {
    var now = new Date();
    el("nextDaily").textContent   = eta(nextDailyUTC(now)-now);
    el("nextWeekly").textContent  = eta(nextWeeklyUTC(now)-now);
    el("nextMonthly").textContent = eta(firstOfNextMonthUTC(now)-now);
    maybeReset("daily",   state.meta.lastDailyReset,   nextDailyUTC,   "lastDailyReset");
    maybeReset("weekly",  state.meta.lastWeeklyReset,  nextWeeklyUTC,  "lastWeeklyReset");
    maybeReset("monthly", state.meta.lastMonthlyReset, firstOfNextMonthUTC, "lastMonthlyReset");
    requestAnimationFrame(tickClocks);
  }
  function maybeReset(scope, lastIso, nextFn, field) {
    var now = new Date();
    var last = lastIso ? new Date(lastIso) : new Date(0);
    var next = nextFn(last);
    if (now >= next) {
      var arr = state.profiles[getP()].items[scope];
      for (var i=0;i<arr.length;i++) arr[i].done=false;
      state.meta[field] = now.toISOString();
      save(); renderList();
    }
  }
  function eta(ms) { if (ms<0) ms=0; var s=Math.floor(ms/1000); var h=('0'+Math.floor(s/3600)).slice(-2); var m=('0'+Math.floor((s%3600)/60)).slice(-2); var ss=('0'+(s%60)).slice(-2); return h+':'+m+':'+ss; }

  // ===== Helpers =====
  function initDefault() {
    return {
      currentProfile: "0",
      profiles: [emptyProfile("Main")],
      meta: { lastDailyReset: new Date().toISOString(), lastWeeklyReset: new Date().toISOString(), lastMonthlyReset: new Date().toISOString() }
    };
  }
  function emptyProfile(name) { return { name: name, items: { daily: [], weekly: [], monthly: [] } }; }
  function getP(){ return +state.currentProfile; }
  function getScopeArr(){ return state.profiles[getP()].items[currentScope]; }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function load(){ try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } }
  function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

  // Boot
  try {
    refreshProfiles(); render(); tickClocks();
  } catch (e) {
    console.error(e);
    if (badge) badge.textContent = "JS error (open console)";
    alert("JS error: " + e.message);
  }

  function render(){
    refreshProfiles();
    for (var j=0;j<tabs.length;j++){
      var s = tabs[j].getAttribute("data-scope");
      if (s === currentScope) tabs[j].classList.add("active"); else tabs[j].classList.remove("active");
    }
    renderList();
  }
})();
