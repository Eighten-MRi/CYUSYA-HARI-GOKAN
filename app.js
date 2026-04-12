// === 注射と針の互換性検索 — メインロジック ===

(function () {
  "use strict";

  // --- State ---
  let compatibilityData = [];
  let syringeList = []; // { maker, model }
  let needleList = [];  // { maker, model }
  let currentTab = "syringe"; // "syringe" | "needle"
  let highlightIndex = -1;
  let currentCandidates = [];

  // --- DOM ---
  const searchInput = document.getElementById("search-input");
  const autocompleteList = document.getElementById("autocomplete-list");
  const resultsContainer = document.getElementById("results");
  const statusMessage = document.getElementById("status-message");
  const tabs = document.querySelectorAll(".tab");

  // --- ひらがな→カタカナ変換 ---
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 96);
    });
  }

  // --- 重複排除ユニークリスト生成 ---
  function buildUniqueLists(data) {
    const syringeSet = new Set();
    const needleSet = new Set();
    const syringes = [];
    const needles = [];

    data.forEach(function (row) {
      const sKey = row.syringe_maker + "\0" + row.syringe_model;
      if (!syringeSet.has(sKey)) {
        syringeSet.add(sKey);
        syringes.push({
          maker: row.syringe_maker,
          model: row.syringe_model,
          volume: row.syringe_volume_ml || "",
          tipType: row.syringe_tip_type || ""
        });
      }
      const nKey = row.needle_maker + "\0" + row.needle_model;
      if (!needleSet.has(nKey)) {
        needleSet.add(nKey);
        needles.push({
          maker: row.needle_maker,
          model: row.needle_model,
          gauge: row.needle_gauge || "",
          length: row.needle_length || "",
          connection: row.needle_connection || ""
        });
      }
    });

    return { syringes: syringes, needles: needles };
  }

  // --- CSV読み込み ---
  function loadCSV() {
    statusMessage.textContent = "データ読み込み中...";
    statusMessage.className = "status-message";

    fetch("data/compatibility.csv")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("CSV読み込みエラー（HTTP " + response.status + "）");
        }
        return response.text();
      })
      .then(function (text) {
        var result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
        });

        if (result.errors.length > 0) {
          throw new Error("CSVパースエラー: " + result.errors[0].message);
        }

        compatibilityData = result.data;
        var lists = buildUniqueLists(compatibilityData);
        syringeList = lists.syringes;
        needleList = lists.needles;

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

  // --- オートコンプリート候補取得 ---
  function getCandidates(query) {
    var list = currentTab === "syringe" ? syringeList : needleList;
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
      if (currentTab === "syringe") {
        if (item.volume) detailParts.push(item.volume + "mL");
        if (item.tipType) detailParts.push(item.tipType);
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

  // --- HTMLエスケープ ---
  function escapeHTML(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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

    var results;
    if (currentTab === "syringe") {
      results = compatibilityData.filter(function (row) {
        return row.syringe_maker === selected.maker && row.syringe_model === selected.model;
      });
    } else {
      results = compatibilityData.filter(function (row) {
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
      var maker, model, notes, specs, compatibility;
      var specParts = [];
      if (currentTab === "syringe") {
        maker = row.needle_maker;
        model = row.needle_model;
        if (row.needle_gauge) specParts.push(row.needle_gauge);
        if (row.needle_length) specParts.push(row.needle_length);
      } else {
        maker = row.syringe_maker;
        model = row.syringe_model;
        if (row.syringe_volume_ml) specParts.push(row.syringe_volume_ml + "mL");
        if (row.syringe_tip_type) specParts.push(row.syringe_tip_type);
      }
      specs = specParts.join(" / ");
      notes = row.notes;
      compatibility = row.compatibility || "";

      var card = document.createElement("div");
      card.className = "card";

      var html =
        '<div class="card-maker">' + escapeHTML(maker) + "</div>" +
        '<div class="card-model">' + escapeHTML(model) + "</div>";

      if (specs) {
        html += '<div class="card-specs">' + escapeHTML(specs) + "</div>";
      }

      if (compatibility) {
        var badgeClass = compatibility === "確認済" ? "badge-confirmed" : "badge-standard";
        html += '<span class="card-badge ' + badgeClass + '">' + escapeHTML(compatibility) + "</span>";
      }

      if (notes && notes.trim() !== "") {
        html += '<div class="card-notes">' + escapeHTML(notes) + "</div>";
      }

      card.innerHTML = html;
      resultsContainer.appendChild(card);
    });
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

  // --- イベントリスナー ---

  // 入力イベント
  searchInput.addEventListener("input", function () {
    var query = searchInput.value.trim();
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
  tabs.forEach(function (tabEl, idx) {
    tabEl.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tabEl.classList.add("active");
      currentTab = idx === 0 ? "syringe" : "needle";

      searchInput.value = "";
      hideAutocomplete();
      resultsContainer.innerHTML = "";
      statusMessage.textContent = "製品名やメーカー名を入力して検索してください";
      statusMessage.className = "status-message";
      searchInput.placeholder = idx === 0
        ? "注射器の製品名やメーカー名を入力..."
        : "針の製品名やメーカー名を入力...";
      searchInput.focus();
    });
  });

  // --- 初期化 ---
  searchInput.disabled = true;
  loadCSV();
})();
