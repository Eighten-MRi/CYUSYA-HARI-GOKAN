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

  var allDeviceList = [];  // 統合デバイスリスト（注射器+ペン型+プレフィルド）
  var allNeedleList = [];  // 統合針リスト（注射器針+ペン針）

  var currentTab = "device";
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

    // 統合リスト構築
    allDeviceList = [];
    syringeList.forEach(function (item) {
      allDeviceList.push(Object.assign({}, item, { category: "注射器" }));
    });
    penDeviceList.forEach(function (item) {
      allDeviceList.push(Object.assign({}, item, { category: "ペン型" }));
    });
    buildUniquePrefilledDevices(prefilledData).forEach(function (item) {
      allDeviceList.push(Object.assign({}, item, { category: "プレフィルド", connection: "一体型" }));
    });

    var seen = new Set();
    allNeedleList = [];
    needleList.forEach(function (item) {
      var key = item.maker + "\0" + item.model;
      if (!seen.has(key)) { seen.add(key); allNeedleList.push(Object.assign({}, item, { category: "注射器" })); }
    });
    penNeedleList.forEach(function (item) {
      var key = item.maker + "\0" + item.model;
      if (!seen.has(key)) { seen.add(key); allNeedleList.push(Object.assign({}, item, { category: "ペン型" })); }
    });
  }

  // カテゴリ→CSSクラス変換
  function getCategoryClass(category) {
    switch (category) {
      case "注射器": return "syringe";
      case "ペン型": return "pen";
      case "プレフィルド": return "prefilled";
      default: return "default";
    }
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
      case "device": return allDeviceList;
      case "needle_all": return allNeedleList;
      default: return [];
    }
  }

  // --- オートコンプリート候補取得 ---
  function getCandidates(query) {
    var normalizedQuery = toKatakana(query).toLowerCase();
    if (normalizedQuery === "") return [];

    var matches = [];

    if (currentTab === "needle_all") {
      // 針タブ：針のメーカー・製品名で検索
      var list = allNeedleList;
      for (var i = 0; i < list.length && matches.length < 8; i++) {
        var item = list[i];
        var text = toKatakana(item.maker + " " + item.model).toLowerCase();
        if (text.indexOf(normalizedQuery) !== -1) {
          matches.push(item);
        }
      }
    } else if (currentTab === "device") {
      // 製品名から針タブ：薬剤名・一般名のみで検索
      for (var j = 0; j < drugsData.length && matches.length < 10; j++) {
        var drug = drugsData[j];
        var drugText = toKatakana(
          (drug.brand_name || "") + " " + (drug.generic_name || "")
        ).toLowerCase();
        if (drugText.indexOf(normalizedQuery) !== -1 && drug.device_name && drug.device_name.trim() !== "") {
          matches.push({
            maker: drug.maker || "",
            model: drug.brand_name || "",
            deviceName: drug.device_name || "",
            categoryId: drug.category_id || "",
            deviceType: drug.device_type || "",
            isDrug: true
          });
        }
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

    candidates.forEach(function (item) {
      var div = document.createElement("div");
      div.className = "autocomplete-item";

      var detailParts = [];
      var detailHTML = "";
      var categoryHTML = "";
      var bridgeHTML = "";

      if (item.isDrug) {
        // 薬剤→デバイス橋渡し候補
        bridgeHTML = ' <span class="ac-bridge">→ ' + escapeHTML(item.deviceName) + "</span>";
        var typeClass = (item.deviceType || "").indexOf("ペン") !== -1 ? "pen" : "prefilled";
        categoryHTML = ' <span class="ac-category ac-category-' + typeClass + '">' + escapeHTML(item.deviceType || "薬剤") + "</span>";
      } else {
        // 通常デバイス/針候補
        if (currentTab === "device") {
          if (item.spec) detailParts.push(item.spec);
          if (item.connection) detailParts.push(item.connection);
        } else {
          if (item.gauge) detailParts.push(item.gauge);
          if (item.length) detailParts.push(item.length);
          if (item.connection) detailParts.push(item.connection);
        }
        if (detailParts.length > 0) {
          detailHTML = ' <span class="ac-detail">' + escapeHTML(detailParts.join(" / ")) + "</span>";
        }
        if (item.category) {
          categoryHTML = ' <span class="ac-category ac-category-' + getCategoryClass(item.category) + '">' + escapeHTML(item.category) + "</span>";
        }
      }

      div.innerHTML =
        '<span class="maker">' + escapeHTML(item.maker) + "</span> " +
        '<span class="model">' + escapeHTML(item.model) + "</span>" +
        detailHTML + bridgeHTML + categoryHTML;

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

    if (currentTab === "device") {
      // 通常デバイス：プレフィルド（一体型）の場合
      if (!selected.isDrug && selected.category === "プレフィルド") {
        showPrefilledResult(selected);
        return;
      }

      var results;

      if (selected.isDrug) {
        // 薬剤名からデバイス→針を検索
        var devName = selected.deviceName;

        if (!devName || devName.trim() === "") {
          // デバイス名なし（バイアル等）
          statusMessage.textContent = "バイアル製剤です。通常の注射器と針を組み合わせて使用してください";
          statusMessage.className = "status-message";
          return;
        }

        // ペン型データから検索
        results = penData.filter(function (row) {
          return row.device_model === devName;
        });
        // ペン型に見つからなければ注射器データも検索
        if (results.length === 0) {
          results = syringeData.filter(function (row) {
            return row.device_model === devName;
          });
        }
        // それでも見つからなければプレフィルドデータを確認（一体型）
        if (results.length === 0) {
          var isIntegrated = prefilledData.some(function (row) {
            return row.device_model === devName;
          });
          if (isIntegrated) {
            showPrefilledResult(selected);
            return;
          }
        }
      } else {
        var dataSource = selected.category === "注射器" ? syringeData : penData;
        results = dataSource.filter(function (row) {
          return row.device_maker === selected.maker && row.device_model === selected.model;
        });
      }

      if (results.length === 0) {
        statusMessage.textContent = "該当する針が見つかりませんでした";
        statusMessage.className = "status-message";
        return;
      }

      var label = selected.isDrug
        ? selected.model + "（" + selected.deviceName + "）"
        : selected.maker + " " + selected.model;
      statusMessage.textContent = label + " に対応する針: " + results.length + " 件";
      statusMessage.className = "status-message";

      results.forEach(function (row) {
        var card = document.createElement("div");
        card.className = "card";
        card.innerHTML = buildUnifiedCardHTML(row, "needle_result");
        resultsContainer.appendChild(card);
      });

    } else if (currentTab === "needle_all") {
      // 針からデバイスを検索（注射器・ペン型横断）
      var results = [];
      syringeData.forEach(function (row) {
        if (row.needle_maker === selected.maker && row.needle_model === selected.model) {
          results.push({ row: row, category: "注射器" });
        }
      });
      penData.forEach(function (row) {
        if (row.needle_maker === selected.maker && row.needle_model === selected.model) {
          results.push({ row: row, category: "ペン型" });
        }
      });

      if (results.length === 0) {
        statusMessage.textContent = "該当する注射デバイスが見つかりませんでした";
        statusMessage.className = "status-message";
        return;
      }

      statusMessage.textContent = selected.maker + " " + selected.model + " に対応するデバイス: " + results.length + " 件";
      statusMessage.className = "status-message";

      results.forEach(function (item) {
        var card = document.createElement("div");
        card.className = "card";
        card.innerHTML = buildUnifiedCardHTML(item.row, "device_result", item.category);
        resultsContainer.appendChild(card);
      });
    }
  }

  // --- プレフィルド一体型カード表示 ---
  function showPrefilledResult(selected) {
    var name = selected.isDrug ? selected.model : (selected.maker + " " + selected.model);
    statusMessage.textContent = name + "（プレフィルド・一体型）";
    statusMessage.className = "status-message";

    var card = document.createElement("div");
    card.className = "card card-prefilled";

    var html = '<span class="card-category-tag tag-prefilled">プレフィルド</span>' +
      '<div class="card-maker">' + escapeHTML(selected.maker) + "</div>" +
      '<div class="card-model">' + escapeHTML(selected.isDrug ? selected.model : selected.model) + "</div>";

    if (selected.spec) {
      html += '<div class="card-specs">' + escapeHTML(selected.spec) + "</div>";
    }
    if (selected.isDrug && selected.deviceName) {
      html += '<div class="card-specs">デバイス: ' + escapeHTML(selected.deviceName) + "</div>";
    }

    html += '<span class="card-badge badge-integrated">一体型</span>';
    html += '<div class="card-notes">針と本体が一体型のため、別途針の準備は不要です</div>';

    if (selected.notes && selected.notes.trim() !== "") {
      html += '<div class="card-notes">' + escapeHTML(selected.notes) + "</div>";
    }

    card.innerHTML = html;
    resultsContainer.appendChild(card);
  }

  // --- 結果カードHTML生成 ---
  function buildUnifiedCardHTML(row, resultType, category) {
    var maker, model, specParts = [];

    if (resultType === "needle_result") {
      maker = row.needle_maker || "";
      model = row.needle_model || "";
      if (row.needle_gauge) specParts.push(row.needle_gauge);
      if (row.needle_length) specParts.push(row.needle_length);
      if (row.needle_connection) specParts.push(row.needle_connection);
    } else {
      maker = row.device_maker || "";
      model = row.device_model || "";
      if (row.device_spec) specParts.push(row.device_spec);
      if (row.device_connection) specParts.push(row.device_connection);
    }

    var displayCategory = category || (row.category || "").trim();
    var compatibility = row.compatibility || "";
    var notes = row.notes || "";
    var source = row.source || "";

    var html = "";
    if (displayCategory) {
      html += '<span class="card-category-tag tag-' + getCategoryClass(displayCategory) + '">' +
              escapeHTML(displayCategory) + "</span>";
    }

    html +=
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
      case "device": return "薬剤名・一般名を入力...";
      case "needle_all": return "針の製品名やメーカー名を入力...";
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

    statusMessage.textContent = "製品名やメーカー名を入力して検索してください";
    statusMessage.className = "status-message";

    searchInput.focus();
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
  tabs.forEach(function (tabEl) {
    tabEl.addEventListener("click", function () {
      switchTab(tabEl.getAttribute("data-tab"));
    });
  });

  // --- 初期化 ---
  searchInput.disabled = true;
  loadCSV();
})();
