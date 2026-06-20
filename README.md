# 収支トラッカー

競馬・株・パチンコ等の収支を **自由タグで層別** に記録・集計するスマホ向け PWA。
サーバー不要・オフライン動作・データは端末内（IndexedDB）に保存。

## 特徴
- **タグで層別集計**: 1記録に複数タグ（例: `競馬, 中山, 単勝`）を付け、タグ別の収支・回収率・件数を自動集計
- **期間切替**: 全期間 / 月 / 年で絞り込み、前後ナビで移動
- **収支ダッシュボード**: 投資・回収・収支・回収率と、タグ別の収支バー
- **オフライン**: Service Worker でキャッシュ。ホーム画面に追加してアプリのように使える
- **バックアップ**: JSON で書き出し / 読み込み（端末内のみ保存のため定期バックアップ推奨）
- 金額は浮動小数の誤差を避けるため **整数（円）** で保持

## 構成
```
shushi-tracker/
├── index.html              画面
├── css/styles.css          スタイル（ダーク・モバイル最適化）
├── js/db.js                IndexedDB ラッパ
├── js/app.js               アプリ本体（集計・描画・入力）
├── manifest.webmanifest    PWA マニフェスト
├── sw.js                   Service Worker（オフライン）
└── icons/                  アイコン（192/512/maskable）
```

## 使い方（ローカル確認）
Service Worker は `http(s)` か `localhost` でのみ動くため、簡易サーバーで配信する。

```powershell
cd C:\Users\kaito\Documents\claude-code\shushi-tracker
python -m http.server 8000
```
ブラウザで `http://localhost:8000` を開く。

### スマホで使う
1. 同一 LAN の PC で上記サーバーを起動（`python -m http.server 8000`）
2. スマホのブラウザで `http://<PCのIP>:8000` を開く
   - ※ Service Worker / インストールは https か localhost が必要。LAN の生 IP(http) ではインストール不可な場合あり
3. 常用するなら GitHub Pages 等の **https 配信** に置くと「ホーム画面に追加」でアプリ化できる

## データモデル（IndexedDB: `entries`）
| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 主キー（作成時刻ベース） |
| `date` | string | `YYYY-MM-DD`（JST） |
| `stake` | number | 投資額（整数・円） |
| `return` | number | 回収額（整数・円） |
| `tags` | string[] | 自由タグ |
| `memo` | string | メモ（任意） |

収支 = `return - stake`、回収率 = `return / stake × 100`。

## クレジット
- アイコンの四つ葉グラフィックは [OpenMoji](https://openmoji.org/)（CC BY-SA 4.0）を使用し、金貨・背景は本プロジェクトで描画・合成。

## 今後の候補
- グラフ（推移の折れ線）
- タグの複数条件フィルタ（AND/OR）
- カテゴリ色分け
- CSV エクスポート
