# ペン型カートリッジ薬剤の検索結果に再利用型ペン本体と針を表示

## Context
薬剤検索で「ノボラピッド注（ペンフィル 3mL）」等のペン型カートリッジ薬剤を選んでも「該当する針が見つかりませんでした」と出る。
原因: c101_medications.csv の device_name は "ペンフィル 3mL"（カートリッジ名）だが、compatibility.csv にはカートリッジ名でなくペンデバイス名（フレックスタッチ等）しか登録されていないため検索が空になる。
目的: 再利用型ペン本体（ノボペン5 等）と対応針を検索結果に表示する。

---

## 現状データ整理

| カートリッジ名 | メーカー（c101_medicationsのmaker列） | 対応再利用型ペン |
|---|---|---|
| ペンフィル 3mL | ノボ ノルディスク | ノボペン5、ノボペン エコーPlus |
| カート 3mL | 日本イーライリリー | ヒューマペン サビオ |
| カート 3mL | サノフィ | 日本では販売終了 |

⚠️ 注意: c101_medications.csvは「ノボ ノルディスク」（スペースあり）、compatibility.csvは「ノボノルディスク」（スペースなし）と表記が異なる。

---

## 変更内容

### 1. `data/compatibility.csv`

既存ペン型行（フレックスタッチ・ソロスター・ミリオペン）の直後に8行追加:

```
ペン型,1,ノボノルディスク,ノボペン5,インスリン,JIS T 3226-2 A型,BD,マイクロファインプラス 32G×4mm,32G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,ノボノルディスク,ノボペン5,インスリン,JIS T 3226-2 A型,テルモ,ナノパス34 34G×4mm,34G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,ノボノルディスク,ノボペン5,インスリン,JIS T 3226-2 A型,ニプロ,ニプロペンニードル 32G×4mm,32G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,ノボノルディスク,ノボペン エコーPlus,インスリン,JIS T 3226-2 A型,BD,マイクロファインプラス 32G×4mm,32G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,ノボノルディスク,ノボペン エコーPlus,インスリン,JIS T 3226-2 A型,テルモ,ナノパス34 34G×4mm,34G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,ノボノルディスク,ノボペン エコーPlus,インスリン,JIS T 3226-2 A型,ニプロ,ニプロペンニードル 32G×4mm,32G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,日本イーライリリー,ヒューマペン サビオ,インスリン,JIS T 3226-2 A型,BD,マイクロファインプラス 32G×4mm,32G,4mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
ペン型,1,日本イーライリリー,ヒューマペン サビオ,インスリン,JIS T 3226-2 A型,テルモ,ナノパス34 34G×3mm,34G,3mm,JIS T 3226-2 A型,規格適合,JIS T 3226-2 A型準拠ペンニードル共通,サンプル,2026-04
```

---

### 2. `app.js`

#### 2-A. CARTRIDGE_TO_PENS 定数を追加
配置: `"use strict";` の直後（State変数の前）。  
キーは `c101_medications.csv` の `maker|device_name`、値の maker は `compatibility.csv` の表記に合わせる。

```javascript
var CARTRIDGE_TO_PENS = {
  "ノボ ノルディスク|ペンフィル 3mL": [
    { maker: "ノボノルディスク", model: "ノボペン5" },
    { maker: "ノボノルディスク", model: "ノボペン エコーPlus" }
  ],
  "日本イーライリリー|カート 3mL": [
    { maker: "日本イーライリリー", model: "ヒューマペン サビオ" }
  ],
  "サノフィ|カート 3mL": null  // 日本では再利用型ペン販売終了
};
```

#### 2-B. performSearch() の isDrug 分岐を修正
既存の「ペン型データから検索」ロジックの前に、ペン型カートリッジの分岐を追加:

```javascript
// ペン型カートリッジの場合はCARTRIDGE_TO_PENSで対応ペンを探す
if ((selected.deviceType || "") === "ペン型カートリッジ") {
  var cartKey = selected.maker + "|" + devName;
  if (cartKey in CARTRIDGE_TO_PENS) {
    var penEntries = CARTRIDGE_TO_PENS[cartKey];
    if (penEntries === null) {
      showCartridgeDiscontinuedResult(selected);
    } else {
      showCartridgePenResult(selected, penEntries);
    }
    return;
  }
  // キーがない場合はフォールスルーして既存ロジックへ
}
```

#### 2-C. showCartridgePenResult() 関数を追加
showPrefilledResult() の直後に追加:

```javascript
function showCartridgePenResult(selected, penEntries) {
  statusMessage.textContent =
    selected.model + "（" + selected.deviceName + "）— 再利用型ペン本体と対応針: " + penEntries.length + " 機種";
  statusMessage.className = "status-message";

  // インフォカード（カートリッジ説明）
  var infoCard = document.createElement("div");
  infoCard.className = "card card-cartridge-info";
  infoCard.innerHTML =
    '<span class="card-category-tag tag-pen">ペン型カートリッジ</span>' +
    '<div class="card-model">' + escapeHTML(selected.model) + '</div>' +
    '<div class="card-specs">カートリッジ: ' + escapeHTML(selected.deviceName) + '</div>' +
    '<div class="card-notes">カートリッジ製剤は別売りの再利用型ペン本体にセットして使用します。下記ペン本体を用意し、JIS T 3226-2 A型対応のペン針を取り付けてください。</div>';
  resultsContainer.appendChild(infoCard);

  penEntries.forEach(function (penEntry) {
    // ペン本体カード
    var penCard = document.createElement("div");
    penCard.className = "card card-pen-body";
    penCard.innerHTML =
      '<span class="card-category-tag tag-pen">再利用型ペン本体</span>' +
      '<div class="card-maker">' + escapeHTML(penEntry.maker) + '</div>' +
      '<div class="card-model">' + escapeHTML(penEntry.model) + '</div>';
    resultsContainer.appendChild(penCard);

    // そのペン対応の針カード
    var needles = penData.filter(function (row) {
      return row.device_maker === penEntry.maker && row.device_model === penEntry.model;
    });
    needles.forEach(function (row) {
      var needleCard = document.createElement("div");
      needleCard.className = "card card-needle-child";
      needleCard.innerHTML = buildUnifiedCardHTML(row, "needle_result");
      resultsContainer.appendChild(needleCard);
    });
  });
}
```

#### 2-D. showCartridgeDiscontinuedResult() 関数を追加
showCartridgePenResult() の直後に追加（サノフィ カート 3mL 対応）:

```javascript
function showCartridgeDiscontinuedResult(selected) {
  statusMessage.textContent = selected.model + "（" + selected.deviceName + "）";
  statusMessage.className = "status-message";
  var card = document.createElement("div");
  card.className = "card card-cartridge-info";
  card.innerHTML =
    '<span class="card-category-tag tag-pen">ペン型カートリッジ</span>' +
    '<div class="card-model">' + escapeHTML(selected.model) + '</div>' +
    '<div class="card-specs">カートリッジ: ' + escapeHTML(selected.deviceName) + '</div>' +
    '<div class="card-notes">日本では本剤に対応する再利用型ペン本体は現在販売されていません。ソロスター（プレフィルドペン）版のご利用をご確認ください。</div>';
  resultsContainer.appendChild(card);
}
```

---

### 3. `style.css`

ファイル末尾に追加:

```css
/* === カートリッジ薬剤用カード === */
.card-cartridge-info {
  border-left: 4px solid #F59E0B;
}

.card-pen-body {
  border-left: 4px solid #0077B6;
}

.card-needle-child {
  margin-left: 16px;
  border-left: 4px solid #93C5FD;
}
```

---

## 検証方法

1. `python -m http.server 8000` 起動
2. 「製品名から針」タブで "ノボラピッド" を入力
3. 「ノボ ノルディスク ノボラピッド注 → ペンフィル 3mL」を選択
   - 期待: インフォカード + ノボペン5（針3件）+ ノボペン エコーPlus（針3件）が表示
4. 「ノボラピッド注 → フレックスタッチ」を選択
   - 期待: 既存動作（フレックスタッチ対応針3件）が表示（回帰なし）
5. "ヒューマログ" → カート 3mL 選択
   - 期待: ヒューマペン サビオ + 針2件
6. "アピドラ" → カート 3mL 選択
   - 期待: 販売終了説明カードが表示
