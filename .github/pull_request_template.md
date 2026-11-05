## 變更內容

<!-- 新增或修改了哪些資料集、課程或頁面？ -->

## 檢查清單

- [ ] **授權證據**：每筆資料的 `license.evidence` 有網址、檢查日期，以及授權條款的原文引文；不清楚時用 `NOASSERTION` 並設為 `link-only`。
- [ ] **與臺灣的關係**：`taiwan_relevance` 有依據（basis）與一句中文說明。
- [ ] **個人資料審查**：`personal_data.level` 已依內容治理規則判斷並填上 `reviewed_on`；`private-individuals` 與 `sensitive` 不託管檔案。
- [ ] 新的識別碼已附加到 `catalog/ids.lock` 末尾（不要修改既有的行）。
- [ ] 已發布的版本清單（`catalog/versions/`）沒有被修改；更正請發布新版本。
- [ ] 課程的每一次開課都有 `evidence_url` 與 `verified_on`。
- [ ] 視需要在 `catalog/search-gold.yaml` 新增查詢。
- [ ] `pnpm test` 通過。
