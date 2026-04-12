# UI簡素化: 6タブ → 3タブ + 薬剤名からデバイス検索

## Context

**問題1**: UIが注射器・ペン型・プレフィルドで6タブに分かれており複雑。「注射系」と「針」の2分類で十分。

**問題2**: 「ノボラピッド」等の薬剤名で検索しても互換針が見つからない。ユーザーは薬の名前でデバイスを認識しているのに、現状はハードウェア名（フレックスタッチ等）でしか検索できない。

**解決**: 6タブ→3タブに統合し、注射デバイスタブでは薬剤名（c101_medications.csv）からも検索可能にする。`category_id`で薬剤→デバイス→互換針を橋渡しする。

---

## CSVデータは変更しない（UI側のみ）

---

## 変更ファイルと内容

### 1. [index.html](index.html) (lines 14-20)

6タブ → 3タブに置換:

```html
<button class="tab active" data-tab="device">注射デバイス→針</button>
<button class="tab" data-tab="needle_all">針→注射デバイス</button>
<button class="tab" data-tab="drug">薬剤から検索</button>
```

### 2. [app.js](app.js) — メインロジック

#### 2a. State変数 (lines 7-18)
- `currentTab` デフォルト: `"syringe"` → `"device"`
- 追加: `allDeviceList = []`, `allNeedleList = []`（統合リスト）

#### 2b. `buildAllLists()` 拡張 (lines 44-60)
既存のカテゴリ分割はそのまま維持（内部検索で必要）。末尾に統合リスト構築を追加:

- **`allDeviceList`**: syringeList（各itemに`category:"注射器"`付与）+ penDeviceList（`category:"ペン型"`）+ prefilledDevices（`category:"プレフィルド"`）
- **`allNeedleList`**: needleList（`category:"注射器"`）+ penNeedleList（`category:"ペン型"`）。maker+modelで重複排除

#### 2c. ヘルパー関数追加（新規）
- `getCategoryClass(category)`: `注射器→"syringe"`, `ペン型→"pen"`, `プレフィルド→"prefilled"`

#### 2d. `getActiveList()` 書き換え (lines 160-168)
`"device"` → `allDeviceList`, `"needle_all"` → `allNeedleList` の2分岐

#### 2e. `getCandidates()` 修正 (lines 249-265) ★重要な変更点
- `prefilled` ガード削除、`drug` ガードのみ残す
- **`currentTab === "device"` の場合**: デバイス名マッチに加えて **薬剤名（brand_name, generic_name）でもマッチ検索** を追加
  - drugsData を検索し、マッチした薬剤の `device_name` と `category_id` を使って橋渡し
  - オートコンプリート候補に `{ maker: row.maker, model: row.brand_name, deviceName: row.device_name, categoryId: row.category_id, isDrug: true }` として追加
  - 例: 「ノボラピ」→ 候補に「ノボ ノルディスク ノボラピッド注（→フレックスタッチ）」が表示される

#### 2f. `showAutocomplete()` 修正 (lines 268-307)
- `currentTab === "device"` で spec/connection 表示、needle系で gauge/length/connection 表示
- カテゴリタグ（注射器/ペン型/プレフィルド）をバッジとして各候補に表示
- **薬剤候補（`isDrug: true`）の場合**: 薬剤名と「→ デバイス名」を表示。例: `「ノボラピッド注 → フレックスタッチ」`

#### 2g. `performSearch()` 全面書き換え (lines 323-361)

**deviceタブ選択時**:
- **薬剤候補（`isDrug: true`）が選択された場合**:
  - `categoryId` で compatibility.csv のペン型/プレフィルドデータを検索
  - `device_name` でフィルタ（例: フレックスタッチ）
  - 互換針リストを表示
  - プレフィルド（一体型）の場合は `showPrefilledResult()` で一体型カード表示
- **通常デバイス候補の場合**:
  - `selected.category` でデータソース判定（`注射器`→syringeData, `ペン型`→penData）
  - `プレフィルド` → `showPrefilledResult()`
  - マッチした互換針を表示

**needle_allタブ選択時**:
- syringeData と penData の**両方**を検索
- マッチした互換デバイスを category 情報付きで表示

#### 2h. `showPrefilledResult()` 新規追加
プレフィルドデバイス選択時に「一体型」カードを表示する専用関数

#### 2i. `buildCardHTML()` → `buildUnifiedCardHTML()` 置換 (lines 364-408)
- `resultType` パラメータ（`"needle_result"` / `"device_result"`）で表示内容切替
- カテゴリタグ（注射器/ペン型/プレフィルド）を各結果カードに表示

#### 2j. `getPlaceholder()` 修正 (lines 467-477)
```
"device" → "デバイス名・薬剤名を入力..."
"needle_all" → "針の製品名やメーカー名を入力..."
```

#### 2k. `switchTab()` 修正 (lines 491-512)
- `prefilled` 分岐削除

#### 2l. `input` イベントリスナー修正 (lines 517-537)
- `prefilled` 分岐削除

#### 2m. `showPrefilledList()` 削除 (lines 422-464)
- 不要に。`buildUniquePrefilledDevices()` は残す

### 3. [style.css](style.css)

#### 3a. カテゴリタグ追加 (line 241付近)
```css
.card-category-tag  — 小さいバッジ（0.7rem, 角丸4px）
.tag-syringe        — 青系 (#DBEAFE / #1E40AF)
.tag-pen            — 黄系 (#FEF3C7 / #92400E)
.tag-prefilled      — グレー系 (#E2E8F0 / #4A5568)
```

#### 3b. オートコンプリート内カテゴリバッジ
```css
.ac-category        — 小バッジ（0.65rem）
.ac-category-syringe / .ac-category-pen / .ac-category-prefilled
```

#### 3c. 薬剤→デバイス橋渡し表示
```css
.ac-bridge          — 「→ フレックスタッチ」部分の矢印付きスタイル
```

#### 3d. タブサイズ調整（3タブで余裕ができる）
- `.tab`: font-size `0.82rem→0.9rem`, padding `10px 6px→10px 12px`
- レスポンシブ: `0.72rem→0.78rem`, `8px 3px→8px 6px`

---

## データフロー図

```
ユーザー入力「ノボラピッド」
    ↓
getCandidates() で2つを並行検索:
    ├─ allDeviceList (デバイス名マッチ) → ヒットなし
    └─ drugsData (薬剤名マッチ) → ノボラピッド注 (category_id=1, device_name=フレックスタッチ)
    ↓
オートコンプリートに表示:
    「ノボ ノルディスク  ノボラピッド注 → フレックスタッチ」
    ↓
選択 → performSearch():
    category_id=1 + device_model=フレックスタッチ で compatibility.csv 検索
    ↓
結果: BD マイクロファインプラス 32G×4mm [規格適合]
      テルモ ナノパス34 34G×4mm [規格適合]
      ニプロ ニプロペンニードル 32G×4mm [規格適合]
```

---

## エッジケース

| ケース | 対応 |
|--------|------|
| 薬剤名が複数デバイスにマッチ | 例: ノボラピッド注→フレックスタッチ（ペン）とペンフィル（カートリッジ）。各候補を別々に表示 |
| プレフィルドの薬剤選択 | category_id でプレフィルドにマッチ→一体型カード表示 |
| デバイス名と薬剤名が同時マッチ | デバイス候補を優先表示、その後に薬剤候補を表示（最大10件制限内） |
| バイアル製剤（ヒューマリンR バイアル等） | 注射器タブのデバイスと組み合わせ。category_id=1でpenDataにのみマッチする場合、注射器用バイアルは一般的な注射器+針が必要と注記 |

## 検証手順

1. `python -m http.server 8000` で起動
2. **注射デバイス→針**: 「テルモ」→ テルモシリンジ選択 → 互換針表示
3. **注射デバイス→針**: 「ノボラピッド」→ 薬剤候補表示 → 選択 → フレックスタッチ互換針表示 ★新機能
4. **注射デバイス→針**: 「ヒュミラ」→ プレフィルド薬剤候補 → 一体型カード表示
5. **注射デバイス→針**: 「フレックスタッチ」→ デバイス名で直接マッチ → 互換針表示
6. **針→注射デバイス**: 針選択 → 注射器・ペン型横断で互換デバイス表示
7. **薬剤から検索**: 既存動作維持
8. カテゴリタグ表示確認
9. レスポンシブ（600px以下）確認
