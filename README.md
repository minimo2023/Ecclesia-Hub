# Ecclesia Hub 開發根目錄

`D:\Ecclesia-Hub\開發` 是唯一的開發根目錄；外層 `D:\Ecclesia-Hub` 只用來區分「開發」與「舊檔」。所有建置、測試、Docker 與部署指令都應在本目錄執行。

## 開發內容

- `Bible Millionaire Quiz/`：桌機版、手機版、經文工具、後端與部署程式。
- `steward-ops/`：XIT 排班子系統。
- `platform/`：結構、編碼、生產基準與可開發性驗證。
- `data/`、`uploads/`：本機執行與資料遷移所需的保留資料，不是前端原始碼。
- `doc/`：作業方針、對齊與驗證報告。
- 根目錄的 `package*.json`、Docker、nginx 與 `.env*`：開發、測試與部署入口。

## 舊檔

`D:\Ecclesia-Hub\舊檔` 只保留有明確追溯或還原價值的成品與快照，不參與建置、測試或部署，也不得作為後續開發來源。

## 常用指令

- `npm run dev`：啟動桌機前端。
- `npm run dev:mobile`：啟動手機前端。
- `npm run server`：啟動後端。
- `npm run verify:all`：執行完整驗證。
- `npm run deploy:package`：重新建置一份當下原始碼的部署包。
