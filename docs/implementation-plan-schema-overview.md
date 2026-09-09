# Data Schema Overview / Documentation freshness 実装計画

作成日: 2026-09-09。`git pull --ff-only` で main を `3d3812c` に更新し、PR #9 が merged、PR #8 `Compact schema browser cards` が open であることを確認済み。

## 成果物とPR構成

1. 既存 PR #8（`compact-schema-browser-cards`）を更新し、カード簡素化と3タブ化をまとめる。
2. freshness を別PRとして実装する。並行レビューする場合は #8 ブランチをbaseにした stacked PRとし、#8 merge後にmainへ付け替える。順次実施する場合は #8 merge後のmainから作成する。新PR番号は作成時に確定する。
3. 両PRのCI、Pages artifact、実公開サイトをそれぞれ検証する。

## Phase 1: Overviewの情報設計

### ベース更新とカード

- #8の既存ブランチに最新mainを取り込む。既存PRは作り直さない。
- `docs/schema-browser.js` / `docs/schema-core.js` の既存変更を維持する。overviewはStatus行を省略し、canonical / proposed v2-alpha.1 badgeは残す。
- dependencyはURL解決後にfragmentを除いたdocument identityで比較し、同じschemaへの参照を除外する。別schemaへの参照は同じサイト内でも表示する。
- 個別viewerの詳細Statusと全Referencesは維持する。
- PR #9のImageRepresentationUseV1、diagram、責務説明、proposal manifest収録を回帰テストで保護する。

### 3タブ化

- `docs/index.html` を `schemas`、`architecture`、`responsibilities` の3 sectionに再配置する。
- Schema Browser: schema cards、loading/error status、detail/sourceへの入口。
- Schema Architecture: 既存SVG、ByteSequence model、fragment説明、technical/contextual separation。現在Responsibilitiesの末尾にあるMetadata axes説明もここへ移す。
- Responsibilities: 既存責務tableと必要最小限の導入。
- headerは見出しと短い説明を残し、長い設計説明はArchitectureへ移す。freshnessの場所はheader直下とする。
- 独立した `docs/schema-tabs.js` を追加し、manifest取得の成否に依存せず初期化する。builderの公開allowlistに追加する。
- 初期値はSchema Browser。`#schemas` / `#architecture` / `#responsibilities` と選択状態を同期し、hashchangeで戻る・進むを反映する。不正hashはBrowser表示へfallbackする。
- HTMLでは全sectionを表示し、初期化成功後のみタブ化・非選択panelの非表示を適用する。no-JSでも設計説明と表を読める状態を維持する。既存の動的カードにはmanifestへのnoscriptリンクを残す。
- tablist/tab/tabpanel、aria-selected、aria-controls、aria-labelledby、roving tabindexを実装。左右矢印・Home・Endでキーボード操作できるようにする。
- `docs/schema.css` で選択状態、フォーカス、狭い画面のタブ表示を整える。

### 検証と完了条件

- DOM上で3タブ、default、direct link、reload相当の再初期化、invalid hash、hash履歴、キーボード操作を確認。
- Browserにdiagram/tableが混ざらず、Architectureにdiagram・ByteSequence・Metadata axesが存在することを確認。
- JS無効のHTMLで全説明と表にアクセスできることを確認。
- 既存overviewカード回帰テストとImageRepresentationUseV1のテストを実行。
- `bun run check` とPages builder/artifactチェックを通す。Pages workflowのテスト対象を新規overviewテストにも広げる。
- versionは `src/version.ts` のみで管理。mainの1.0.76に対して既存PRは1.0.77を予定しているため、最終変更時にブランチの値を確認してpatchを更新する。

## Phase 2: 表示中deploymentの識別とfreshness

### Build identity

- `scripts/build-schema-docs.mjs` でbuild開始時にrevisionとbuiltAtを一度だけ確定する。
- PagesではGITHUB_SHAを明示的に渡す。ローカルはrevision `local`。builtAtはUTC ISO日時。
- `_site/site-version.json` と3ページのmeta tag、および生成SWのcache名に同じidentityを使用する。
- 同一commitの再デプロイはrevisionが同じになるため、deployment識別にはbuiltAtも含める。cache名もrevisionとbuild時刻に由来する識別子を使う。
- builderの公開allowlistへ共通freshness module等を追加する。生成物に置換前placeholderが残らないことを検証する。

### 共通indicator

- `docs/documentation-freshness.js` を追加し、index/schema/sourceのheaderに共通表示する。表示中の短縮revision、相対build時刻、titleの絶対日時と完全revisionを提供する。
- 起動時は「確認中」、ネットワーク検証成功かつidentity一致時のみ「最新版」とする。
- 不一致は「新しい公開版があります — 再読み込み」。通信失敗は「Offline copy / 最新版を確認できません」。HTTPエラーや不正JSONも最新版とは表示しない。
- local buildは「ローカル版」として公開版と区別する。無効日時や欠損metadataでも例外でUI全体を壊さない。
- Intl.RelativeTimeFormatで経過時間を表示し、1分ごとに更新。builtAtはビルド日時であり、公開完了日時とは呼ばない。
- 初回loadに加え、online復帰、タブが再表示された時、可視状態での低頻度確認で新deploymentを検出する。同時リクエストをまとめ、タイムアウトを設ける。

### SWとキャッシュ

- 対象はdocsのSWだけ。アプリ側Vite PWA、IndexedDB、production offline lifecycleには変更しない。devOptions.enabledはfalseを維持。
- `docs/service-worker-register.js`: updateViaCache none、load時のupdateを実装する。生成済み公開docsのtop-levelページに限定し、preview iframeでは登録・自動reloadを行わない。
- `docs/service-worker.js`: deployment別cache、install完了後skipWaiting、activateで同prefixの旧cacheだけ削除しclients.claimする。
- HTML、JS/CSS、manifest、schema/source JSONはnetwork-firstとし、ネットワークrequestのHTTP cacheをbypassする。offline fallbackは現在のcache名からのみ取得する。Cache Storage書き込み失敗で成功したネットワーク応答を捨てない。
- site-version.jsonはネットワーク専用とし、precache・runtime cache・offline fallbackから除外する。ページ側no-storeだけではSWによる旧応答を防げない点に注意する。
- 初回導入時の既存SWは旧ルールでJSONをcacheし得るため、版確認requestには毎回異なるqueryも付ける。新SWへの更新失敗も検証未完了として扱う。

### ループしない回復

- 表示identityと取得identityが異なるときのみ自動回復候補とする。controllerchangeでは自動reloadしない。
- sessionStorageに自動回復実施をreloadより先に記録し、同じタブのsessionで自動reloadは最大1回とする。保存できない場合も手動警告へfallbackする。
- 新workerの適用を期限付きで待ってからreloadする。待機失敗時は警告に留める。hash/queryを保持する。
- reload後も不一致なら警告と手動再読み込み操作を残す。手動操作でも自動回復上限を解除しない。
- rollbackで古いcommitが再公開されても、revisionの新旧順を推測せずdeployment identityの不一致として扱う。

### 検証と完了条件

- 一致、不一致、offline、HTTP失敗、不正metadata、local、時刻境界、online復帰、可視化時再確認を検証。
- sessionStorage拒否、reload後も不一致、worker更新失敗、preview iframeでのreload抑止を検証。
- SWのnetwork優先、metadataのnetwork専用経路、cache書き込み失敗、旧cache削除のscope、offline fallbackを動作テストする。
- 一時build先でmetadataを固定し、3ページ・JSON・SWのidentity一致、必要ファイル存在、schemaのbyte単位保持を検証する。テスト間で_siteの削除・書き込みが競合しないようにする。
- `bun run check`、Pagesテストとartifact検査を通し、独立したpatch version更新を行う。

## Phase 3: 公開受け入れ

- Pages upload前にindex.html、schema.html、source.html、site-version.json、service-worker.jsと新modulesの存在およびidentity一致をチェックする。
- デプロイ成功後、https://takashisasaki.github.io/nfcweb/ で3タブ、初期Browser、direct link、reload、戻る・進むを確認する。
- 全3ページで表示revisionがデプロイartifactと一致し、相対時刻と「最新版」が表示されることを確認する。
- 制御したブラウザ環境で旧版を開いたまま新deploymentへ更新し、hard reloadなしの検出、最大1回の回復、継続stale時の警告を確認する。
- offlineでは最新版と表示せず、利用可能なキャッシュの内容が閲覧できることを確認する。
- 公開環境で新旧deploymentの切替を試せない場合は、それを未検証として明記し、ローカルの2-build更新テスト結果と区別する。
- #8とfreshness PRは別々にreview/mergeする。freshnessの切り戻しは、旧workerへの単純revertだけで既存clientが直ると仮定せず、修正版workerの公開と既存tabでの更新確認まで行う。

## 現在の進捗

- 完了: 最新mainのpull、PR #8/#9の状態確認、builder・UI・SW・Pages workflow・既存テストの調査、実装計画の作成。
- Phase 1完了: PR #8をmainへmerge（8046760）。GitHub CIとPages deploymentが成功。
- Phase 2実装・ローカル検証済み: 全179テスト、型検査、productionビルド、artifact identity検査が成功。ブラウザで最新版・時刻・revision表示を確認。
- Phase 2はPR #10をmerge（4f41354）、公開metadataの反映を確認。
- 公開受け入れで旧HTTPキャッシュのmodule interface混在を検出し、HTMLと全static importのasset URLにもdeployment identityを付ける追加修正を実装。artifact検査と回帰テストで保護する。
- ローカルの開いたままの旧版は定期確認により新revisionへ自動回復できることをブラウザで確認済み。
- 残り: asset identity追加修正のCI・merge・公開受け入れ。
