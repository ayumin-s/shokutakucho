# 食卓帖（Shokutaku-cho）申し送り

個人用の食事記録アプリ。iPhoneでのPWA利用が主。GitHub Pagesで公開し、Supabaseをバックエンドに使う。

---

## 1. 構成

| 項目 | 内容 |
|---|---|
| リポジトリ | `github.com/ayumin-s/shokutakucho` |
| 公開URL | `https://ayumin-s.github.io/shokutakucho/` |
| ローカル | `~/Downloads/Develop/shokutakucho` |
| ファイル | `index.html`（骨格とCSS）、`shokutakucho_app.js`（ロジック） |
| バックエンド | Supabase（Auth / PostgreSQL / RLS） |
| 認証 | Supabase Auth（メール＋パスワード、bcrypt） |

**制約**

- HTMLは `index.html` 固定。GitHub Pagesがトップページとして探す名前のため変更不可
- JSのファイル名は自由だが、`index.html` の `<script src>` と一致させること
- 依存はCDNから直接読み込み（ビルド工程なし）。`https://esm.sh/@supabase/supabase-js@2`
- `shokutakucho_app.js` 冒頭に `SUPABASE_URL` と `SUPABASE_ANON_KEY` をベタ書き。publishableキーなので公開して問題ない（RLSで保護）。secretキーは絶対に置かない

---

## 2. データベース

### profiles（利用者）
`id, email, display_name, status, is_admin, created_at`

- `status` は `pending` / `approved` / `blocked`
- 新規登録時、トリガー `handle_new_user()` が自動で1行作る
- `ayu.carnation@gmail.com` のみトリガー内で承認済み・管理者として作られる（**ハードコード**）
- 承認されるまで、自分の記録すら作成できない

### shares（共有許可）
`id, owner_id, viewer_id, share_table, share_shops, status, requested_by`

- 一方通行。相互に見るには2行必要
- `share_table` / `share_shops` で範囲を個別制御
- `status` は `pending`（申請中）/ `active`
- `requested_by` は `owner`（招待）/ `viewer`（申請）

### shops（お店）
`id, user_id, name, scenes[], area, memo, url, photo, photos, tags, priority, state, created_at`

- `scenes` は `morning/lunch/cafe/dinner/drinks/special` のtext配列。**1つ以上必須**
- `priority` は `now` / `soon` / `someday`
- `state` は `wish` / `visited` / `archived`
- `photos` はjsonb配列 `[{src, pos}]`。`pos` はCSSのobject-position文字列
- `photo`（単数）は旧列。移行のため残置。新規保存時も1枚目を書いている

### meals（食卓の記録）
`id, user_id, kind, title, date, shop_id, memo, url, tags, rating, photo, photos, created_at`

- `kind` は `cooked` / `tasted`
- `shop_id` は任意。`on delete set null`（店を消しても記録は残る）
- 写真の扱いはshopsと同じ

### RLSの考え方

判定用の関数を3つ用意し、全ポリシーがこれを参照する。

- `is_approved()` — 承認済みか
- `is_admin()` — 管理者か
- `can_view(target, kind)` — その人の記録を見る許可があるか

読み取り条件は `(自分 and 承認済み) or 共有許可あり`、書き込み条件は `自分 and 承認済み`。判定はすべてDB側で完結するので、クライアントを改変しても突破できない。

**旧 `entries` テーブルが残っている。** 移行済みなので、動作確認後に削除してよい。

---

## 3. アプリの構造

単一ページ。`show(view)` でセクションの表示を切り替える。

| view | 内容 |
|---|---|
| `authView` | ログイン・新規登録 |
| `pendingView` | 承認待ち |
| `tableView` | 食卓（記録の時系列） |
| `shopsView` | お店一覧 |
| `menuView` | メンバー承認、共有設定、バックアップ |
| `formView` | 記録・お店の入力（共用） |
| `detailView` | お店の詳細と訪問履歴 |

グローバル状態は `S` オブジェクト1つに集約。

### 主要な流れ

- **起動** `start()` → セッション確認 → profiles取得 → 承認判定 → `loadOwners()` → `loadData()`
- **持ち主切替** `S.owner` を変えて再読込。`isMine()` が false の時は編集UIを全て隠す
- **訪問記録** 記録保存時、`kind==='tasted'` かつ `shop_id` があり、その店が `wish` なら `visited` に更新
- **記録から店を新規作成** `S.mealCache` に入力中の内容を退避 → 店フォーム → 保存後に復元して紐づけ
- **共有テキスト** 選んだ店を整形してクリップボードまたはWeb Share APIへ

### 注意している実装

- **検索欄**：`compositionstart/end` を見て日本語変換中は絞り込まない。また一覧部分（`#tList` / `#sList`）だけを差し替え、入力欄自体は再生成しない。ここを普通に書き直すと日本語入力が壊れる
- **写真**：`compress()` で長辺760px・品質0.62のJPEGに変換してからbase64で保存。DBに直接入れているので、無料枠500MBを消費する。将来的にSupabase Storageへ移す余地あり
- **マップURL**：`mapUrl(shop)` がURL未入力時に店名＋エリアからGoogle Maps検索URLを生成する

---

## 4. デザイン

| 用途 | 値 |
|---|---|
| 背景 | `#FFFFFF` |
| 差し色 | `#2F5D8A`（紺青、変数名は `--rose` のまま。命名が実態とズレている） |
| 淡色 | `#8FA6BC` |
| 文字 | `#1B2430` / 副次 `#3E4A59` / 補助 `#7F8FA1` |
| 罫線 | `#D7DFE8` / `#E6ECF2` |

- 欧文見出し：Jost（字間広め、weight 400〜500）
- 手書きアクセント：Parisienne（`now` / `soon` / `someday` の優先度表示、タグライン）
- 本文：Zen Kaku Gothic New
- 角丸はほぼ使わない。直線的で余白を広く取る方針
- スマホ主体のため本文14px以上を維持すること（一度細くしすぎて読みにくいと指摘を受けている）

---

## 5. 未対応・懸案

- **新規ユーザーの登録が失敗する。** Supabaseのメール確認が有効なままの可能性が高い。Authentication → Sign In / Providers → Email の「Confirm email」をオフにするのが解決策。未検証
- 管理者メールが `setup.sql` のトリガー内にハードコードされている。他人を管理者にするならSQLの修正が必要
- 写真をbase64でDBに保存しているため、枚数が増えると容量を圧迫する
- GoogleマップのURLから店名を取得することは不可（短縮URLの解決とCORSの制約）。地図上への一括表示にはMaps APIの契約が必要
- エリアは自己申告の文字列。座標を持たないため距離での絞り込みは不可
- 共有相手を探す際、相手が登録・承認済みでないとメールアドレスで見つからない

---

## 6. 作業手順

```bash
cd ~/Downloads/Develop/shokutakucho
git pull                    # 作業前に必ず
# 編集
git add -A
git commit -m "変更内容"
git push                    # 1〜2分でGitHub Pagesに反映
```

認証はトークンをremote URLに埋め込み済み。`git push` のみで通る。

DBを変更する場合は、SQLファイルを作ってSupabaseのSQL Editorで実行する。`create table if not exists` や `add column if not exists` を使い、再実行しても安全な形で書くこと。

---

## 7. 対話の進め方

- UIの変更は、実装前に複数案を見せて選んでもらう形が定着している
- 技術的にできないことは、代替案とセットで正直に伝える
- gitやSupabaseの操作は逐次案内が必要。専門用語には短い説明を添える
