// === 在宅注射 互換性検索 — メインロジック ===

(function () {
  "use strict";

  // --- State ---
  var allData = [];
  var syringeData = [];   // category=注射器
  var penData = [];        // category=ペン型
  var prefilledData = [];  // category=プレフィルド
  var drugsData = [];      // c101_medications.csv

  var syringeList = [];    // unique syringes (from syringeData)
  var needleList = [];     // unique needles (from syringeData)
  var penDeviceList = [];  // unique pen devices (from penData)
  var penNeedleList = [];  // unique pen needles (from penData)

  var currentTab = "syringe";
  var highlightIndex = -1;
  var currentCandidates = [];

  // --- DOM ---
  var searchInput = document.getElementById("search-input");
  var autocompleteList = document.getElementById("autocomplete-list");
  var resultsContainer = document.getElementById("results");
  var statusMessage = document.getElementById("status-message");
  var tabs = document.querySelectorAll(".tab");

  // --- ひらがな→カタカナ変換 ---
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 96);
    });
  }

  // --- HTMLエスケープ ---
  function escapeHTML(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- カテゴリ別にデータを振り分け＆ユニークリスト生成 ---
  function buildAllLists(data) {
    syringeData = [];
    penData = [];
    prefilledData = [];

    data.forEach(function (row) {
      var cat = (row.category || "").trim();
      if (cat === "注射器") syringeData.push(row);
      else if (cat === "ペン型") penData.push(row);
      else if (cat === "プレフィルド") prefilledData.push(row);
    });

    syringeList = buildUniqueDevices(syringeData);
    needleList = buildUniqueNeedles(syringeData);
    penDeviceList = buildUniqueDevices(penData);
    penNeedleList = buildUniqueNeedles(penData);
  }

  function buildUniqueDevices(rows) {
    var seen = new Set();
    var list = [];
    rows.forEach(function (row) {
      var key = row.device_maker + "\0" + row.device_model;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          maker: row.device_maker || "",
          model: row.device_model || "",
          spec: row.device_spec || "",
          connection: row.device_connection || ""
        });
      }
    });
    return list;
  }

  function buildUniqueNeedles(rows) {
    var seen = new Set();
    var list = [];
    rows.forEach(function (row) {
      if (!row.needle_maker && !row.needle_model) return;
      var key = row.needle_maker + "\0" + row.needle_model;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          maker: row.needle_maker || "",
          model: row.needle_model || "",
          gauge: row.needle_gauge || "",
          length: row.needle_length || "",
          connection: row.needle_connection || ""
        });
      }
    });
    return list;
  }

  function buildUniquePrefilledDevices(rows) {
    var seen = new Set();
    var list = [];
    rows.forEach(function (row) {
      var key = row.device_maker + "\0" + row.device_model;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          maker: row.device_maker || "",
          model: row.device_model || "",
          spec: row.device_spec || "",
          notes: row.notes || ""
        });
      }
    });
    return list;
  }

  // --- CSV読み込み ---
  function loadCSV() {
    statusMessage.textContent = "データ読み込み中...";
    statusMessage.className = "status-message";

    var compatPromise = fetch("data/compatibility.csv")
      .then(function (response) {
        if (!response.ok) throw new Error("compatibility.csv読み込みエラー（HTTP " + response.status + "）");
        return response.text();
      })
      .then(function (text) {
        var result = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (result.errors.length > 0) throw new Error("CSVパースエラー: " + result.errors[0].message);
        allData = result.data;
        buildAllLists(allData);
      });

    var drugsPromise = fetch("data/c101_medications.csv")
      .then(function (response) {
        if (!response.ok) throw new Error("c101_medications.csv読み込みエラー（HTTP " + response.status + "）");
        return response.text();
      })
      .then(function (text) {
        var result = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (result.errors.length > 0) throw new Error("薬剤CSVパースエラー: " + result.errors[0].message);
        drugsData = result.data;
      });

    Promise.all([compatPromise, drugsPromise])
      .then(function () {
        statusMessage.textContent = "製品名やメーカー名を入力して検索してください";
        searchInput.disabled = false;
        searchInput.focus();
      })
      .catch(function (err) {
        statusMessage.textContent = "エラー: " + err.message;
        statusMessage.className = "status-message error";
        searchInput.disabled = true;
      });
  }

  // --- 現在のタブに応じた検索対象リスト ---
  function getActiveList() {
    switch (currentTab) {
      case "syringe": return syringeList;
      case "needle": return needleList;
      case "pen_device": return penDeviceList;
      case "pen_needle": return penNeedleList;
      default: return [];
    }
  }

  // --- 薬剤一覧表示 ---
  function showDrugList(filterText) {
    resultsContainer.innerHTML = "";
    var items = drugsData;

    if (filterText) {
      var q = toKatakana(filterText).toLowerCase();
      items = items.filter(function (row) {
        var text = toKatakana(
          (row.brand_name || "") + " " +
          (row.generic_name || "") + " " +
          (row.maker || "") + " " +
          (row.indication || "")
        ).toLowerCase();
        return text.indexOf(q) !== -1;
      });
    }

    if (items.length === 0) {
      statusMessage.textContent = "該当する薬剤が見つかりませんでした";
      statusMessage.className = "status-message";
      return;
    }

    statusMessage.textContent = items.length + " 件の薬剤が見つかりました";
    statusMessage.className = "status-message";

    items.forEach(function (row) {
      var card = document.createElement("div");
      card.className = "card card-drug";
      card.innerHTML = buildDrugCardHTML(row);
      resultsContainer.appendChild(card);
    });
  }

  function buildDrugCardHTML(row) {
    var html = '<div class="card-maker">' + escapeHTML(row.maker || "") + "</div>" +
      '<div class="card-model">' + escapeHTML(row.brand_name || "") + "</div>";

    if (row.generic_name) {
      html += '<div class="card-specs">' + escapeHTML(row.generic_name) + "</div>";
    }

    var deviceText = row.device_type || "";
    if (row.device_name && row.device_name.trim() && row.device_name !== "") {
      deviceText += "（" + row.device_name + "）";
    }
    if (deviceText) {
      html += '<div class="card-specs">デバイス: ' + escapeHTML(deviceText) + "</div>";
    }

    if (row.dose) {
      html += '<div class="card-specs">用量: ' + escapeHTML(row.dose) + "</div>";
    }

    if (row.frequency) {
      html += '<div class="card-specs">投与頻度: ' + escapeHTML(row.frequency) + "</div>";
    }

    if (row.indication) {
      html += '<div class="card-specs">適応: ' + escapeHTML(row.indication) + "</div>";
    }

    if (row.self_injection) {
      var badgeClass = row.self_injection === "可" ? "badge-confirmed" :
        row.self_injection.indexOf("条件") !== -1 ? "badge-standard" : "badge-incompatible";
      html += '<span class="card-badge ' + badgeClass + '">自己注射: ' + escapeHTML(row.self_injection) + "</span>";
    }

    // ペン型はJIS A型ペンニードル対応の注記
    var dt = (row.device_type || "").toLowerCase();
    if (dt.indexOf("ペン") !== -1 || dt.indexOf("カートリッジ") !== -1) {
      html += '<div class="card-notes">JIS T 3226-2 A型ペンニードルが使用可能</div>';
    }

    return html;
  }

  // --- オートコンプリート候補取得 ---
  function getCandidates(query) {
    if (currentTab === "prefilled" || currentTab === "drug") return [];
    var list = getActiveList();
    var normalizedQuery = toKatakana(query).toLowerCase();

    if (normalizedQuery === "") return [];

    var matches = [];
    for (var i = 0; i < list.length && matches.length < 10; i++) {
      var item = list[i];
      var text = toKatakana(item.maker + " " + item.model).toLowerCase();
      if (text.indexOf(normalizedQuery) !== -1) {
        matches.push(item);
      }
    }
    return matches;
  }

  // --- オートコンプリート表示 ---
  function showAutocomplete(candidates) {
    autocompleteList.innerHTML = "";
    currentCandidates = candidates;
    highlightIndex = -1;

    if (candidates.length === 0) {
      autocompleteList.classList.remove("visible");
      return;
    }

    candidates.forEach(function (item, idx) {
      var div = document.createElement("div");
      div.className = "autocomplete-item";

      var detailParts = [];
      if (currentTab === "syringe" || currentTab === "pen_device") {
        if (item.spec) detailParts.push(item.spec);
        if (item.connection) detailParts.push(item.connection);
      } else {
        if (item.gauge) detailParts.push(item.gauge);
        if (item.length) detailParts.push(item.length);
        if (item.connection) detailParts.push(item.connection);
      }
      var detailHTML = detailParts.length > 0
        ? ' <span class="ac-detail">' + escapeHTML(detailParts.join(" / ")) + "</span>"
        : "";

      div.innerHTML =
        '<span class="maker">' + escapeHTML(item.maker) + "</span> " +
        '<span class="model">' + escapeHTML(item.model) + "</span>" +
        detailHTML;
      div.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectCandidate(item);
      });
      autocompleteList.appendChild(div);
    });

    autocompleteList.classList.add("visible");
  }

  function hideAutocomplete() {
    autocompleteList.classList.remove("visible");
    currentCandidates = [];
    highlightIndex = -1;
  }

  // --- 候補選択 ---
  function selectCandidate(item) {
    searchInput.value = item.maker + " " + item.model;
    hideAutocomplete();
    performSearch(item);
  }

  // --- 検索実行 ---
  function performSearch(selected) {
    resultsContainer.innerHTML = "";

    var dataSource, results;

    if (currentTab === "syringe" || currentTab === "needle") {
      dataSource = syringeData;
    } else if (currentTab === "pen_device" || currentTab === "pen_needle") {
      dataSource = penData;
    } else {
      return;
    }

    if (currentTab === "syringe" || currentTab === "pen_device") {
      results = dataSource.filter(function (row) {
        return row.device_maker === selected.maker && row.device_model === selected.model;
      });
    } else {
      results = dataSource.filter(function (row) {
        return row.needle_maker === selected.maker && row.needle_model === selected.model;
      });
    }

    if (results.length === 0) {
      statusMessage.textContent = "該当する製品が見つかりませんでした";
      statusMessage.className = "status-message";
      return;
    }

    statusMessage.textContent = results.length + " 件の互換製品が見つかりました";
    statusMessage.className = "status-message";

    results.forEach(function (row) {
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML = buildCardHTML(row);
      resultsContainer.appendChild(card);
    });
  }

  // --- 結果カードHTML生成 ---
  function buildCardHTML(row) {
    var maker, model, specParts = [], compatibility, notes, source;

    if (currentTab === "syringe" || currentTab === "pen_device") {
      // デバイスから検索 → 針を表示
      maker = row.needle_maker || "";
      model = row.needle_model || "";
      if (row.needle_gauge) specParts.push(row.needle_gauge);
      if (row.needle_length) specParts.push(row.needle_length);
      if (row.needle_connection) specParts.push(row.needle_connection);
    } else {
      // 針から検索 → デバイスを表示
      maker = row.device_maker || "";
      model = row.device_model || "";
      if (row.device_spec) specParts.push(row.device_spec);
      if (row.device_connection) specParts.push(row.device_connection);
    }

    compatibility = row.compatibility || "";
    notes = row.notes || "";
    source = row.source || "";

    var html =
      '<div class="card-maker">' + escapeHTML(maker) + "</div>" +
      '<div class="card-model">' + escapeHTML(model) + "</div>";

    if (specParts.length > 0) {
      html += '<div class="card-specs">' + escapeHTML(specParts.join(" / ")) + "</div>";
    }

    if (compatibility) {
      html += '<span class="card-badge ' + getBadgeClass(compatibility) + '">' +
        escapeHTML(compatibility) + "</span>";
    }

    if (notes && notes.trim() !== "") {
      html += '<div class="card-notes">' + escapeHTML(notes) + "</div>";
    }

    if (source && source.trim() !== "") {
      html += '<div class="card-source">出典: ' + escapeHTML(source) + "</div>";
    }

    return html;
  }

  // --- バッジクラス判定 ---
  function getBadgeClass(compatibility) {
    switch (compatibility) {
      case "確認済": return "badge-confirmed";
      case "規格適合": return "badge-standard";
      case "非互換": return "badge-incompatible";
      case "一体型": return "badge-integrated";
      default: return "badge-standard";
    }
  }

  // --- プレフィルド一覧表示 ---
  function showPrefilledList(filterText) {
    resultsContainer.innerHTML = "";
    var items = buildUniquePrefilledDevices(prefilledData);

    if (filterText) {
      var q = toKatakana(filterText).toLowerCase();
      items = items.filter(function (item) {
        var text = toKatakana(item.maker + " " + item.model + " " + item.spec).toLowerCase();
        return text.indexOf(q) !== -1;
      });
    }

    if (items.length === 0) {
      statusMessage.textContent = "該当するプレフィルド製剤が見つかりませんでした";
      statusMessage.className = "status-message";
      return;
    }

    statusMessage.textContent = items.length + " 件のプレフィルド製剤";
    statusMessage.className = "status-message";

    items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "card card-prefilled";

      var html =
        '<div class="card-maker">' + escapeHTML(item.maker) + "</div>" +
        '<div class="card-model">' + escapeHTML(item.model) + "</div>";

      if (item.spec) {
        html += '<div class="card-specs">' + escapeHTML(item.spec) + "</div>";
      }

      html += '<span class="card-badge badge-integrated">一体型</span>';

      if (item.notes && item.notes.trim() !== "") {
        html += '<div class="card-notes">' + escapeHTML(item.notes) + "</div>";
      }

      card.innerHTML = html;
      resultsContainer.appendChild(card);
    });
  }

  // --- タブ別プレースホルダー ---
  function getPlaceholder() {
    switch (currentTab) {
      case "syringe": return "注射器の製品名やメーカー名を入力...";
      case "needle": return "針の製品名やメーカー名を入力...";
      case "pen_device": return "ペン型デバイス名やメーカー名を入力...";
      case "pen_needle": return "ペンニードル名やメーカー名を入力...";
      case "prefilled": return "プレフィルド製剤名で絞り込み...";
      case "drug": return "薬剤名・一般名・適応で絞り込み...";
      default: return "検索...";
    }
  }

  // --- ハイライト更新 ---
  function updateHighlight() {
    var items = autocompleteList.querySelectorAll(".autocomplete-item");
    items.forEach(function (el, i) {
      el.classList.toggle("highlighted", i === highlightIndex);
    });
    if (highlightIndex >= 0 && items[highlightIndex]) {
      items[highlightIndex].scrollIntoView({ block: "nearest" });
    }
  }

  // --- タブ切替処理 ---
  function switchTab(tabName) {
    currentTab = tabName;

    tabs.forEach(function (t) { t.classList.remove("active"); });
    document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add("active");

    searchInput.value = "";
    hideAutocomplete();
    resultsContainer.innerHTML = "";
    searchInput.placeholder = getPlaceholder();

    if (currentTab === "prefilled") {
      showPrefilledList("");
    } else if (currentTab === "drug") {
      showDrugList("");
    } else {
      statusMessage.textContent = "製品名やメーカー名を入力して検索してください";
      statusMessage.className = "status-message";
    }

    searchInput.focus();
  }

  // --- イベントリスナー ---

  // 入力イベント
  searchInput.addEventListener("input", function () {
    var query = searchInput.value.trim();

    if (currentTab === "prefilled") {
      showPrefilledList(query);
      return;
    }

    if (currentTab === "drug") {
      showDrugList(query);
      return;
    }

    var candidates = getCandidates(query);
    showAutocomplete(candidates);
    if (query === "") {
      resultsContainer.innerHTML = "";
      statusMessage.textContent = "製品名やメーカー名を入力して検索してください";
      statusMessage.className = "status-message";
    }
  });

  // キーボード操作
  searchInput.addEventListener("keydown", function (e) {
    if (!autocompleteList.classList.contains("visible")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, currentCandidates.length - 1);
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
      updateHighlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && currentCandidates[highlightIndex]) {
        selectCandidate(currentCandidates[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      hideAutocomplete();
    }
  });

  // フォーカス外れたら閉じる
  searchInput.addEventListener("blur", function () {
    setTimeout(hideAutocomplete, 150);
  });

  // タブ切り替え
  tabs.forEach(function (tabEl) {
    tabEl.addEventListener("click", function () {
      switchTab(tabEl.getAttribute("data-tab"));
    });
  });

  // --- 初期化 ---
  searchInput.disabled = true;
  loadCSV();
})();
